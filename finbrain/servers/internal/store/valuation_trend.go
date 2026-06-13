package store

import (
	"context"
	"time"
)

// TrendPoint is one cross-section of net worth (§6.5). Money fields are decimal
// strings in the requested display currency.
type TrendPoint struct {
	Date             string `json:"date"`
	NetWorth         string `json:"net_worth"`
	TotalAssets      string `json:"total_assets"`
	TotalLiabilities string `json:"total_liabilities"`
	CashValue        string `json:"cash_value"`
	PositionValue    string `json:"position_value"`
}

type TrendSeries struct {
	From            string       `json:"from"`
	To              string       `json:"to"`
	Granularity     string       `json:"granularity"`
	DisplayCurrency string       `json:"display_currency"`
	FxMode          string       `json:"fx_mode"`
	Points          []TrendPoint `json:"points"`
}

// netWorthAt computes the §6.1–6.4 cross-section totals at onDate (snapshot
// interpolation per §6.14; no trade replay — the daily curve is snapshot-based).
func (s *Store) netWorthAt(ctx context.Context, onDate, displayCurrency, fxMode string) (TrendPoint, error) {
	fx := &fxResolver{store: s, ctx: ctx, mode: fxMode, onDate: onDate, cache: map[string]fxResult{}}
	cash := decZero
	positions := decZero
	liabilities := decZero

	cashRows, err := s.currentCashRows(ctx, onDate)
	if err != nil {
		return TrendPoint{}, err
	}
	for _, c := range cashRows {
		bal, err := decimalFromString(c.Balance)
		if err != nil {
			return TrendPoint{}, err
		}
		res, err := fx.resolve(c.AccountCurrency, displayCurrency)
		if err != nil {
			return TrendPoint{}, err
		}
		cash = cash.Add(bal.Mul(res.Rate))
	}

	posRows, err := s.currentPositionRows(ctx, onDate)
	if err != nil {
		return TrendPoint{}, err
	}
	for _, p := range posRows {
		qty, err := decimalFromString(p.Quantity)
		if err != nil {
			return TrendPoint{}, err
		}
		if !qty.GreaterThan(decZero) || p.Price == nil || p.PriceCurrency == nil {
			continue // missing price → excluded from totals (§6.2)
		}
		costCurrency := firstNonEmpty(ptrValue(p.CostCurrency), ptrValue(p.QuoteCurrency), p.AccountCurrency)
		price, err := decimalFromString(*p.Price)
		if err != nil {
			return TrendPoint{}, err
		}
		priceToCost, err := fx.resolve(*p.PriceCurrency, costCurrency)
		if err != nil {
			return TrendPoint{}, err
		}
		displayFx, err := fx.resolve(costCurrency, displayCurrency)
		if err != nil {
			return TrendPoint{}, err
		}
		mv := qty.Mul(price.Mul(priceToCost.Rate)).Mul(displayFx.Rate)
		positions = positions.Add(mv)
	}

	liabRows, err := s.currentLiabilityRows(ctx, onDate)
	if err != nil {
		return TrendPoint{}, err
	}
	for _, l := range liabRows {
		amt, err := decimalFromString(l.AmountTotal)
		if err != nil {
			return TrendPoint{}, err
		}
		res, err := fx.resolve(l.Currency, displayCurrency)
		if err != nil {
			return TrendPoint{}, err
		}
		liabilities = liabilities.Add(amt.Mul(res.Rate))
	}

	assets := cash.Add(positions)
	return TrendPoint{
		Date:             onDate,
		NetWorth:         formatMoneyDecimal(assets.Sub(liabilities)),
		TotalAssets:      formatMoneyDecimal(assets),
		TotalLiabilities: formatMoneyDecimal(liabilities),
		CashValue:        formatMoneyDecimal(cash),
		PositionValue:    formatMoneyDecimal(positions),
	}, nil
}

// NetWorthTrend computes a net-worth cross-section at each section date in
// [from, to] for the granularity (day|month|quarter|year), per §6.5.
func (s *Store) NetWorthTrend(ctx context.Context, from, to, granularity, displayCurrency, fxMode string) (TrendSeries, error) {
	loc := time.UTC
	fromT, err := time.ParseInLocation("2006-01-02", from, loc)
	if err != nil {
		return TrendSeries{}, err
	}
	toT, err := time.ParseInLocation("2006-01-02", to, loc)
	if err != nil {
		return TrendSeries{}, err
	}
	if toT.Before(fromT) {
		fromT, toT = toT, fromT
	}
	dates := sectionDates(fromT, toT, granularity)
	out := TrendSeries{From: from, To: to, Granularity: granularity, DisplayCurrency: displayCurrency, FxMode: fxMode, Points: []TrendPoint{}}
	for _, d := range dates {
		pt, err := s.netWorthAt(ctx, d.Format("2006-01-02"), displayCurrency, fxMode)
		if err != nil {
			return TrendSeries{}, err
		}
		out.Points = append(out.Points, pt)
	}
	return out, nil
}

// sectionDates enumerates cross-section dates. Daily ranges over ~370 days fall
// back to monthly to bound the point count (§6.14 perf note).
func sectionDates(from, to time.Time, gran string) []time.Time {
	if gran == "day" && to.Sub(from) > 370*24*time.Hour {
		gran = "month"
	}
	var out []time.Time
	switch gran {
	case "day":
		for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
			out = append(out, d)
		}
	case "quarter":
		out = periodEnds(from, to, 3)
	case "year":
		out = periodEnds(from, to, 12)
	default: // month
		out = periodEnds(from, to, 1)
	}
	if len(out) == 0 || !out[len(out)-1].Equal(to) {
		out = append(out, to)
	}
	return out
}

// periodEnds returns the last day of each N-month period that ends within
// [from, to]. It steps on the first-of-period (always day 1) to avoid the
// month-end + AddDate overflow that skips short months.
func periodEnds(from, to time.Time, months int) []time.Time {
	var out []time.Time
	startMonth := ((int(from.Month())-1)/months)*months + 1 // 1-based first month of from's period
	cur := time.Date(from.Year(), time.Month(startMonth), 1, 0, 0, 0, 0, from.Location())
	for {
		end := cur.AddDate(0, months, 0).AddDate(0, 0, -1) // last day of this period
		if end.After(to) {
			break
		}
		if !end.Before(from) {
			out = append(out, end)
		}
		cur = cur.AddDate(0, months, 0) // first-of-next-period: safe (day stays 1)
	}
	return out
}

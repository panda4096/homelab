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

// netWorthAt computes the §6.1–6.4 cross-section totals at onDate using the
// same valuation engine as the current dashboard so transaction replay, pricing,
// liabilities, and FX handling stay consistent across current and trend views.
func (s *Store) netWorthAt(ctx context.Context, userID int64, onDate, displayCurrency, fxMode string) (TrendPoint, error) {
	val, err := s.GetValuation(ctx, userID, onDate, displayCurrency, fxMode, onDate)
	if err != nil {
		return TrendPoint{}, err
	}
	return TrendPoint{
		Date:             onDate,
		NetWorth:         val.NetWorth,
		TotalAssets:      val.TotalAssets,
		TotalLiabilities: val.TotalLiabilities,
		CashValue:        val.CashValue,
		PositionValue:    val.PositionValue,
	}, nil
}

// NetWorthTrend computes a net-worth cross-section at each section date in
// [from, to] for the granularity (day|month|quarter|year), per §6.5.
func (s *Store) NetWorthTrend(ctx context.Context, userID int64, from, to, granularity, displayCurrency, fxMode string) (TrendSeries, error) {
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
		pt, err := s.netWorthAt(ctx, userID, d.Format("2006-01-02"), displayCurrency, fxMode)
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

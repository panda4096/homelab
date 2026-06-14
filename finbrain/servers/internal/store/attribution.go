package store

import (
	"context"
	"fmt"

	"github.com/shopspring/decimal"
)

// AttributionResult decomposes the net-worth change over a period into four
// buckets (§6.12). fx_effect is the residual, so the four always sum to net_change.
type AttributionResult struct {
	From            string `json:"from"`
	To              string `json:"to"`
	DisplayCurrency string `json:"display_currency"`
	NetChange       string `json:"net_change"`
	PriceEffect     string `json:"price_effect"`
	QuantityEffect  string `json:"quantity_effect"`
	IncomeEffect    string `json:"income_effect"`
	FxEffect        string `json:"fx_effect"`
}

type posUnit struct {
	qty           decimal.Decimal
	price         decimal.Decimal // per-unit native price
	priceCurrency string
	hasPrice      bool
}

type cashUnit struct {
	amount   decimal.Decimal
	currency string
}

func (s *Store) positionUnits(ctx context.Context, onDate string) (map[string]posUnit, error) {
	rows, err := s.currentPositionRows(ctx, onDate)
	if err != nil {
		return nil, err
	}
	out := map[string]posUnit{}
	for _, p := range rows {
		if _, _, err := s.applyReplayToPositionRow(ctx, &p, onDate); err != nil {
			return nil, err
		}
		qty, err := decimalFromString(p.Quantity)
		if err != nil {
			return nil, err
		}
		if !qty.GreaterThan(decZero) {
			continue
		}
		pu := posUnit{qty: qty}
		if p.Price != nil && p.PriceCurrency != nil {
			pu.price = mustDec(*p.Price)
			pu.priceCurrency = *p.PriceCurrency
			pu.hasPrice = true
		}
		out[fmt.Sprintf("%d|%s", p.AccountID, p.Symbol)] = pu
	}
	return out, nil
}

func (s *Store) cashUnits(ctx context.Context, onDate string) (map[int64]cashUnit, error) {
	rows, err := s.currentCashRows(ctx, onDate)
	if err != nil {
		return nil, err
	}
	out := map[int64]cashUnit{}
	for _, c := range rows {
		out[c.AccountID] = cashUnit{amount: mustDec(c.Balance), currency: c.AccountCurrency}
	}
	return out, nil
}

func unitDisplay(p posUnit, fx *fxResolver, display string) (decimal.Decimal, error) {
	if !p.hasPrice {
		return decZero, nil
	}
	res, err := fx.resolve(p.priceCurrency, display)
	if err != nil {
		return decZero, err
	}
	return p.price.Mul(res.Rate), nil
}

func cashDisplayValue(c cashUnit, fx *fxResolver, display string) (decimal.Decimal, error) {
	res, err := fx.resolve(c.currency, display)
	if err != nil {
		return decZero, err
	}
	return c.amount.Mul(res.Rate), nil
}

func (s *Store) incomeInWindow(ctx context.Context, from, to, display string, fx *fxResolver) (decimal.Decimal, error) {
	rows, err := s.pool.Query(ctx, `SELECT amount::text, currency FROM income_events WHERE event_date > $1::date AND event_date <= $2::date`, from, to)
	if err != nil {
		return decZero, err
	}
	defer rows.Close()
	total := decZero
	for rows.Next() {
		var amt, ccy string
		if err := rows.Scan(&amt, &ccy); err != nil {
			return decZero, err
		}
		res, err := fx.resolve(ccy, display)
		if err != nil {
			return decZero, err
		}
		total = total.Add(mustDec(amt).Mul(res.Rate))
	}
	return total, rows.Err()
}

// PeriodAttribution decomposes net-worth change in (from, to] (§6.12).
// Historical mode separates beginning-position/cash FX movement before adding
// the residual to fx_effect so the four buckets still sum to net_change.
func (s *Store) PeriodAttribution(ctx context.Context, from, to, display, fxMode string) (AttributionResult, error) {
	fxFrom := &fxResolver{store: s, ctx: ctx, mode: fxMode, onDate: from, cache: map[string]fxResult{}}
	fxTo := &fxResolver{store: s, ctx: ctx, mode: fxMode, onDate: to, cache: map[string]fxResult{}}

	nwFrom, err := s.netWorthAt(ctx, from, display, fxMode)
	if err != nil {
		return AttributionResult{}, err
	}
	nwTo, err := s.netWorthAt(ctx, to, display, fxMode)
	if err != nil {
		return AttributionResult{}, err
	}
	netChange := mustDec(nwTo.NetWorth).Sub(mustDec(nwFrom.NetWorth))

	fromPos, err := s.positionUnits(ctx, from)
	if err != nil {
		return AttributionResult{}, err
	}
	toPos, err := s.positionUnits(ctx, to)
	if err != nil {
		return AttributionResult{}, err
	}

	price := decZero
	qtyEff := decZero
	explicitFx := decZero
	keys := map[string]bool{}
	for k := range fromPos {
		keys[k] = true
	}
	for k := range toPos {
		keys[k] = true
	}
	for k := range keys {
		f := fromPos[k]
		t := toPos[k]
		if !t.hasPrice {
			t.price = f.price // no end price → treat price as flat
			t.priceCurrency = f.priceCurrency
			t.hasPrice = f.hasPrice
		}
		if !f.hasPrice {
			f.price = t.price
			f.priceCurrency = t.priceCurrency
			f.hasPrice = t.hasPrice
		}
		if !f.hasPrice && !t.hasPrice {
			continue
		}
		fUnitTo, err := unitDisplay(f, fxTo, display)
		if err != nil {
			return AttributionResult{}, err
		}
		tUnitTo, err := unitDisplay(t, fxTo, display)
		if err != nil {
			return AttributionResult{}, err
		}
		price = price.Add(f.qty.Mul(tUnitTo.Sub(fUnitTo)))
		qtyEff = qtyEff.Add(t.qty.Sub(f.qty).Mul(tUnitTo))
		if fxMode == "historical" {
			fUnitFrom, err := unitDisplay(f, fxFrom, display)
			if err != nil {
				return AttributionResult{}, err
			}
			explicitFx = explicitFx.Add(f.qty.Mul(fUnitTo.Sub(fUnitFrom)))
		}
	}

	fromCash, err := s.cashUnits(ctx, from)
	if err != nil {
		return AttributionResult{}, err
	}
	toCash, err := s.cashUnits(ctx, to)
	if err != nil {
		return AttributionResult{}, err
	}
	cashKeys := map[int64]bool{}
	for k := range fromCash {
		cashKeys[k] = true
	}
	for k := range toCash {
		cashKeys[k] = true
	}
	for k := range cashKeys {
		f, fOK := fromCash[k]
		t, tOK := toCash[k]
		fromAtTo := decZero
		fromAtFrom := decZero
		toAtTo := decZero
		if fOK {
			var err error
			fromAtTo, err = cashDisplayValue(f, fxTo, display)
			if err != nil {
				return AttributionResult{}, err
			}
			if fxMode == "historical" {
				fromAtFrom, err = cashDisplayValue(f, fxFrom, display)
				if err != nil {
					return AttributionResult{}, err
				}
			}
		}
		if tOK {
			var err error
			toAtTo, err = cashDisplayValue(t, fxTo, display)
			if err != nil {
				return AttributionResult{}, err
			}
		}
		qtyEff = qtyEff.Add(toAtTo.Sub(fromAtTo))
		if fxMode == "historical" && fOK {
			explicitFx = explicitFx.Add(fromAtTo.Sub(fromAtFrom))
		}
	}

	income, err := s.incomeInWindow(ctx, from, to, display, fxTo)
	if err != nil {
		return AttributionResult{}, err
	}
	residual := netChange.Sub(price).Sub(qtyEff).Sub(income).Sub(explicitFx)
	fxEff := explicitFx.Add(residual)

	return AttributionResult{
		From: from, To: to, DisplayCurrency: display,
		NetChange:      formatMoneyDecimal(netChange),
		PriceEffect:    formatMoneyDecimal(price),
		QuantityEffect: formatMoneyDecimal(qtyEff),
		IncomeEffect:   formatMoneyDecimal(income),
		FxEffect:       formatMoneyDecimal(fxEff),
	}, nil
}

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
	qty      decimal.Decimal
	unit     decimal.Decimal // per-unit price in display currency
	hasPrice bool
}

func (s *Store) positionUnits(ctx context.Context, onDate, display string, fx *fxResolver) (map[string]posUnit, error) {
	rows, err := s.currentPositionRows(ctx, onDate)
	if err != nil {
		return nil, err
	}
	out := map[string]posUnit{}
	for _, p := range rows {
		qty := mustDec(p.Quantity)
		if !qty.GreaterThan(decZero) {
			continue
		}
		pu := posUnit{qty: qty}
		if p.Price != nil && p.PriceCurrency != nil {
			res, err := fx.resolve(*p.PriceCurrency, display)
			if err != nil {
				return nil, err
			}
			pu.unit = mustDec(*p.Price).Mul(res.Rate)
			pu.hasPrice = true
		}
		out[fmt.Sprintf("%d|%s", p.AccountID, p.Symbol)] = pu
	}
	return out, nil
}

func (s *Store) cashDisplay(ctx context.Context, onDate, display string, fx *fxResolver) (map[int64]decimal.Decimal, error) {
	rows, err := s.currentCashRows(ctx, onDate)
	if err != nil {
		return nil, err
	}
	out := map[int64]decimal.Decimal{}
	for _, c := range rows {
		res, err := fx.resolve(c.AccountCurrency, display)
		if err != nil {
			return nil, err
		}
		out[c.AccountID] = mustDec(c.Balance).Mul(res.Rate)
	}
	return out, nil
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

// PeriodAttribution decomposes net-worth change in (from, to] (§6.12):
// price (qty_from × Δunit), quantity (Δqty × unit_to + cash Δ), income (events
// in window), and fx (residual).
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

	fromPos, err := s.positionUnits(ctx, from, display, fxFrom)
	if err != nil {
		return AttributionResult{}, err
	}
	toPos, err := s.positionUnits(ctx, to, display, fxTo)
	if err != nil {
		return AttributionResult{}, err
	}

	price := decZero
	qtyEff := decZero
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
		fUnit, tUnit := f.unit, t.unit
		if !t.hasPrice {
			tUnit = fUnit // no end price → treat price as flat
		}
		if !f.hasPrice {
			fUnit = tUnit
		}
		price = price.Add(f.qty.Mul(tUnit.Sub(fUnit)))
		qtyEff = qtyEff.Add(t.qty.Sub(f.qty).Mul(tUnit))
	}

	fromCash, err := s.cashDisplay(ctx, from, display, fxFrom)
	if err != nil {
		return AttributionResult{}, err
	}
	toCash, err := s.cashDisplay(ctx, to, display, fxTo)
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
		qtyEff = qtyEff.Add(toCash[k].Sub(fromCash[k]))
	}

	income, err := s.incomeInWindow(ctx, from, to, display, fxTo)
	if err != nil {
		return AttributionResult{}, err
	}
	fxEff := netChange.Sub(price).Sub(qtyEff).Sub(income)

	return AttributionResult{
		From: from, To: to, DisplayCurrency: display,
		NetChange:      formatMoneyDecimal(netChange),
		PriceEffect:    formatMoneyDecimal(price),
		QuantityEffect: formatMoneyDecimal(qtyEff),
		IncomeEffect:   formatMoneyDecimal(income),
		FxEffect:       formatMoneyDecimal(fxEff),
	}, nil
}

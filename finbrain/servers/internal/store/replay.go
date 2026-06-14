package store

import (
	"context"
	"encoding/json"
	"sort"

	"github.com/shopspring/decimal"
)

// HoldingState is the replay-derived state for one (account, symbol) as of a date
// (PRD §6.15–6.17). All money fields are in the transaction (native) currency.
type HoldingState struct {
	HasHistory       bool
	Quantity         decimal.Decimal
	WeightedBuyCost  decimal.Decimal // per-share, native
	RealizedPL       decimal.Decimal // native, cumulative
	BuyFeeTotal      decimal.Decimal // native, cumulative
	Currency         string          // native currency of the trades
	HoldingStartDate string          // start of the most recent continuous qty>0 segment
}

// replayEvent is one buy/sell/split/merge/rights in the merged, ordered stream.
type replayEvent struct {
	date     string
	rank     int // 0 = transaction, 1 = corporate action (same-day tie-break: trades first)
	id       int64
	kind     string // buy | sell | split | merge | rights
	quantity decimal.Decimal
	price    decimal.Decimal
	fee      decimal.Decimal
	ratioNum decimal.Decimal
	ratioDen decimal.Decimal
}

type rightsExtra struct {
	RightsPrice    string `json:"rights_price"`
	BaseShareRatio string `json:"base_share_ratio"`
	RightsCurrency string `json:"rights_currency"`
}

// replayHolding folds the ordered event stream onto a seed state. Pure function
// (no I/O) so the §6.15/§6.16/§6.17 math is unit-testable.
func replayHolding(seed HoldingState, events []replayEvent, buyFeeInCost bool) HoldingState {
	st := seed
	st.HasHistory = true
	segmentStart := seed.HoldingStartDate
	if st.Quantity.LessThanOrEqual(decZero) {
		segmentStart = ""
	}
	for _, e := range events {
		switch e.kind {
		case "buy", "rights":
			qty := e.quantity
			if e.kind == "rights" {
				// rights: subscribe holding × base_share_ratio (ratioNum) at price (§6.17)
				qty = st.Quantity.Mul(e.ratioNum)
			}
			if !qty.GreaterThan(decZero) {
				continue
			}
			if st.Quantity.LessThanOrEqual(decZero) {
				segmentStart = e.date
			}
			prevTotal := st.WeightedBuyCost.Mul(st.Quantity)
			addCost := e.price.Mul(qty)
			if buyFeeInCost {
				addCost = addCost.Add(e.fee)
			} else {
				st.BuyFeeTotal = st.BuyFeeTotal.Add(e.fee)
			}
			st.Quantity = st.Quantity.Add(qty)
			if st.Quantity.GreaterThan(decZero) {
				st.WeightedBuyCost = prevTotal.Add(addCost).Div(st.Quantity)
			}
		case "sell":
			realizedPerShare := e.price.Sub(st.WeightedBuyCost)
			st.RealizedPL = st.RealizedPL.Add(realizedPerShare.Mul(e.quantity)).Sub(e.fee)
			st.Quantity = st.Quantity.Sub(e.quantity)
			if st.Quantity.LessThanOrEqual(decZero) {
				segmentStart = ""
			}
			// weighted buy cost unchanged on sell
		case "split", "merge":
			if e.ratioDen.IsZero() {
				continue
			}
			factor := e.ratioNum.Div(e.ratioDen)
			if factor.IsZero() {
				continue
			}
			st.Quantity = st.Quantity.Mul(factor)
			st.WeightedBuyCost = st.WeightedBuyCost.Div(factor)
		}
	}
	st.HoldingStartDate = segmentStart
	return st
}

// ReplayHolding derives the (account, symbol) state as of onDate from transactions
// + corporate actions, seeded by the latest snapshot before the first trade.
// HasHistory is false when there are no transactions (caller falls back to §6.7).
func (s *Store) ReplayHolding(ctx context.Context, userID, accountID int64, symbol, onDate string, buyFeeInCost bool) (HoldingState, error) {
	txnRows, err := s.pool.Query(ctx, `
		SELECT trade_date::text, id, action, quantity::text, price::text, COALESCE(fee, 0)::text, currency
		FROM transactions
		WHERE user_id=$1 AND account_id=$2 AND symbol=$3 AND trade_date <= $4::date /* OWNED transactions */
		ORDER BY trade_date, id`, userID, accountID, symbol, onDate)
	if err != nil {
		return HoldingState{}, err
	}
	defer txnRows.Close()

	var events []replayEvent
	var firstTxnDate, currency string
	for txnRows.Next() {
		var date, action, qty, price, fee, ccy string
		var id int64
		if err := txnRows.Scan(&date, &id, &action, &qty, &price, &fee, &ccy); err != nil {
			return HoldingState{}, err
		}
		if firstTxnDate == "" {
			firstTxnDate = date
			currency = ccy
		}
		events = append(events, replayEvent{
			date: date, rank: 0, id: id, kind: action,
			quantity: mustDec(qty), price: mustDec(price), fee: mustDec(fee),
		})
	}
	if err := txnRows.Err(); err != nil {
		return HoldingState{}, err
	}
	if len(events) == 0 {
		return HoldingState{HasHistory: false}, nil
	}

	caRows, err := s.pool.Query(ctx, `
		SELECT event_date::text, id, action, ratio_numerator::text, ratio_denominator::text,
		       COALESCE(extra, 'null'::jsonb)::text
		FROM corporate_actions
		WHERE symbol=$1 AND event_date <= $2::date
		ORDER BY event_date, id`, symbol, onDate)
	if err != nil {
		return HoldingState{}, err
	}
	defer caRows.Close()
	for caRows.Next() {
		var date, action, num, den, extra string
		var id int64
		if err := caRows.Scan(&date, &id, &action, &num, &den, &extra); err != nil {
			return HoldingState{}, err
		}
		ev := replayEvent{date: date, rank: 1, id: id, kind: action, ratioNum: mustDec(num), ratioDen: mustDec(den)}
		if action == "rights" {
			ev.kind = "rights"
			var rx rightsExtra
			if extra != "" && extra != "null" {
				_ = json.Unmarshal([]byte(extra), &rx)
			}
			ev.price = mustDec(rx.RightsPrice)
			ev.ratioNum = mustDec(rx.BaseShareRatio) // qty applied at replay time
		}
		events = append(events, ev)
	}
	if err := caRows.Err(); err != nil {
		return HoldingState{}, err
	}

	// Seed from the latest snapshot strictly before the first transaction (§6.15).
	seed := HoldingState{Currency: currency}
	var seedQty, seedCost *string
	err = s.pool.QueryRow(ctx, `
		SELECT quantity::text, avg_cost::text
		FROM position_snapshots
		WHERE user_id=$1 AND account_id=$2 AND symbol=$3 AND snapshot_date < $4::date /* OWNED position_snapshots */
		ORDER BY snapshot_date DESC LIMIT 1`, userID, accountID, symbol, firstTxnDate).Scan(&seedQty, &seedCost)
	if err == nil {
		if seedQty != nil {
			seed.Quantity = mustDec(*seedQty)
		}
		if seedCost != nil {
			seed.WeightedBuyCost = mustDec(*seedCost)
		}
	}

	sortReplayEvents(events)
	st := replayHolding(seed, events, buyFeeInCost)
	st.Currency = currency
	return st, nil
}

func sortReplayEvents(events []replayEvent) {
	sort.SliceStable(events, func(i, j int) bool {
		if events[i].date != events[j].date {
			return events[i].date < events[j].date
		}
		if events[i].rank != events[j].rank {
			return events[i].rank < events[j].rank
		}
		return events[i].id < events[j].id
	})
}

func mustDec(s string) decimal.Decimal {
	d, err := decimal.NewFromString(s)
	if err != nil {
		return decZero
	}
	return d
}

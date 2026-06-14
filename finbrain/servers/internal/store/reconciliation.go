package store

import (
	"context"
	"errors"
	"sort"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

// reconThreshold is the default |delta|/|expected| alert threshold (PRD §6.19).
var reconThreshold = decimal.RequireFromString("0.005")

type ReconEvent struct {
	Date    string `json:"date"`
	Kind    string `json:"kind"` // snapshot | buy | sell | transfer_in | transfer_out | income | bill_payment
	Label   string `json:"label"`
	Amount  string `json:"amount"` // signed; "" for the snapshot baseline
	Running string `json:"running"`
}

type PositionDelta struct {
	Symbol           string `json:"symbol"`
	ReplayQuantity   string `json:"replay_quantity"`
	SnapshotQuantity string `json:"snapshot_quantity"`
	Delta            string `json:"delta"`
}

type AccountReconciliation struct {
	AccountID       int64           `json:"account_id"`
	AccountName     string          `json:"account_name"`
	Currency        string          `json:"currency"`
	SnapshotDate    *string         `json:"snapshot_date"`
	SnapshotBalance string          `json:"snapshot_balance"`
	Expected        string          `json:"expected_balance"`
	Delta           string          `json:"reconciliation_delta"`
	OverThreshold   bool            `json:"over_threshold"`
	SettledOnly     bool            `json:"settled_only"`
	Events          []ReconEvent    `json:"events"`
	PositionDeltas  []PositionDelta `json:"position_deltas"`
}

// ReconcileAccount computes §6.19 expected cash balance vs the latest snapshot and
// the §6.20 replay-vs-snapshot position deltas for one account, in native currency.
func (s *Store) ReconcileAccount(ctx context.Context, userID, accountID int64, onDate string, settledOnly bool) (AccountReconciliation, error) {
	var name, currency string
	err := s.pool.QueryRow(ctx, `SELECT name, currency FROM accounts WHERE user_id=$1 AND id=$2 /* OWNED accounts */`, userID, accountID).Scan(&name, &currency)
	if errors.Is(err, pgx.ErrNoRows) {
		return AccountReconciliation{}, ErrNotFound
	}
	if err != nil {
		return AccountReconciliation{}, err
	}

	out := AccountReconciliation{
		AccountID: accountID, AccountName: name, Currency: currency,
		SettledOnly: settledOnly, Events: []ReconEvent{}, PositionDeltas: []PositionDelta{},
	}

	// Baseline: latest balance snapshot <= onDate.
	base := decZero
	windowStart := "0001-01-01"
	var snapDate, snapBal *string
	err = s.pool.QueryRow(ctx, `
		SELECT snapshot_date::text, balance::text FROM balance_snapshots
		WHERE user_id=$1 AND account_id=$2 AND snapshot_date <= $3::date /* OWNED balance_snapshots */
		ORDER BY snapshot_date DESC LIMIT 1`, userID, accountID, onDate).Scan(&snapDate, &snapBal)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return AccountReconciliation{}, err
	}
	if snapDate != nil {
		out.SnapshotDate = snapDate
		windowStart = *snapDate
		base = mustDec(*snapBal)
		out.Events = append(out.Events, ReconEvent{Date: *snapDate, Kind: "snapshot", Label: "现金快照基准", Amount: "", Running: formatMoneyDecimal(base)})
	}
	out.SnapshotBalance = formatMoneyDecimal(base)

	events, err := s.reconCashEvents(ctx, userID, accountID, windowStart, onDate, settledOnly)
	if err != nil {
		return AccountReconciliation{}, err
	}
	sort.SliceStable(events, func(i, j int) bool { return events[i].Date < events[j].Date })

	running := base
	for _, e := range events {
		running = running.Add(e.amount)
		out.Events = append(out.Events, ReconEvent{
			Date: e.Date, Kind: e.Kind, Label: e.Label,
			Amount: formatSignedMoney(e.amount), Running: formatMoneyDecimal(running),
		})
	}
	expected := running
	delta := expected.Sub(base)
	out.Expected = formatMoneyDecimal(expected)
	out.Delta = formatMoneyDecimal(delta)
	if !expected.IsZero() {
		ratio := delta.Abs().Div(expected.Abs())
		out.OverThreshold = ratio.GreaterThan(reconThreshold)
	} else {
		out.OverThreshold = !delta.IsZero()
	}

	deltas, err := s.positionDeltas(ctx, userID, accountID, onDate)
	if err != nil {
		return AccountReconciliation{}, err
	}
	out.PositionDeltas = deltas
	return out, nil
}

type reconCashEvent struct {
	Date   string
	Kind   string
	Label  string
	amount decimal.Decimal
}

func (s *Store) reconCashEvents(ctx context.Context, userID, accountID int64, windowStart, onDate string, settledOnly bool) ([]reconCashEvent, error) {
	var out []reconCashEvent

	// Transactions: cash effect on settle (fallback trade) date (§6.19).
	txnRows, err := s.pool.Query(ctx, `
		SELECT COALESCE(settle_date, trade_date)::text, symbol, action, quantity::text, price::text, COALESCE(fee,0)::text
		FROM transactions
		WHERE user_id=$1 AND account_id=$2 /* OWNED transactions */
		  AND COALESCE(settle_date, trade_date) > $3::date
		  AND COALESCE(settle_date, trade_date) <= $4::date
		  AND ($5 = false OR is_settled = true)`, userID, accountID, windowStart, onDate, settledOnly)
	if err != nil {
		return nil, err
	}
	defer txnRows.Close()
	for txnRows.Next() {
		var date, symbol, action, qty, price, fee string
		if err := txnRows.Scan(&date, &symbol, &action, &qty, &price, &fee); err != nil {
			return nil, err
		}
		gross := mustDec(qty).Mul(mustDec(price))
		f := mustDec(fee)
		var amt decimal.Decimal
		if action == "buy" {
			amt = gross.Add(f).Neg()
		} else {
			amt = gross.Sub(f)
		}
		out = append(out, reconCashEvent{Date: date, Kind: action, Label: action + " " + symbol, amount: amt})
	}
	if err := txnRows.Err(); err != nil {
		return nil, err
	}

	// Transfers.
	trRows, err := s.pool.Query(ctx, `
		SELECT transfer_date::text, from_account_id, to_account_id, from_amount::text, to_amount::text
		FROM transfers
		WHERE user_id=$1 AND (from_account_id=$2 OR to_account_id=$2) /* OWNED transfers */
		  AND transfer_date > $3::date AND transfer_date <= $4::date`, userID, accountID, windowStart, onDate)
	if err != nil {
		return nil, err
	}
	defer trRows.Close()
	for trRows.Next() {
		var date string
		var fromID, toID int64
		var fromAmt, toAmt string
		if err := trRows.Scan(&date, &fromID, &toID, &fromAmt, &toAmt); err != nil {
			return nil, err
		}
		if fromID == accountID {
			out = append(out, reconCashEvent{Date: date, Kind: "transfer_out", Label: "转出", amount: mustDec(fromAmt).Neg()})
		}
		if toID == accountID {
			out = append(out, reconCashEvent{Date: date, Kind: "transfer_in", Label: "转入", amount: mustDec(toAmt)})
		}
	}
	if err := trRows.Err(); err != nil {
		return nil, err
	}

	// Income events landing in this account.
	inRows, err := s.pool.Query(ctx, `
		SELECT event_date::text, event_kind, amount::text
		FROM income_events
		WHERE user_id=$1 AND payment_account_id=$2 AND event_date > $3::date AND event_date <= $4::date /* OWNED income_events */`, userID, accountID, windowStart, onDate)
	if err != nil {
		return nil, err
	}
	defer inRows.Close()
	for inRows.Next() {
		var date, kind, amt string
		if err := inRows.Scan(&date, &kind, &amt); err != nil {
			return nil, err
		}
		out = append(out, reconCashEvent{Date: date, Kind: "income", Label: "收益事件 " + kind, amount: mustDec(amt)})
	}
	if err := inRows.Err(); err != nil {
		return nil, err
	}

	// Credit-card repayments landing in this account.
	ccRows, err := s.pool.Query(ctx, `
		SELECT paid_at::text, amount_total::text
		FROM credit_card_bills
		WHERE user_id=$1 AND payment_account_id=$2 AND paid_at IS NOT NULL /* OWNED credit_card_bills */
		  AND paid_at > $3::date AND paid_at <= $4::date`, userID, accountID, windowStart, onDate)
	if err != nil {
		return nil, err
	}
	defer ccRows.Close()
	for ccRows.Next() {
		var date, amt string
		if err := ccRows.Scan(&date, &amt); err != nil {
			return nil, err
		}
		out = append(out, reconCashEvent{Date: date, Kind: "bill_payment", Label: "信用卡还款", amount: mustDec(amt).Neg()})
	}
	return out, ccRows.Err()
}

// positionDeltas compares replay-derived quantity to the latest snapshot quantity
// for every (account, symbol) that has transactions (§6.20).
func (s *Store) positionDeltas(ctx context.Context, userID, accountID int64, onDate string) ([]PositionDelta, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT symbol FROM transactions WHERE user_id=$1 AND account_id=$2 AND trade_date <= $3::date /* OWNED transactions */ ORDER BY symbol`, userID, accountID, onDate)
	if err != nil {
		return nil, err
	}
	var symbols []string
	for rows.Next() {
		var sym string
		if err := rows.Scan(&sym); err != nil {
			rows.Close()
			return nil, err
		}
		symbols = append(symbols, sym)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := []PositionDelta{}
	for _, sym := range symbols {
		st, err := s.ReplayHolding(ctx, userID, accountID, sym, onDate, false)
		if err != nil {
			return nil, err
		}
		snapQty := decZero
		var snap *string
		if err := s.pool.QueryRow(ctx, `
			SELECT quantity::text FROM position_snapshots
			WHERE user_id=$1 AND account_id=$2 AND symbol=$3 AND snapshot_date <= $4::date /* OWNED position_snapshots */
			ORDER BY snapshot_date DESC LIMIT 1`, userID, accountID, sym, onDate).Scan(&snap); err == nil && snap != nil {
			snapQty = mustDec(*snap)
		}
		delta := st.Quantity.Sub(snapQty)
		out = append(out, PositionDelta{
			Symbol:           sym,
			ReplayQuantity:   formatVariableDecimal(st.Quantity),
			SnapshotQuantity: formatVariableDecimal(snapQty),
			Delta:            formatVariableDecimal(delta),
		})
	}
	return out, nil
}

func formatSignedMoney(v decimal.Decimal) string {
	s := formatMoneyDecimal(v.Abs())
	if v.IsNegative() {
		return "-" + s
	}
	return "+" + s
}

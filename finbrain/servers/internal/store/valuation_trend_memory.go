package store

import (
	"context"

	"github.com/shopspring/decimal"
)

// netWorthTrendInMemory computes the trend totals for every date with NO per-date DB
// queries: the user's snapshots/balances/bills/accounts are loaded ONCE, prices/FX come
// from the global cache, and each date is a pure in-memory carry-forward + sum. This is
// only valid when the user has no transactions (replay would change quantities between
// snapshots); callers fall back to the per-date engine otherwise. It mirrors GetValuation's
// totals math exactly (verified against it in the perf test).
func (s *Store) netWorthTrendInMemory(ctx context.Context, userID int64, dates []string, displayCurrency, fxMode string) ([]TrendPoint, error) {
	accounts, err := s.loadAccounts(ctx, userID)
	if err != nil {
		return nil, err
	}
	positions, err := s.loadPositionSnapshots(ctx, userID)
	if err != nil {
		return nil, err
	}
	balances, err := s.loadBalanceSnapshots(ctx, userID)
	if err != nil {
		return nil, err
	}
	bills, err := s.loadCreditCardBills(ctx, userID)
	if err != nil {
		return nil, err
	}
	// Post-snapshot cash events (transfers/income/paid bills) so cash moves between snapshots
	// here just like getValuation's cashReplaySums (联动). Transactions are excluded: this path
	// is gated on the user having none, and replaying a trade's cash without its position would
	// mis-state net worth.
	cashDeltas, err := s.loadCashDeltas(ctx, userID)
	if err != nil {
		return nil, err
	}
	instrumentCcy, err := s.loadInstrumentCurrencies(ctx)
	if err != nil {
		return nil, err
	}

	// Pre-warm the price cache for all held symbols (one bulk query).
	heldSet := map[string]struct{}{}
	for _, ps := range positions {
		heldSet[ps[0].symbol] = struct{}{}
	}
	held := make([]string, 0, len(heldSet))
	for sym := range heldSet {
		held = append(held, sym)
	}
	if err := s.market.EnsurePrices(ctx, held); err != nil {
		return nil, err
	}

	out := make([]TrendPoint, len(dates))
	for di, d := range dates {
		fx := &fxResolver{mode: fxMode, onDate: d, cache: map[string]fxResult{}, lookupFn: s.market.FxLookup}

		netWorth := decZero
		totalAssets := decZero
		totalLiabilities := decZero
		cashValue := decZero
		positionValue := decZero

		// Cash: latest balance on/before d (else earliest), for non-archived cash accounts,
		// plus replay of cash events strictly after that anchor snapshot (联动). When only
		// future snapshots exist (anchored=false, projected backward) we add no replay —
		// matching cashReplaySums, which omits accounts with no snapshot on/before the date.
		for acctID, series := range balances {
			a, ok := accounts[acctID]
			if !ok || a.archived || !isCashKind(a.kind) {
				continue
			}
			bal, anchor, anchored, exists := carryBalanceAnchor(series, d)
			if !exists {
				continue
			}
			if anchored {
				for _, cd := range cashDeltas[acctID] {
					if cd.date > anchor && cd.date <= d {
						bal = bal.Add(cd.amount)
					}
				}
			}
			res, err := fx.resolve(a.currency, displayCurrency)
			if err != nil {
				return nil, err
			}
			dv := bal.Mul(res.Rate)
			totalAssets = totalAssets.Add(dv)
			cashValue = cashValue.Add(dv)
		}

		// Positions: carry-forward holdings × cached price, two-hop FX (price→cost→display).
		for _, series := range positions {
			snap, ok := carrySnapshot(series, d)
			if !ok || !snap.qty.GreaterThan(decZero) {
				continue
			}
			a, ok := accounts[snap.accountID]
			if !ok || a.archived {
				continue
			}
			quoteCcy := instrumentCcy[snap.symbol]
			costCurrency := firstNonEmpty(snap.costCurrency, quoteCcy, a.currency)
			price, priceCurrency, _, ok, err := s.market.PriceAsOf(ctx, snap.symbol, d, quoteCcy)
			if err != nil {
				return nil, err
			}
			if !ok {
				continue // missing price → not counted (matches GetValuation)
			}
			priceToCost, err := fx.resolve(priceCurrency, costCurrency)
			if err != nil {
				return nil, err
			}
			nativeMV := snap.qty.Mul(price.Mul(priceToCost.Rate))
			displayFx, err := fx.resolve(costCurrency, displayCurrency)
			if err != nil {
				return nil, err
			}
			dv := nativeMV.Mul(displayFx.Rate)
			positionValue = positionValue.Add(dv)
			totalAssets = totalAssets.Add(dv)
		}

		// Liabilities: credit-card bills active on d (statement_date <= d < paid_at|∞).
		for _, b := range bills {
			a, ok := accounts[b.accountID]
			if !ok || a.archived || a.kind != "credit_card" {
				continue
			}
			if b.statementDate > d {
				continue
			}
			if b.paidAt != nil && *b.paidAt <= d {
				continue
			}
			res, err := fx.resolve(b.currency, displayCurrency)
			if err != nil {
				return nil, err
			}
			totalLiabilities = totalLiabilities.Add(b.amount.Mul(res.Rate))
		}

		netWorth = totalAssets.Sub(totalLiabilities)
		out[di] = TrendPoint{
			Date:             d,
			NetWorth:         formatMoneyDecimal(netWorth),
			TotalAssets:      formatMoneyDecimal(totalAssets),
			TotalLiabilities: formatMoneyDecimal(totalLiabilities),
			CashValue:        formatMoneyDecimal(cashValue),
			PositionValue:    formatMoneyDecimal(positionValue),
		}
	}
	return out, nil
}

func isCashKind(kind string) bool {
	return kind == "cash" || kind == "time_deposit" || kind == "wealth_product"
}

// ---- one-time loaders (sorted by date asc for carry-forward) ----

type memAccount struct {
	currency string
	kind     string
	archived bool
}

type memSnap struct {
	accountID    int64
	symbol       string
	qty          decimal.Decimal
	costCurrency string
	date         string
}

type memBal struct {
	balance decimal.Decimal
	date    string
}

type memBill struct {
	accountID     int64
	statementDate string
	amount        decimal.Decimal
	currency      string
	paidAt        *string
}

func (s *Store) loadAccounts(ctx context.Context, userID int64) (map[int64]memAccount, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, currency, kind, is_archived FROM accounts WHERE user_id=$1 /* OWNED accounts */`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]memAccount{}
	for rows.Next() {
		var id int64
		var a memAccount
		if err := rows.Scan(&id, &a.currency, &a.kind, &a.archived); err != nil {
			return nil, err
		}
		out[id] = a
	}
	return out, rows.Err()
}

// loadPositionSnapshots returns snapshots grouped by (account,symbol), each sorted by date.
func (s *Store) loadPositionSnapshots(ctx context.Context, userID int64) (map[string][]memSnap, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT account_id, symbol, quantity::text, COALESCE(cost_currency,''), snapshot_date::text
		FROM position_snapshots WHERE user_id=$1 /* OWNED position_snapshots */
		ORDER BY account_id, symbol, snapshot_date`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]memSnap{}
	for rows.Next() {
		var m memSnap
		var qtyText string
		if err := rows.Scan(&m.accountID, &m.symbol, &qtyText, &m.costCurrency, &m.date); err != nil {
			return nil, err
		}
		if m.qty, err = decimalFromString(qtyText); err != nil {
			return nil, err
		}
		key := keyAcctSym(m.accountID, m.symbol)
		out[key] = append(out[key], m)
	}
	return out, rows.Err()
}

func (s *Store) loadBalanceSnapshots(ctx context.Context, userID int64) (map[int64][]memBal, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT account_id, balance::text, snapshot_date::text
		FROM balance_snapshots WHERE user_id=$1 /* OWNED balance_snapshots */
		ORDER BY account_id, snapshot_date`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]memBal{}
	for rows.Next() {
		var acctID int64
		var b memBal
		var balText string
		if err := rows.Scan(&acctID, &balText, &b.date); err != nil {
			return nil, err
		}
		if b.balance, err = decimalFromString(balText); err != nil {
			return nil, err
		}
		out[acctID] = append(out[acctID], b)
	}
	return out, rows.Err()
}

func (s *Store) loadCreditCardBills(ctx context.Context, userID int64) ([]memBill, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT account_id, statement_date::text, amount_total::text, currency, paid_at::text
		FROM credit_card_bills WHERE user_id=$1 /* OWNED credit_card_bills */`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []memBill
	for rows.Next() {
		var b memBill
		var amtText string
		var paidAt *string
		if err := rows.Scan(&b.accountID, &b.statementDate, &amtText, &b.currency, &paidAt); err != nil {
			return nil, err
		}
		if b.amount, err = decimalFromString(amtText); err != nil {
			return nil, err
		}
		b.paidAt = paidAt
		out = append(out, b)
	}
	return out, rows.Err()
}

type memCashDelta struct {
	date   string
	amount decimal.Decimal
}

// loadCashDeltas returns post-snapshot cash events per account (transfers both legs, income
// landing, paid credit-card bills), sorted by date asc. Mirrors cashReplaySums' non-transaction
// sources; transactions are intentionally omitted (the in-memory path is gated on the user
// having none, and a trade's cash can't move without its position also moving).
func (s *Store) loadCashDeltas(ctx context.Context, userID int64) (map[int64][]memCashDelta, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT from_account_id, (-from_amount)::text, transfer_date::text FROM transfers WHERE user_id=$1 /* OWNED transfers */
		UNION ALL
		SELECT to_account_id, to_amount::text, transfer_date::text FROM transfers WHERE user_id=$1 /* OWNED transfers */
		UNION ALL
		SELECT payment_account_id, amount::text, event_date::text FROM income_events
		  WHERE user_id=$1 AND payment_account_id IS NOT NULL /* OWNED income_events */
		UNION ALL
		SELECT payment_account_id, (-amount_total)::text, paid_at::text FROM credit_card_bills
		  WHERE user_id=$1 AND payment_account_id IS NOT NULL AND paid_at IS NOT NULL /* OWNED credit_card_bills */
		ORDER BY 1, 3`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]memCashDelta{}
	for rows.Next() {
		var acctID int64
		var amtText string
		var cd memCashDelta
		if err := rows.Scan(&acctID, &amtText, &cd.date); err != nil {
			return nil, err
		}
		if cd.amount, err = decimalFromString(amtText); err != nil {
			return nil, err
		}
		out[acctID] = append(out[acctID], cd)
	}
	return out, rows.Err()
}

func (s *Store) loadInstrumentCurrencies(ctx context.Context) (map[string]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT symbol, COALESCE(quote_currency,'') FROM instruments`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var sym, ccy string
		if err := rows.Scan(&sym, &ccy); err != nil {
			return nil, err
		}
		out[sym] = ccy
	}
	return out, rows.Err()
}

func keyAcctSym(accountID int64, symbol string) string {
	return decimal.NewFromInt(accountID).String() + "|" + symbol
}

// carrySnapshot picks the snapshot effective on date d: the latest snapshot on/before d,
// else the earliest (backward projection) — matching currentPositionRows' latest_position.
func carrySnapshot(series []memSnap, d string) (memSnap, bool) {
	if len(series) == 0 {
		return memSnap{}, false
	}
	idx := -1
	for i := range series {
		if series[i].date <= d {
			idx = i
		} else {
			break
		}
	}
	if idx >= 0 {
		return series[idx], true
	}
	return series[0], true
}

// carryBalanceAnchor returns the balance effective on d, the anchor snapshot date (latest
// snapshot on/before d) and whether such an anchor exists. When only future snapshots exist
// it projects the earliest backward (anchored=false → callers add no cash replay), matching
// currentCashRows' carry rule and cashReplaySums' anchoring. exists=false only when empty.
func carryBalanceAnchor(series []memBal, d string) (bal decimal.Decimal, anchor string, anchored, exists bool) {
	if len(series) == 0 {
		return decZero, "", false, false
	}
	idx := -1
	for i := range series {
		if series[i].date <= d {
			idx = i
		} else {
			break
		}
	}
	if idx >= 0 {
		return series[idx].balance, series[idx].date, true, true
	}
	return series[0].balance, "", false, true
}

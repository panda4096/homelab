package store

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
)

func (s *Store) ApplyReviewBatch(ctx context.Context, userID int64, batch ReviewBatch) (ReviewBatchResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ReviewBatchResult{}, err
	}
	defer tx.Rollback(ctx)

	if err := ensureBatchAccountsOwned(ctx, tx, userID, batch); err != nil {
		return ReviewBatchResult{}, err
	}

	for _, b := range batch.BalanceSnapshots {
		if _, err := tx.Exec(ctx, `
			INSERT INTO balance_snapshots (user_id, account_id, snapshot_date, balance, note, updated_at) /* OWNED balance_snapshots */
			VALUES ($1, $2, $3::date, $4::numeric(20,2), $5, now())
			ON CONFLICT (account_id, snapshot_date) DO UPDATE SET
				balance = EXCLUDED.balance, note = EXCLUDED.note, updated_at = now()`,
			userID, b.AccountID, firstNonEmpty(b.SnapshotDate, batch.ReviewDate), b.Balance, b.Note); err != nil {
			return ReviewBatchResult{}, err
		}
	}

	for _, p := range batch.PositionSnapshots {
		symbol := p.Symbol
		if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, symbol); err != nil {
			return ReviewBatchResult{}, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO position_snapshots (user_id, account_id, symbol, quantity, avg_cost, cost_currency, snapshot_date, note, updated_at) /* OWNED position_snapshots */
			VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6, $7::date, $8, now())
			ON CONFLICT (account_id, symbol, snapshot_date) DO UPDATE SET
				quantity = EXCLUDED.quantity,
				avg_cost = EXCLUDED.avg_cost,
				cost_currency = EXCLUDED.cost_currency,
				note = EXCLUDED.note,
				updated_at = now()`,
			userID, p.AccountID, symbol, p.Quantity, p.AvgCost, p.CostCurrency,
			firstNonEmpty(p.SnapshotDate, batch.ReviewDate), p.Note); err != nil {
			return ReviewBatchResult{}, err
		}
	}

	for _, t := range batch.Transactions {
		if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, t.Symbol); err != nil {
			return ReviewBatchResult{}, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO transactions ( /* OWNED transactions */
				user_id, account_id, symbol, action, trade_date, settle_date, quantity, price,
				currency, fee, is_settled, notes, source, updated_at
			)
			VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::numeric, $8::numeric, $9,
			        $10::numeric, $11, $12, $13, now())`,
			userID, t.AccountID, t.Symbol, t.Action, firstNonEmpty(t.TradeDate, batch.ReviewDate),
			t.SettleDate, t.Quantity, t.Price, t.Currency, t.Fee, t.IsSettled, t.Notes,
			nonEmptySource(t.Source)); err != nil {
			return ReviewBatchResult{}, err
		}
	}

	for _, t := range batch.Transfers {
		if _, err := tx.Exec(ctx, `
			INSERT INTO transfers ( /* OWNED transfers */
				user_id, from_account_id, to_account_id, from_amount, to_amount, transfer_date,
				notes, source, updated_at
			)
			VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::date, $7, $8, now())`,
			userID, t.FromAccountID, t.ToAccountID, t.FromAmount, t.ToAmount,
			firstNonEmpty(t.TransferDate, batch.ReviewDate), t.Notes, nonEmptySource(t.Source)); err != nil {
			return ReviewBatchResult{}, err
		}
	}

	for _, e := range batch.IncomeEvents {
		if e.Symbol != nil && *e.Symbol != "" {
			if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, *e.Symbol); err != nil {
				return ReviewBatchResult{}, err
			}
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO income_events ( /* OWNED income_events */
				user_id, event_kind, event_date, account_id, symbol, amount, currency,
				payment_account_id, tax_withheld, note, source, updated_at
			)
			VALUES ($1, $2, $3::date, $4, $5, $6::numeric, $7, $8, $9::numeric, $10, $11, now())`,
			userID, e.EventKind, firstNonEmpty(e.EventDate, batch.ReviewDate), e.AccountID, e.Symbol,
			e.Amount, e.Currency, e.PaymentAccountID, e.TaxWithheld, e.Note, nonEmptySource(e.Source)); err != nil {
			return ReviewBatchResult{}, err
		}
	}

	for _, c := range batch.CorporateActions {
		if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, c.Symbol); err != nil {
			return ReviewBatchResult{}, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO corporate_actions (
				symbol, action, event_date, ratio_numerator, ratio_denominator, extra,
				notes, source, updated_at
			)
			VALUES ($1, $2, $3::date, $4::numeric, $5::numeric, $6::jsonb, $7, $8, now())`,
			c.Symbol, c.Action, firstNonEmpty(c.EventDate, batch.ReviewDate), c.RatioNumerator,
			c.RatioDenominator, extraJSON(c.Extra), c.Notes, nonEmptySource(c.Source)); err != nil {
			return ReviewBatchResult{}, err
		}
	}

	for _, b := range batch.CreditCardBills {
		cats, err := json.Marshal(b.TopCategories)
		if err != nil {
			return ReviewBatchResult{}, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO credit_card_bills ( /* OWNED credit_card_bills */
				user_id, account_id, statement_date, amount_total, currency, top_categories,
				paid_at, payment_account_id, note, updated_at
			)
			VALUES ($1, $2, $3::date, $4::numeric, $5, $6::jsonb, $7::date, $8, $9, now())
			ON CONFLICT (account_id, statement_date) DO UPDATE SET
				amount_total = EXCLUDED.amount_total,
				currency = EXCLUDED.currency,
				top_categories = EXCLUDED.top_categories,
				paid_at = EXCLUDED.paid_at,
				payment_account_id = EXCLUDED.payment_account_id,
				note = EXCLUDED.note,
				updated_at = now()`,
			userID, b.AccountID, firstNonEmpty(b.StatementDate, batch.ReviewDate), b.AmountTotal,
			b.Currency, string(cats), b.PaidAt, b.PaymentAccountID, b.Note); err != nil {
			return ReviewBatchResult{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return ReviewBatchResult{}, err
	}
	return ReviewBatchResult{
		ReviewDate:        batch.ReviewDate,
		BalanceSnapshots:  len(batch.BalanceSnapshots),
		PositionSnapshots: len(batch.PositionSnapshots),
		CreditCardBills:   len(batch.CreditCardBills),
		Transactions:      len(batch.Transactions),
		Transfers:         len(batch.Transfers),
		IncomeEvents:      len(batch.IncomeEvents),
		CorporateActions:  len(batch.CorporateActions),
	}, nil
}

type accountOwnerChecker interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func ensureBatchAccountsOwned(ctx context.Context, q accountOwnerChecker, userID int64, batch ReviewBatch) error {
	seen := map[int64]bool{}
	add := func(id int64) {
		if id > 0 {
			seen[id] = true
		}
	}
	for _, b := range batch.BalanceSnapshots {
		add(b.AccountID)
	}
	for _, p := range batch.PositionSnapshots {
		add(p.AccountID)
	}
	for _, t := range batch.Transactions {
		add(t.AccountID)
	}
	for _, t := range batch.Transfers {
		add(t.FromAccountID)
		add(t.ToAccountID)
	}
	for _, e := range batch.IncomeEvents {
		add(e.AccountID)
		if e.PaymentAccountID != nil {
			add(*e.PaymentAccountID)
		}
	}
	for _, b := range batch.CreditCardBills {
		add(b.AccountID)
		if b.PaymentAccountID != nil {
			add(*b.PaymentAccountID)
		}
	}
	if len(seen) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	var count int
	if err := q.QueryRow(ctx, `SELECT count(*) FROM accounts WHERE user_id=$1 AND id = ANY($2::bigint[]) /* OWNED accounts */`, userID, ids).Scan(&count); err != nil {
		return err
	}
	if count != len(ids) {
		return ErrNotFound
	}
	return nil
}

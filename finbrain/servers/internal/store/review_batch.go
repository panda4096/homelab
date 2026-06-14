package store

import (
	"context"
	"encoding/json"
)

func (s *Store) ApplyReviewBatch(ctx context.Context, batch ReviewBatch) (ReviewBatchResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return ReviewBatchResult{}, err
	}
	defer tx.Rollback(ctx)

	for _, b := range batch.BalanceSnapshots {
		if _, err := tx.Exec(ctx, `
			INSERT INTO balance_snapshots (account_id, snapshot_date, balance, note, updated_at)
			VALUES ($1, $2::date, $3::numeric(20,2), $4, now())
			ON CONFLICT (account_id, snapshot_date) DO UPDATE SET
				balance = EXCLUDED.balance, note = EXCLUDED.note, updated_at = now()`,
			b.AccountID, firstNonEmpty(b.SnapshotDate, batch.ReviewDate), b.Balance, b.Note); err != nil {
			return ReviewBatchResult{}, err
		}
	}

	for _, p := range batch.PositionSnapshots {
		symbol := p.Symbol
		if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, symbol); err != nil {
			return ReviewBatchResult{}, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO position_snapshots (account_id, symbol, quantity, avg_cost, cost_currency, snapshot_date, note, updated_at)
			VALUES ($1, $2, $3::numeric, $4::numeric, $5, $6::date, $7, now())
			ON CONFLICT (account_id, symbol, snapshot_date) DO UPDATE SET
				quantity = EXCLUDED.quantity,
				avg_cost = EXCLUDED.avg_cost,
				cost_currency = EXCLUDED.cost_currency,
				note = EXCLUDED.note,
				updated_at = now()`,
			p.AccountID, symbol, p.Quantity, p.AvgCost, p.CostCurrency,
			firstNonEmpty(p.SnapshotDate, batch.ReviewDate), p.Note); err != nil {
			return ReviewBatchResult{}, err
		}
	}

	for _, t := range batch.Transactions {
		if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, t.Symbol); err != nil {
			return ReviewBatchResult{}, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO transactions (
				account_id, symbol, action, trade_date, settle_date, quantity, price,
				currency, fee, is_settled, notes, source, updated_at
			)
			VALUES ($1, $2, $3, $4::date, $5::date, $6::numeric, $7::numeric, $8,
			        $9::numeric, $10, $11, $12, now())`,
			t.AccountID, t.Symbol, t.Action, firstNonEmpty(t.TradeDate, batch.ReviewDate),
			t.SettleDate, t.Quantity, t.Price, t.Currency, t.Fee, t.IsSettled, t.Notes,
			nonEmptySource(t.Source)); err != nil {
			return ReviewBatchResult{}, err
		}
	}

	for _, t := range batch.Transfers {
		if _, err := tx.Exec(ctx, `
			INSERT INTO transfers (
				from_account_id, to_account_id, from_amount, to_amount, transfer_date,
				notes, source, updated_at
			)
			VALUES ($1, $2, $3::numeric, $4::numeric, $5::date, $6, $7, now())`,
			t.FromAccountID, t.ToAccountID, t.FromAmount, t.ToAmount,
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
			INSERT INTO income_events (
				event_kind, event_date, account_id, symbol, amount, currency,
				payment_account_id, tax_withheld, note, source, updated_at
			)
			VALUES ($1, $2::date, $3, $4, $5::numeric, $6, $7, $8::numeric, $9, $10, now())`,
			e.EventKind, firstNonEmpty(e.EventDate, batch.ReviewDate), e.AccountID, e.Symbol,
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
			INSERT INTO credit_card_bills (
				account_id, statement_date, amount_total, currency, top_categories,
				paid_at, payment_account_id, note, updated_at
			)
			VALUES ($1, $2::date, $3::numeric, $4, $5::jsonb, $6::date, $7, $8, now())
			ON CONFLICT (account_id, statement_date) DO UPDATE SET
				amount_total = EXCLUDED.amount_total,
				currency = EXCLUDED.currency,
				top_categories = EXCLUDED.top_categories,
				paid_at = EXCLUDED.paid_at,
				payment_account_id = EXCLUDED.payment_account_id,
				note = EXCLUDED.note,
				updated_at = now()`,
			b.AccountID, firstNonEmpty(b.StatementDate, batch.ReviewDate), b.AmountTotal,
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

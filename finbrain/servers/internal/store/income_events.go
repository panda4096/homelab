package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

const incomeEventCols = `
	e.id, e.event_kind, e.event_date::text, e.account_id, a.name, i.name, e.symbol,
	e.amount::text, e.currency, e.payment_account_id, pa.name, e.tax_withheld::text,
	e.note, e.source, e.created_at, e.updated_at`

func scanIncomeEvent(row rowScanner) (IncomeEvent, error) {
	var e IncomeEvent
	err := row.Scan(
		&e.ID, &e.EventKind, &e.EventDate, &e.AccountID, &e.AccountName, &e.Institution, &e.Symbol,
		&e.Amount, &e.Currency, &e.PaymentAccountID, &e.PaymentAccountName, &e.TaxWithheld,
		&e.Note, &e.Source, &e.CreatedAt, &e.UpdatedAt,
	)
	return e, err
}

func incomeEventJoinSQL(where string) string {
	return `
		SELECT ` + incomeEventCols + `
		FROM income_events e /* OWNED income_events requires caller scope */
		JOIN accounts a ON a.id = e.account_id AND a.user_id = e.user_id /* OWNED accounts via scoped income_events */
		JOIN institutions i ON i.id = a.institution_id AND i.user_id = a.user_id /* OWNED institutions via scoped accounts */
		LEFT JOIN accounts pa ON pa.id = e.payment_account_id AND pa.user_id = e.user_id /* OWNED accounts via scoped income_events */
		` + where
}

func (s *Store) ListIncomeEvents(ctx context.Context, userID, accountID int64, symbol, eventKind string, limit int) ([]IncomeEvent, bool, error) {
	if limit <= 0 {
		limit = defaultListLimit
	}
	rows, err := s.pool.Query(ctx, incomeEventJoinSQL(`
		WHERE e.user_id = $1 /* OWNED income_events */
		  AND ($2 = 0 OR e.account_id = $2)
		  AND ($3 = '' OR e.symbol = $3)
		  AND ($4 = '' OR e.event_kind = $4)
		ORDER BY e.event_date DESC, e.id DESC
		LIMIT $5`), userID, accountID, symbol, eventKind, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	out := []IncomeEvent{}
	for rows.Next() {
		e, err := scanIncomeEvent(rows)
		if err != nil {
			return nil, false, err
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	truncated := len(out) > limit
	if truncated {
		out = out[:limit]
	}
	return out, truncated, nil
}

func (s *Store) GetIncomeEvent(ctx context.Context, userID, id int64) (IncomeEvent, error) {
	e, err := scanIncomeEvent(s.pool.QueryRow(ctx, incomeEventJoinSQL(`WHERE e.user_id=$1 AND e.id=$2 /* OWNED income_events */`), userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return IncomeEvent{}, ErrNotFound
	}
	return e, err
}

func (s *Store) CreateIncomeEvent(ctx context.Context, userID int64, e IncomeEvent) (IncomeEvent, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return IncomeEvent{}, err
	}
	defer tx.Rollback(ctx)
	if e.Symbol != nil && *e.Symbol != "" {
		if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, *e.Symbol); err != nil {
			return IncomeEvent{}, err
		}
	}
	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO income_events ( /* OWNED income_events */
			user_id, event_kind, event_date, account_id, symbol, amount, currency,
			payment_account_id, tax_withheld, note, source, updated_at
		)
		SELECT $1, $2, $3::date, $4, $5, $6::numeric, $7, $8, $9::numeric, $10, $11, now()
		WHERE EXISTS (SELECT 1 FROM accounts WHERE user_id=$1 AND id=$4 /* OWNED accounts */)
		  AND ($8::bigint IS NULL OR EXISTS (SELECT 1 FROM accounts WHERE user_id=$1 AND id=$8 /* OWNED accounts */))
		RETURNING id`,
		userID, e.EventKind, e.EventDate, e.AccountID, e.Symbol, e.Amount, e.Currency,
		e.PaymentAccountID, e.TaxWithheld, e.Note, nonEmptySource(e.Source),
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return IncomeEvent{}, ErrNotFound
	}
	if err != nil {
		return IncomeEvent{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return IncomeEvent{}, err
	}
	return s.GetIncomeEvent(ctx, userID, id)
}

func (s *Store) UpdateIncomeEvent(ctx context.Context, userID, id int64, e IncomeEvent) (IncomeEvent, error) {
	ct, err := s.pool.Exec(ctx, `
		UPDATE income_events
		SET event_kind=$2, event_date=$3::date, account_id=$4, symbol=$5, amount=$6::numeric,
		    currency=$7, payment_account_id=$8, tax_withheld=$9::numeric, note=$10, updated_at=now()
		WHERE id=$1 AND user_id=$11 /* OWNED income_events */
		  AND EXISTS (SELECT 1 FROM accounts WHERE user_id=$11 AND id=$4 /* OWNED accounts */)
		  AND ($8::bigint IS NULL OR EXISTS (SELECT 1 FROM accounts WHERE user_id=$11 AND id=$8 /* OWNED accounts */))`,
		id, e.EventKind, e.EventDate, e.AccountID, e.Symbol, e.Amount, e.Currency,
		e.PaymentAccountID, e.TaxWithheld, e.Note, userID,
	)
	if err != nil {
		return IncomeEvent{}, err
	}
	if ct.RowsAffected() == 0 {
		return IncomeEvent{}, ErrNotFound
	}
	return s.GetIncomeEvent(ctx, userID, id)
}

func (s *Store) DeleteIncomeEvent(ctx context.Context, userID, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM income_events WHERE user_id=$1 AND id=$2 /* OWNED income_events */`, userID, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

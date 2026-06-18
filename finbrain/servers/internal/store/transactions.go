package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

const transactionCols = `
	t.id, t.account_id, a.name, i.name, t.symbol, ins.display_name, t.action,
	t.trade_date::text, t.settle_date::text, t.quantity::text, t.price::text,
	t.currency, t.fee::text, t.is_settled, t.notes, t.payment_account_id, pa.name,
	t.source, t.created_at, t.updated_at`

func scanTransaction(row rowScanner) (Transaction, error) {
	var t Transaction
	err := row.Scan(
		&t.ID, &t.AccountID, &t.AccountName, &t.Institution, &t.Symbol, &t.DisplayName, &t.Action,
		&t.TradeDate, &t.SettleDate, &t.Quantity, &t.Price,
		&t.Currency, &t.Fee, &t.IsSettled, &t.Notes, &t.PaymentAccountID, &t.PaymentAccountName,
		&t.Source, &t.CreatedAt, &t.UpdatedAt,
	)
	return t, err
}

func transactionJoinSQL(where string) string {
	return `
		SELECT ` + transactionCols + `
		FROM transactions t /* OWNED transactions requires caller scope */
		JOIN accounts a ON a.id = t.account_id AND a.user_id = t.user_id /* OWNED accounts via scoped transactions */
		JOIN institutions i ON i.id = a.institution_id AND i.user_id = a.user_id /* OWNED institutions via scoped accounts */
		JOIN instruments ins ON ins.symbol = t.symbol
		LEFT JOIN accounts pa ON pa.id = t.payment_account_id AND pa.user_id = t.user_id /* OWNED accounts via scoped transactions */
		` + where
}

func collectTransactions(rows pgx.Rows) ([]Transaction, error) {
	out := []Transaction{}
	for rows.Next() {
		t, err := scanTransaction(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// ListTransactions returns transactions, newest first, optionally filtered by
// account and/or symbol. limit caps the row count (0 → default 5000).
func (s *Store) ListTransactions(ctx context.Context, userID, accountID int64, symbol string, limit int) ([]Transaction, bool, error) {
	if limit <= 0 {
		limit = defaultListLimit
	}
	rows, err := s.pool.Query(ctx, transactionJoinSQL(`
		WHERE t.user_id = $1 /* OWNED transactions */
		  AND ($2 = 0 OR t.account_id = $2)
		  AND ($3 = '' OR t.symbol = $3)
		ORDER BY t.trade_date DESC, t.id DESC
		LIMIT $4`), userID, accountID, symbol, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	items, err := collectTransactions(rows)
	if err != nil {
		return nil, false, err
	}
	truncated := len(items) > limit
	if truncated {
		items = items[:limit]
	}
	return items, truncated, nil
}

func (s *Store) GetTransaction(ctx context.Context, userID, id int64) (Transaction, error) {
	t, err := scanTransaction(s.pool.QueryRow(ctx, transactionJoinSQL(`WHERE t.user_id=$1 AND t.id=$2 /* OWNED transactions */`), userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Transaction{}, ErrNotFound
	}
	return t, err
}

func (s *Store) CreateTransaction(ctx context.Context, userID int64, t Transaction) (Transaction, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Transaction{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, t.Symbol); err != nil {
		return Transaction{}, err
	}
	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO transactions ( /* OWNED transactions */
			user_id, account_id, symbol, action, trade_date, settle_date, quantity, price,
			currency, fee, is_settled, notes, payment_account_id, source, updated_at
		)
		SELECT $1, $2, $3, $4, $5::date, $6::date, $7::numeric, $8::numeric, $9,
		       $10::numeric, $11, $12, $13, $14, now()
		WHERE EXISTS (SELECT 1 FROM accounts WHERE user_id=$1 AND id=$2 /* OWNED accounts */)
		RETURNING id`,
		userID, t.AccountID, t.Symbol, t.Action, t.TradeDate, t.SettleDate, t.Quantity, t.Price,
		t.Currency, t.Fee, t.IsSettled, t.Notes, t.PaymentAccountID, nonEmptySource(t.Source),
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Transaction{}, ErrNotFound
	}
	if err != nil {
		return Transaction{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Transaction{}, err
	}
	return s.GetTransaction(ctx, userID, id)
}

// UpdateTransaction edits a transaction in place. Account, symbol and the cash
// payment account are all mutable (历史数据补录/纠错) — the handler validates that the
// new account/payment account are owned and the symbol may introduce a new instrument.
func (s *Store) UpdateTransaction(ctx context.Context, userID, id int64, t Transaction) (Transaction, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Transaction{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, t.Symbol); err != nil {
		return Transaction{}, err
	}
	ct, err := tx.Exec(ctx, `
		UPDATE transactions
		SET account_id=$2, symbol=$3, action=$4, trade_date=$5::date, settle_date=$6::date,
		    quantity=$7::numeric, price=$8::numeric, currency=$9, fee=$10::numeric,
		    is_settled=$11, notes=$12, payment_account_id=$13, updated_at=now()
		WHERE id=$1 AND user_id=$14 /* OWNED transactions */
		  AND EXISTS (SELECT 1 FROM accounts WHERE user_id=$14 AND id=$2 /* OWNED accounts */)`,
		id, t.AccountID, t.Symbol, t.Action, t.TradeDate, t.SettleDate, t.Quantity, t.Price,
		t.Currency, t.Fee, t.IsSettled, t.Notes, t.PaymentAccountID, userID,
	)
	if err != nil {
		return Transaction{}, err
	}
	if ct.RowsAffected() == 0 {
		return Transaction{}, ErrNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return Transaction{}, err
	}
	return s.GetTransaction(ctx, userID, id)
}

func (s *Store) DeleteTransaction(ctx context.Context, userID, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM transactions WHERE user_id=$1 AND id=$2 /* OWNED transactions */`, userID, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

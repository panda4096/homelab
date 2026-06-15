package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

const creditCardBillCols = `
	b.id, b.account_id, a.name, i.name, b.statement_date::text, b.amount_total::text,
	b.currency, COALESCE(b.top_categories, '[]'::jsonb)::text, b.paid_at::text,
	b.payment_account_id, pa.name, b.note, b.created_at, b.updated_at`

func scanCreditCardBill(row rowScanner) (CreditCardBill, error) {
	var b CreditCardBill
	var categoriesText string
	err := row.Scan(
		&b.ID, &b.AccountID, &b.AccountName, &b.Institution, &b.StatementDate, &b.AmountTotal,
		&b.Currency, &categoriesText, &b.PaidAt, &b.PaymentAccountID, &b.PaymentAccountName,
		&b.Note, &b.CreatedAt, &b.UpdatedAt,
	)
	if err != nil {
		return CreditCardBill{}, err
	}
	if categoriesText == "" {
		categoriesText = "[]"
	}
	if err := json.Unmarshal([]byte(categoriesText), &b.TopCategories); err != nil {
		return CreditCardBill{}, err
	}
	return b, nil
}

func creditCardBillJoinSQL(where string) string {
	return `
		SELECT ` + creditCardBillCols + `
		FROM credit_card_bills b /* OWNED credit_card_bills requires caller scope */
		JOIN accounts a ON a.id = b.account_id AND a.user_id = b.user_id /* OWNED accounts via scoped credit_card_bills */
		JOIN institutions i ON i.id = a.institution_id AND i.user_id = a.user_id /* OWNED institutions via scoped accounts */
		LEFT JOIN accounts pa ON pa.id = b.payment_account_id AND pa.user_id = b.user_id /* OWNED accounts via scoped credit_card_bills */
		` + where
}

func (s *Store) ListCreditCardBills(ctx context.Context, userID int64) ([]CreditCardBill, error) {
	rows, err := s.pool.Query(ctx, creditCardBillJoinSQL(`
		WHERE b.user_id = $1 /* OWNED credit_card_bills */
		ORDER BY b.statement_date DESC, i.display_order, i.name, a.display_order, a.name`), userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectCreditCardBills(rows)
}

func (s *Store) ListAccountCreditCardBills(ctx context.Context, userID, accountID int64) ([]CreditCardBill, error) {
	rows, err := s.pool.Query(ctx, creditCardBillJoinSQL(`
		WHERE b.user_id=$1 AND b.account_id=$2 /* OWNED credit_card_bills */
		ORDER BY b.statement_date DESC`), userID, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return collectCreditCardBills(rows)
}

func collectCreditCardBills(rows pgx.Rows) ([]CreditCardBill, error) {
	out := []CreditCardBill{}
	for rows.Next() {
		b, err := scanCreditCardBill(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Store) CreateCreditCardBill(ctx context.Context, userID int64, b CreditCardBill) (CreditCardBill, error) {
	cats, err := json.Marshal(b.TopCategories)
	if err != nil {
		return CreditCardBill{}, err
	}
	var id int64
	err = s.pool.QueryRow(ctx, `
		INSERT INTO credit_card_bills ( /* OWNED credit_card_bills */
			user_id, account_id, statement_date, amount_total, currency, top_categories,
			paid_at, payment_account_id, note, updated_at
		)
		SELECT $1, $2, $3::date, $4::numeric, $5, $6::jsonb, $7::date, $8, $9, now()
		WHERE EXISTS (SELECT 1 FROM accounts WHERE user_id=$1 AND id=$2 /* OWNED accounts */)
		  AND ($8::bigint IS NULL OR EXISTS (SELECT 1 FROM accounts WHERE user_id=$1 AND id=$8 /* OWNED accounts */))
		RETURNING id`,
		userID, b.AccountID, b.StatementDate, b.AmountTotal, b.Currency, string(cats),
		b.PaidAt, b.PaymentAccountID, b.Note,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return CreditCardBill{}, ErrNotFound
	}
	if err != nil {
		return CreditCardBill{}, err
	}
	return s.GetCreditCardBill(ctx, userID, id)
}

func (s *Store) UpsertCreditCardBill(ctx context.Context, userID int64, b CreditCardBill) (CreditCardBill, error) {
	cats, err := json.Marshal(b.TopCategories)
	if err != nil {
		return CreditCardBill{}, err
	}
	var id int64
	err = s.pool.QueryRow(ctx, `
		INSERT INTO credit_card_bills ( /* OWNED credit_card_bills */
			user_id, account_id, statement_date, amount_total, currency, top_categories,
			paid_at, payment_account_id, note, updated_at
		)
		SELECT $1, $2, $3::date, $4::numeric, $5, $6::jsonb, $7::date, $8, $9, now()
		WHERE EXISTS (SELECT 1 FROM accounts WHERE user_id=$1 AND id=$2 /* OWNED accounts */)
		  AND ($8::bigint IS NULL OR EXISTS (SELECT 1 FROM accounts WHERE user_id=$1 AND id=$8 /* OWNED accounts */))
		ON CONFLICT (account_id, statement_date) DO UPDATE SET
			amount_total = EXCLUDED.amount_total,
			currency = EXCLUDED.currency,
			top_categories = EXCLUDED.top_categories,
			paid_at = EXCLUDED.paid_at,
			payment_account_id = EXCLUDED.payment_account_id,
			note = EXCLUDED.note,
			updated_at = now()
		RETURNING id`,
		userID, b.AccountID, b.StatementDate, b.AmountTotal, b.Currency, string(cats),
		b.PaidAt, b.PaymentAccountID, b.Note,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return CreditCardBill{}, ErrNotFound
	}
	if err != nil {
		return CreditCardBill{}, err
	}
	return s.GetCreditCardBill(ctx, userID, id)
}

func (s *Store) UpdateCreditCardBill(ctx context.Context, userID, id int64, b CreditCardBill) (CreditCardBill, error) {
	cats, err := json.Marshal(b.TopCategories)
	if err != nil {
		return CreditCardBill{}, err
	}
	ct, err := s.pool.Exec(ctx, `
		UPDATE credit_card_bills
		SET statement_date=$2::date, amount_total=$3::numeric, currency=$4,
		    top_categories=$5::jsonb, paid_at=$6::date, payment_account_id=$7,
		    note=$8, updated_at=now()
		WHERE id=$1 AND user_id=$9 /* OWNED credit_card_bills */
		  AND ($7::bigint IS NULL OR EXISTS (SELECT 1 FROM accounts WHERE user_id=$9 AND id=$7 /* OWNED accounts */))`,
		id, b.StatementDate, b.AmountTotal, b.Currency, string(cats),
		b.PaidAt, b.PaymentAccountID, b.Note, userID,
	)
	if err != nil {
		return CreditCardBill{}, err
	}
	if ct.RowsAffected() == 0 {
		return CreditCardBill{}, ErrNotFound
	}
	return s.GetCreditCardBill(ctx, userID, id)
}

func (s *Store) GetCreditCardBill(ctx context.Context, userID, id int64) (CreditCardBill, error) {
	b, err := scanCreditCardBill(s.pool.QueryRow(ctx, creditCardBillJoinSQL(`WHERE b.user_id=$1 AND b.id=$2 /* OWNED credit_card_bills */`), userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return CreditCardBill{}, ErrNotFound
	}
	return b, err
}

func (s *Store) DeleteCreditCardBill(ctx context.Context, userID, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM credit_card_bills WHERE user_id=$1 AND id=$2 /* OWNED credit_card_bills */`, userID, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

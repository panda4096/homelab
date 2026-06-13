package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

const transferCols = `
	t.id, t.from_account_id, t.to_account_id, fa.name, ta.name, fa.currency, ta.currency,
	t.from_amount::text, t.to_amount::text, t.transfer_date::text, t.notes, t.source,
	t.created_at, t.updated_at`

func scanTransfer(row rowScanner) (Transfer, error) {
	var t Transfer
	err := row.Scan(
		&t.ID, &t.FromAccountID, &t.ToAccountID, &t.FromAccountName, &t.ToAccountName,
		&t.FromCurrency, &t.ToCurrency, &t.FromAmount, &t.ToAmount, &t.TransferDate,
		&t.Notes, &t.Source, &t.CreatedAt, &t.UpdatedAt,
	)
	return t, err
}

func transferJoinSQL(where string) string {
	return `
		SELECT ` + transferCols + `
		FROM transfers t
		JOIN accounts fa ON fa.id = t.from_account_id
		JOIN accounts ta ON ta.id = t.to_account_id
		` + where
}

func (s *Store) ListTransfers(ctx context.Context, accountID int64, limit int) ([]Transfer, bool, error) {
	if limit <= 0 {
		limit = defaultListLimit
	}
	rows, err := s.pool.Query(ctx, transferJoinSQL(`
		WHERE ($1 = 0 OR t.from_account_id = $1 OR t.to_account_id = $1)
		ORDER BY t.transfer_date DESC, t.id DESC
		LIMIT $2`), accountID, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	out := []Transfer{}
	for rows.Next() {
		t, err := scanTransfer(rows)
		if err != nil {
			return nil, false, err
		}
		out = append(out, t)
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

func (s *Store) GetTransfer(ctx context.Context, id int64) (Transfer, error) {
	t, err := scanTransfer(s.pool.QueryRow(ctx, transferJoinSQL(`WHERE t.id=$1`), id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Transfer{}, ErrNotFound
	}
	return t, err
}

func (s *Store) CreateTransfer(ctx context.Context, t Transfer) (Transfer, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO transfers (
			from_account_id, to_account_id, from_amount, to_amount, transfer_date,
			notes, source, updated_at
		)
		VALUES ($1, $2, $3::numeric, $4::numeric, $5::date, $6, $7, now())
		RETURNING id`,
		t.FromAccountID, t.ToAccountID, t.FromAmount, t.ToAmount, t.TransferDate,
		t.Notes, nonEmptySource(t.Source),
	).Scan(&id)
	if err != nil {
		return Transfer{}, err
	}
	return s.GetTransfer(ctx, id)
}

func (s *Store) UpdateTransfer(ctx context.Context, id int64, t Transfer) (Transfer, error) {
	ct, err := s.pool.Exec(ctx, `
		UPDATE transfers
		SET from_account_id=$2, to_account_id=$3, from_amount=$4::numeric, to_amount=$5::numeric,
		    transfer_date=$6::date, notes=$7, updated_at=now()
		WHERE id=$1`,
		id, t.FromAccountID, t.ToAccountID, t.FromAmount, t.ToAmount, t.TransferDate, t.Notes,
	)
	if err != nil {
		return Transfer{}, err
	}
	if ct.RowsAffected() == 0 {
		return Transfer{}, ErrNotFound
	}
	return s.GetTransfer(ctx, id)
}

func (s *Store) DeleteTransfer(ctx context.Context, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM transfers WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// BalanceSnapshot is an amount-type account balance on a date (PRD §5.2.3).
// Balance is carried as a decimal string to avoid float precision loss.
type BalanceSnapshot struct {
	ID           int64     `json:"id"`
	AccountID    int64     `json:"account_id"`
	SnapshotDate string    `json:"snapshot_date"`
	Balance      string    `json:"balance"`
	Note         *string   `json:"note"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

const balanceCols = `id, account_id, snapshot_date::text, balance::text, note, created_at, updated_at`

// UpsertBalanceSnapshot inserts or overwrites by (account_id, snapshot_date) — idempotent (§3.2).
func (s *Store) UpsertBalanceSnapshot(ctx context.Context, userID int64, b BalanceSnapshot) (BalanceSnapshot, error) {
	var out BalanceSnapshot
	err := s.pool.QueryRow(ctx, `
		INSERT INTO balance_snapshots (user_id, account_id, snapshot_date, balance, note, updated_at) /* OWNED balance_snapshots */
		SELECT $1, $2, $3::date, $4::numeric(20,2), $5, now()
		WHERE EXISTS (SELECT 1 FROM accounts WHERE user_id=$1 AND id=$2 /* OWNED accounts */)
		ON CONFLICT (account_id, snapshot_date) DO UPDATE SET
			balance = EXCLUDED.balance, note = EXCLUDED.note, updated_at = now()
		RETURNING `+balanceCols,
		userID, b.AccountID, b.SnapshotDate, b.Balance, b.Note).
		Scan(&out.ID, &out.AccountID, &out.SnapshotDate, &out.Balance, &out.Note, &out.CreatedAt, &out.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return BalanceSnapshot{}, ErrNotFound
	}
	return out, err
}

// UpdateBalanceSnapshot edits one existing balance snapshot by id. account_id is
// immutable; changing snapshot_date may conflict with another row for the same account.
func (s *Store) UpdateBalanceSnapshot(ctx context.Context, userID, id int64, b BalanceSnapshot) (BalanceSnapshot, error) {
	var out BalanceSnapshot
	err := s.pool.QueryRow(ctx, `
		UPDATE balance_snapshots
		SET snapshot_date=$2::date, balance=$3::numeric(20,2), note=$4, updated_at=now()
		WHERE id=$1 AND user_id=$5 /* OWNED balance_snapshots */
		RETURNING `+balanceCols,
		id, b.SnapshotDate, b.Balance, b.Note, userID).
		Scan(&out.ID, &out.AccountID, &out.SnapshotDate, &out.Balance, &out.Note, &out.CreatedAt, &out.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return BalanceSnapshot{}, ErrNotFound
	}
	return out, err
}

// ListBalanceSnapshots returns an account's balance snapshots, newest first.
func (s *Store) ListBalanceSnapshots(ctx context.Context, userID, accountID int64) ([]BalanceSnapshot, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+balanceCols+` FROM balance_snapshots WHERE user_id=$1 AND account_id=$2 /* OWNED balance_snapshots */ ORDER BY snapshot_date DESC`, userID, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []BalanceSnapshot{}
	for rows.Next() {
		var b BalanceSnapshot
		if err := rows.Scan(&b.ID, &b.AccountID, &b.SnapshotDate, &b.Balance, &b.Note, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// DeleteBalanceSnapshot removes one snapshot by id.
func (s *Store) DeleteBalanceSnapshot(ctx context.Context, userID, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM balance_snapshots WHERE user_id=$1 AND id=$2 /* OWNED balance_snapshots */`, userID, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

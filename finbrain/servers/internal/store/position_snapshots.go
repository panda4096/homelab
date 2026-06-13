package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// PositionSnapshot is a holding's quantity (+optional cost) on a date (PRD §5.2.4).
// quantity/avg_cost are decimal strings to avoid float precision loss.
// quantity = 0 is an explicit "cleared on this date" event (§3.2).
type PositionSnapshot struct {
	ID           int64     `json:"id"`
	AccountID    int64     `json:"account_id"`
	Symbol       string    `json:"symbol"`
	Quantity     string    `json:"quantity"`
	AvgCost      *string   `json:"avg_cost"`
	CostCurrency *string   `json:"cost_currency"`
	SnapshotDate string    `json:"snapshot_date"`
	Note         *string   `json:"note"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

const positionCols = `id, account_id, symbol, quantity::text, avg_cost::text, cost_currency, snapshot_date::text, note, created_at, updated_at`

func scanPosition(row interface{ Scan(...any) error }) (PositionSnapshot, error) {
	var p PositionSnapshot
	err := row.Scan(&p.ID, &p.AccountID, &p.Symbol, &p.Quantity, &p.AvgCost, &p.CostCurrency, &p.SnapshotDate, &p.Note, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

// UpsertPositionSnapshot upserts by (account_id, symbol, snapshot_date), auto-creating
// the instrument metadata row on first reference (PRD §5.2.2). Runs in one tx.
func (s *Store) UpsertPositionSnapshot(ctx context.Context, p PositionSnapshot) (PositionSnapshot, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return PositionSnapshot{}, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, p.Symbol); err != nil {
		return PositionSnapshot{}, err
	}
	out, err := scanPosition(tx.QueryRow(ctx, `
		INSERT INTO position_snapshots (account_id, symbol, quantity, avg_cost, cost_currency, snapshot_date, note, updated_at)
		VALUES ($1, $2, $3::numeric, $4::numeric, $5, $6::date, $7, now())
		ON CONFLICT (account_id, symbol, snapshot_date) DO UPDATE SET
			quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost,
			cost_currency = EXCLUDED.cost_currency, note = EXCLUDED.note, updated_at = now()
		RETURNING `+positionCols,
		p.AccountID, p.Symbol, p.Quantity, p.AvgCost, p.CostCurrency, p.SnapshotDate, p.Note))
	if err != nil {
		return PositionSnapshot{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return PositionSnapshot{}, err
	}
	return out, nil
}

// UpdatePositionSnapshot edits one existing position snapshot by id. account_id
// and symbol are immutable; changing snapshot_date may conflict with another row.
func (s *Store) UpdatePositionSnapshot(ctx context.Context, id int64, p PositionSnapshot) (PositionSnapshot, error) {
	out, err := scanPosition(s.pool.QueryRow(ctx, `
		UPDATE position_snapshots
		SET snapshot_date=$2::date, quantity=$3::numeric, avg_cost=$4::numeric,
		    cost_currency=$5, note=$6, updated_at=now()
		WHERE id=$1
		RETURNING `+positionCols,
		id, p.SnapshotDate, p.Quantity, p.AvgCost, p.CostCurrency, p.Note))
	if errors.Is(err, pgx.ErrNoRows) {
		return PositionSnapshot{}, ErrNotFound
	}
	return out, err
}

// ListPositionSnapshots returns an account's full position history (all symbols), newest first.
func (s *Store) ListPositionSnapshots(ctx context.Context, accountID int64) ([]PositionSnapshot, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+positionCols+` FROM position_snapshots WHERE account_id=$1 ORDER BY symbol, snapshot_date DESC`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PositionSnapshot{}
	for rows.Next() {
		p, err := scanPosition(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ListAccountPositions returns the current holding per symbol (latest snapshot as of
// `onDate`), via "取最近一条" (§6.14). Includes quantity=0 (cleared) rows; callers filter.
func (s *Store) ListAccountPositions(ctx context.Context, accountID int64, onDate string) ([]PositionSnapshot, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (symbol) `+positionCols+`
		FROM position_snapshots
		WHERE account_id=$1 AND snapshot_date <= $2::date
		ORDER BY symbol, snapshot_date DESC`, accountID, onDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PositionSnapshot{}
	for rows.Next() {
		p, err := scanPosition(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// DeletePositionSnapshot removes one snapshot by id.
func (s *Store) DeletePositionSnapshot(ctx context.Context, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM position_snapshots WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

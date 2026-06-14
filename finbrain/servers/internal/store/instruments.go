package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

const instrumentCols = `symbol, display_name, market, quote_currency, asset_kind, is_benchmark, note, created_at, updated_at`

func scanInstrument(row pgx.Row) (Instrument, error) {
	var i Instrument
	err := row.Scan(&i.Symbol, &i.DisplayName, &i.Market, &i.QuoteCurrency, &i.AssetKind, &i.IsBenchmark, &i.Note, &i.CreatedAt, &i.UpdatedAt)
	return i, err
}

// ListInstruments returns all instruments ordered by symbol.
func (s *Store) ListInstruments(ctx context.Context) ([]Instrument, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+instrumentCols+` FROM instruments ORDER BY symbol`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Instrument{}
	for rows.Next() {
		i, err := scanInstrument(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

// GetInstrument returns one instrument or ErrNotFound.
func (s *Store) GetInstrument(ctx context.Context, symbol string) (Instrument, error) {
	i, err := scanInstrument(s.pool.QueryRow(ctx, `SELECT `+instrumentCols+` FROM instruments WHERE symbol = $1`, symbol))
	if errors.Is(err, pgx.ErrNoRows) {
		return Instrument{}, ErrNotFound
	}
	return i, err
}

// UpsertInstrument creates or updates an instrument (PRD §5.2.2: first reference auto-creates).
func (s *Store) UpsertInstrument(ctx context.Context, i Instrument) (Instrument, error) {
	return scanInstrument(s.pool.QueryRow(ctx, `
		INSERT INTO instruments (symbol, display_name, market, quote_currency, asset_kind, is_benchmark, note, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now())
		ON CONFLICT (symbol) DO UPDATE SET
			display_name   = EXCLUDED.display_name,
			market         = EXCLUDED.market,
			quote_currency = EXCLUDED.quote_currency,
			asset_kind     = EXCLUDED.asset_kind,
			is_benchmark   = EXCLUDED.is_benchmark,
			note           = EXCLUDED.note,
			updated_at     = now()
		RETURNING `+instrumentCols,
		i.Symbol, i.DisplayName, i.Market, i.QuoteCurrency, i.AssetKind, i.IsBenchmark, i.Note))
}

// DeleteInstrument removes an instrument only when no current table references it.
func (s *Store) DeleteInstrument(ctx context.Context, symbol string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var id string
	if err := tx.QueryRow(ctx, `SELECT symbol FROM instruments WHERE symbol=$1 FOR UPDATE`, symbol).Scan(&id); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}

	var refs int
	if err := tx.QueryRow(ctx, `
		SELECT
			(SELECT count(*) FROM position_snapshots WHERE symbol=$1)
			+ (SELECT count(*) FROM prices WHERE symbol=$1)
			+ (SELECT count(*) FROM transactions WHERE symbol=$1)
			+ (SELECT count(*) FROM income_events WHERE symbol=$1)
			+ (SELECT count(*) FROM corporate_actions WHERE symbol=$1)`, symbol).Scan(&refs); err != nil {
		return err
	}
	if refs > 0 {
		return ErrInUse
	}

	ct, err := tx.Exec(ctx, `DELETE FROM instruments WHERE symbol = $1`, symbol)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

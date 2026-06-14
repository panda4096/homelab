package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

const corporateActionCols = `
	c.id, c.symbol, ins.display_name, c.action, c.event_date::text,
	c.ratio_numerator::text, c.ratio_denominator::text,
	COALESCE(c.extra, 'null'::jsonb)::text, c.notes, c.source, c.created_at, c.updated_at`

func scanCorporateAction(row rowScanner) (CorporateAction, error) {
	var c CorporateAction
	var extraText string
	err := row.Scan(
		&c.ID, &c.Symbol, &c.DisplayName, &c.Action, &c.EventDate,
		&c.RatioNumerator, &c.RatioDenominator, &extraText, &c.Notes, &c.Source,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return CorporateAction{}, err
	}
	if extraText != "" && extraText != "null" {
		c.Extra = json.RawMessage(extraText)
	}
	return c, nil
}

func corporateActionJoinSQL(where string) string {
	return `
		SELECT ` + corporateActionCols + `
		FROM corporate_actions c
		JOIN instruments ins ON ins.symbol = c.symbol
		` + where
}

func (s *Store) ListCorporateActions(ctx context.Context, symbol string, limit int) ([]CorporateAction, bool, error) {
	if limit <= 0 {
		limit = defaultListLimit
	}
	rows, err := s.pool.Query(ctx, corporateActionJoinSQL(`
		WHERE ($1 = '' OR c.symbol = $1)
		ORDER BY c.event_date DESC, c.id DESC
		LIMIT $2`), symbol, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	out := []CorporateAction{}
	for rows.Next() {
		c, err := scanCorporateAction(rows)
		if err != nil {
			return nil, false, err
		}
		out = append(out, c)
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

func (s *Store) GetCorporateAction(ctx context.Context, id int64) (CorporateAction, error) {
	c, err := scanCorporateAction(s.pool.QueryRow(ctx, corporateActionJoinSQL(`WHERE c.id=$1`), id))
	if errors.Is(err, pgx.ErrNoRows) {
		return CorporateAction{}, ErrNotFound
	}
	return c, err
}

func (s *Store) CreateCorporateAction(ctx context.Context, c CorporateAction) (CorporateAction, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return CorporateAction{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `INSERT INTO instruments (symbol) VALUES ($1) ON CONFLICT (symbol) DO NOTHING`, c.Symbol); err != nil {
		return CorporateAction{}, err
	}
	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO corporate_actions (
			symbol, action, event_date, ratio_numerator, ratio_denominator, extra,
			notes, source, updated_at
		)
		VALUES ($1, $2, $3::date, $4::numeric, $5::numeric, $6::jsonb, $7, $8, now())
		RETURNING id`,
		c.Symbol, c.Action, c.EventDate, c.RatioNumerator, c.RatioDenominator,
		extraJSON(c.Extra), c.Notes, nonEmptySource(c.Source),
	).Scan(&id)
	if err != nil {
		return CorporateAction{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return CorporateAction{}, err
	}
	return s.GetCorporateAction(ctx, id)
}

func (s *Store) UpdateCorporateAction(ctx context.Context, id int64, c CorporateAction) (CorporateAction, error) {
	ct, err := s.pool.Exec(ctx, `
		UPDATE corporate_actions
		SET action=$2, event_date=$3::date, ratio_numerator=$4::numeric,
		    ratio_denominator=$5::numeric, extra=$6::jsonb, notes=$7, updated_at=now()
		WHERE id=$1`,
		id, c.Action, c.EventDate, c.RatioNumerator, c.RatioDenominator, extraJSON(c.Extra), c.Notes,
	)
	if err != nil {
		return CorporateAction{}, err
	}
	if ct.RowsAffected() == 0 {
		return CorporateAction{}, ErrNotFound
	}
	return s.GetCorporateAction(ctx, id)
}

func (s *Store) DeleteCorporateAction(ctx context.Context, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM corporate_actions WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// extraJSON returns a JSON value suitable for a jsonb param (nil → SQL NULL).
func extraJSON(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	return string(raw)
}

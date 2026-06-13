package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

func (s *Store) ListSummaries(ctx context.Context) ([]Summary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, period_kind, period_start::text, period_end::text, display_currency, content,
		       COALESCE(meta, 'null'::jsonb)::text, created_at
		FROM summaries ORDER BY period_end DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Summary{}
	for rows.Next() {
		s, err := scanSummary(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (s *Store) GetSummary(ctx context.Context, id int64) (Summary, error) {
	sm, err := scanSummary(s.pool.QueryRow(ctx, `
		SELECT id, period_kind, period_start::text, period_end::text, display_currency, content,
		       COALESCE(meta, 'null'::jsonb)::text, created_at
		FROM summaries WHERE id=$1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Summary{}, ErrNotFound
	}
	return sm, err
}

func scanSummary(row rowScanner) (Summary, error) {
	var s Summary
	var meta string
	if err := row.Scan(&s.ID, &s.PeriodKind, &s.PeriodStart, &s.PeriodEnd, &s.DisplayCurrency, &s.Content, &meta, &s.CreatedAt); err != nil {
		return Summary{}, err
	}
	if meta != "" && meta != "null" {
		s.Meta = []byte(meta)
	}
	return s, nil
}

func (s *Store) CreateSummary(ctx context.Context, sm Summary) (Summary, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO summaries (period_kind, period_start, period_end, display_currency, content, meta)
		VALUES ($1, $2::date, $3::date, $4, $5, $6::jsonb)
		RETURNING id`,
		sm.PeriodKind, sm.PeriodStart, sm.PeriodEnd, sm.DisplayCurrency, sm.Content, extraJSON(sm.Meta),
	).Scan(&id)
	if err != nil {
		return Summary{}, err
	}
	return s.GetSummary(ctx, id)
}

func (s *Store) DeleteSummary(ctx context.Context, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM summaries WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SummaryData gathers the start/end cross-sections + allocation breakdown that
// feed the LLM stage-summary prompt (§8.3).
type SummaryData struct {
	Start       TrendPoint        `json:"start"`
	End         TrendPoint        `json:"end"`
	ByKind      []ValuationBucket `json:"by_kind"`
	RealizedYtd string            `json:"realized_ytd"`
	IncomeYtd   string            `json:"income_ytd"`
}

func (s *Store) GatherSummaryData(ctx context.Context, start, end, displayCurrency, fxMode string) (SummaryData, error) {
	startPt, err := s.netWorthAt(ctx, start, displayCurrency, fxMode)
	if err != nil {
		return SummaryData{}, err
	}
	endPt, err := s.netWorthAt(ctx, end, displayCurrency, fxMode)
	if err != nil {
		return SummaryData{}, err
	}
	val, err := s.GetValuation(ctx, end, displayCurrency, fxMode, end)
	if err != nil {
		return SummaryData{}, err
	}
	return SummaryData{
		Start:       startPt,
		End:         endPt,
		ByKind:      val.Allocations["kind"],
		RealizedYtd: val.RealizedPLYtd,
		IncomeYtd:   val.IncomeYtd,
	}, nil
}

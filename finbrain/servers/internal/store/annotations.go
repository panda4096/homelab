package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

func scanAnnotation(row rowScanner) (Annotation, error) {
	var a Annotation
	var keys string
	if err := row.Scan(&a.ID, &a.AnchorKind, &keys, &a.EventDate, &a.Label, &a.Body, &a.Color, &a.Source, &a.CreatedAt, &a.UpdatedAt); err != nil {
		return Annotation{}, err
	}
	if keys != "" {
		a.AnchorKeys = []byte(keys)
	}
	return a, nil
}

const annotationCols = `id, anchor_kind, COALESCE(anchor_keys, '{}'::jsonb)::text, event_date::text, label, body, color, source, created_at, updated_at`

// ListAnnotations returns annotations, optionally bounded by [from, to] event dates.
func (s *Store) ListAnnotations(ctx context.Context, from, to string) ([]Annotation, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+annotationCols+`
		FROM annotations
		WHERE ($1 = '' OR event_date >= $1::date) AND ($2 = '' OR event_date <= $2::date)
		ORDER BY event_date DESC, id DESC
		LIMIT 2000`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Annotation{}
	for rows.Next() {
		a, err := scanAnnotation(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) GetAnnotation(ctx context.Context, id int64) (Annotation, error) {
	a, err := scanAnnotation(s.pool.QueryRow(ctx, `SELECT `+annotationCols+` FROM annotations WHERE id=$1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Annotation{}, ErrNotFound
	}
	return a, err
}

func (s *Store) CreateAnnotation(ctx context.Context, a Annotation) (Annotation, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO annotations (anchor_kind, anchor_keys, event_date, label, body, color, source, updated_at)
		VALUES ($1, $2::jsonb, $3::date, $4, $5, $6, $7, now())
		RETURNING id`,
		a.AnchorKind, anchorKeysJSON(a.AnchorKeys), a.EventDate, a.Label, a.Body, a.Color, nonEmptySource(a.Source),
	).Scan(&id)
	if err != nil {
		return Annotation{}, err
	}
	return s.GetAnnotation(ctx, id)
}

func (s *Store) UpdateAnnotation(ctx context.Context, id int64, a Annotation) (Annotation, error) {
	ct, err := s.pool.Exec(ctx, `
		UPDATE annotations SET anchor_kind=$2, anchor_keys=$3::jsonb, event_date=$4::date, label=$5, body=$6, color=$7, updated_at=now()
		WHERE id=$1`,
		id, a.AnchorKind, anchorKeysJSON(a.AnchorKeys), a.EventDate, a.Label, a.Body, a.Color)
	if err != nil {
		return Annotation{}, err
	}
	if ct.RowsAffected() == 0 {
		return Annotation{}, ErrNotFound
	}
	return s.GetAnnotation(ctx, id)
}

func (s *Store) DeleteAnnotation(ctx context.Context, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM annotations WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func anchorKeysJSON(raw []byte) string {
	if len(raw) == 0 {
		return "{}"
	}
	return string(raw)
}

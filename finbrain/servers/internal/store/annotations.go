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
func (s *Store) ListAnnotations(ctx context.Context, userID int64, from, to string) ([]Annotation, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+annotationCols+`
		FROM annotations
		WHERE user_id=$1 /* OWNED annotations */
		  AND ($2 = '' OR event_date >= $2::date)
		  AND ($3 = '' OR event_date <= $3::date)
		ORDER BY event_date DESC, id DESC
		LIMIT 2000`, userID, from, to)
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

func (s *Store) GetAnnotation(ctx context.Context, userID, id int64) (Annotation, error) {
	a, err := scanAnnotation(s.pool.QueryRow(ctx, `SELECT `+annotationCols+` FROM annotations WHERE user_id=$1 AND id=$2 /* OWNED annotations */`, userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Annotation{}, ErrNotFound
	}
	return a, err
}

func (s *Store) CreateAnnotation(ctx context.Context, userID int64, a Annotation) (Annotation, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO annotations (user_id, anchor_kind, anchor_keys, event_date, label, body, color, source, updated_at) /* OWNED annotations */
		VALUES ($1, $2, $3::jsonb, $4::date, $5, $6, $7, $8, now())
		RETURNING id`,
		userID, a.AnchorKind, anchorKeysJSON(a.AnchorKeys), a.EventDate, a.Label, a.Body, a.Color, nonEmptySource(a.Source),
	).Scan(&id)
	if err != nil {
		return Annotation{}, err
	}
	return s.GetAnnotation(ctx, userID, id)
}

func (s *Store) UpdateAnnotation(ctx context.Context, userID, id int64, a Annotation) (Annotation, error) {
	ct, err := s.pool.Exec(ctx, `
		UPDATE annotations SET anchor_kind=$2, anchor_keys=$3::jsonb, event_date=$4::date, label=$5, body=$6, color=$7, updated_at=now()
		WHERE id=$1 AND user_id=$8 /* OWNED annotations */`,
		id, a.AnchorKind, anchorKeysJSON(a.AnchorKeys), a.EventDate, a.Label, a.Body, a.Color, userID)
	if err != nil {
		return Annotation{}, err
	}
	if ct.RowsAffected() == 0 {
		return Annotation{}, ErrNotFound
	}
	return s.GetAnnotation(ctx, userID, id)
}

func (s *Store) DeleteAnnotation(ctx context.Context, userID, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM annotations WHERE user_id=$1 AND id=$2 /* OWNED annotations */`, userID, id)
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

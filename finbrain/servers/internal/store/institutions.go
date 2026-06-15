package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Institution is a financial institution entity (PRD §5.2.18). Accounts reference
// it via institution_id, so renaming an institution reflects everywhere.
type Institution struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Kind         *string   `json:"kind"` // bank/broker/exchange/wallet/other (open)
	Note         *string   `json:"note"`
	DisplayOrder int       `json:"display_order"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	AccountCount int       `json:"account_count"` // computed on list/get
}

func scanInstitution(row rowScanner) (Institution, error) {
	var i Institution
	err := row.Scan(&i.ID, &i.Name, &i.Kind, &i.Note, &i.DisplayOrder, &i.CreatedAt, &i.UpdatedAt, &i.AccountCount)
	return i, err
}

const institutionSelect = `
	SELECT i.id, i.name, i.kind, i.note, i.display_order, i.created_at, i.updated_at,
	       (SELECT count(*) FROM accounts a WHERE a.institution_id = i.id AND a.user_id = i.user_id /* OWNED accounts via scoped institutions */)
	FROM institutions i /* OWNED institutions requires caller scope */`

// ListInstitutions returns all institutions ordered by display_order then name.
func (s *Store) ListInstitutions(ctx context.Context, userID int64) ([]Institution, error) {
	rows, err := s.pool.Query(ctx, institutionSelect+` WHERE i.user_id = $1 /* OWNED institutions */ ORDER BY i.display_order, i.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Institution{}
	for rows.Next() {
		i, err := scanInstitution(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

// GetInstitution returns one institution or ErrNotFound.
func (s *Store) GetInstitution(ctx context.Context, userID, id int64) (Institution, error) {
	i, err := scanInstitution(s.pool.QueryRow(ctx, institutionSelect+` WHERE i.user_id = $1 AND i.id = $2 /* OWNED institutions */`, userID, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Institution{}, ErrNotFound
	}
	return i, err
}

// CreateInstitution inserts a new institution.
func (s *Store) CreateInstitution(ctx context.Context, userID int64, in Institution) (Institution, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO institutions (user_id, name, kind, note, display_order) /* OWNED institutions */
		VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(display_order), -10) + 10 FROM institutions WHERE user_id = $1 /* OWNED institutions */))
		RETURNING id`,
		userID, in.Name, in.Kind, in.Note).Scan(&id)
	if err != nil {
		return Institution{}, err
	}
	return s.GetInstitution(ctx, userID, id)
}

// UpdateInstitution updates all mutable fields. Renames propagate to accounts via FK.
func (s *Store) UpdateInstitution(ctx context.Context, userID int64, in Institution) (Institution, error) {
	ct, err := s.pool.Exec(ctx, `
		UPDATE institutions SET name=$3, kind=$4, note=$5, display_order=$6, updated_at=now()
		WHERE user_id=$1 AND id=$2 /* OWNED institutions */`,
		userID, in.ID, in.Name, in.Kind, in.Note, in.DisplayOrder)
	if err != nil {
		return Institution{}, err
	}
	if ct.RowsAffected() == 0 {
		return Institution{}, ErrNotFound
	}
	return s.GetInstitution(ctx, userID, in.ID)
}

// DeleteInstitution removes an institution; caller must ensure no accounts reference it.
func (s *Store) DeleteInstitution(ctx context.Context, userID, id int64) error {
	ct, err := s.pool.Exec(ctx, `DELETE FROM institutions WHERE user_id=$1 AND id=$2 /* OWNED institutions */`, userID, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteInstitutionIfEmpty removes an institution only when no accounts reference it.
func (s *Store) DeleteInstitutionIfEmpty(ctx context.Context, userID, id int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var lockedID int64
	if err := tx.QueryRow(ctx, `SELECT id FROM institutions WHERE user_id=$1 AND id=$2 /* OWNED institutions */ FOR UPDATE`, userID, id).Scan(&lockedID); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}

	var hasAccounts bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM accounts WHERE user_id=$1 AND institution_id=$2 /* OWNED accounts */)`, userID, id).Scan(&hasAccounts); err != nil {
		return err
	}
	if hasAccounts {
		return ErrInUse
	}

	ct, err := tx.Exec(ctx, `DELETE FROM institutions WHERE user_id=$1 AND id=$2 /* OWNED institutions */`, userID, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

// GetOrCreateInstitutionByName returns the institution with the given name, creating it if absent.
func (s *Store) GetOrCreateInstitutionByName(ctx context.Context, userID int64, name string) (Institution, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO institutions (user_id, name, display_order) /* OWNED institutions */
		VALUES ($1, $2, (SELECT COALESCE(MAX(display_order), -10) + 10 FROM institutions WHERE user_id = $1 /* OWNED institutions */))
		ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
		RETURNING id`, userID, name).Scan(&id)
	if err != nil {
		return Institution{}, err
	}
	return s.GetInstitution(ctx, userID, id)
}

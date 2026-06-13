package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// AccountBlueprint is one account skeleton inside a template's account_blueprints.
type AccountBlueprint struct {
	NameSuffix string  `json:"name_suffix"`
	Kind       string  `json:"kind"`
	Currency   string  `json:"currency"`
	Note       *string `json:"note"`
}

// GetAccountTemplate returns one template or ErrNotFound.
func (s *Store) GetAccountTemplate(ctx context.Context, id int64) (AccountTemplate, error) {
	var t AccountTemplate
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, description, is_builtin, account_blueprints, created_at, updated_at
		FROM account_templates WHERE id=$1`, id).
		Scan(&t.ID, &t.Name, &t.Description, &t.IsBuiltin, &t.Blueprints, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return AccountTemplate{}, ErrNotFound
	}
	return t, err
}

// ListAccountTemplates returns all build-from-template blueprints (builtins first).
func (s *Store) ListAccountTemplates(ctx context.Context) ([]AccountTemplate, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, description, is_builtin, account_blueprints, created_at, updated_at
		FROM account_templates ORDER BY is_builtin DESC, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AccountTemplate{}
	for rows.Next() {
		var t AccountTemplate
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.IsBuiltin, &t.Blueprints, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/panda4096/homelab/finbrain/servers/internal/crypto"
)

// LLMProvider is one of a user's configured LLM endpoints. APIKey is the DECRYPTED key and is only
// populated by GetActiveLLMConfig for in-process use — never serialize it to clients (use HasKey).
type LLMProvider struct {
	ID        int64
	Label     string
	Provider  string
	BaseURL   string
	Model     string
	HasKey    bool
	IsActive  bool
	APIKey    string
	UpdatedAt time.Time
}

// ListLLMProviders returns a user's providers (metadata only — no decrypted keys).
func (s *Store) ListLLMProviders(ctx context.Context, userID int64) ([]LLMProvider, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, label, provider, base_url, model, (api_key_enc <> '') AS has_key, is_active, updated_at
		FROM user_llm_provider WHERE user_id = $1 /* OWNED user_llm_provider */
		ORDER BY is_active DESC, created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LLMProvider{}
	for rows.Next() {
		var p LLMProvider
		if err := rows.Scan(&p.ID, &p.Label, &p.Provider, &p.BaseURL, &p.Model, &p.HasKey, &p.IsActive, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetActiveLLMConfig returns the user's active provider with its API key decrypted. ErrNotFound
// when no provider is active.
func (s *Store) GetActiveLLMConfig(ctx context.Context, userID int64) (LLMProvider, error) {
	var p LLMProvider
	var enc string
	err := s.pool.QueryRow(ctx, `
		SELECT id, label, provider, base_url, model, api_key_enc, updated_at
		FROM user_llm_provider WHERE user_id = $1 AND is_active /* OWNED user_llm_provider */`, userID).
		Scan(&p.ID, &p.Label, &p.Provider, &p.BaseURL, &p.Model, &enc, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return LLMProvider{}, ErrNotFound
	}
	if err != nil {
		return LLMProvider{}, err
	}
	p.IsActive = true
	if enc != "" {
		plain, derr := crypto.Decrypt(enc)
		if derr != nil {
			return LLMProvider{}, derr
		}
		p.APIKey = string(plain)
		p.HasKey = true
	}
	return p, nil
}

// GetLLMProvider returns one provider (owned by userID) with its API key decrypted. Used to fetch
// the upstream model list for an existing provider without re-entering the key.
func (s *Store) GetLLMProvider(ctx context.Context, userID, id int64) (LLMProvider, error) {
	var p LLMProvider
	var enc string
	err := s.pool.QueryRow(ctx, `
		SELECT id, label, provider, base_url, model, api_key_enc, is_active, updated_at
		FROM user_llm_provider WHERE user_id = $1 AND id = $2 /* OWNED user_llm_provider */`, userID, id).
		Scan(&p.ID, &p.Label, &p.Provider, &p.BaseURL, &p.Model, &enc, &p.IsActive, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return LLMProvider{}, ErrNotFound
	}
	if err != nil {
		return LLMProvider{}, err
	}
	if enc != "" {
		plain, derr := crypto.Decrypt(enc)
		if derr != nil {
			return LLMProvider{}, derr
		}
		p.APIKey = string(plain)
		p.HasKey = true
	}
	return p, nil
}

// CreateLLMProvider inserts a provider and returns its id. The first provider a user adds becomes
// active automatically. apiKey is encrypted before storage.
func (s *Store) CreateLLMProvider(ctx context.Context, userID int64, label, provider, baseURL, model, apiKey string) (int64, error) {
	enc := ""
	if apiKey != "" {
		e, err := crypto.Encrypt([]byte(apiKey))
		if err != nil {
			return 0, err
		}
		enc = e
	}
	var existing int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM user_llm_provider WHERE user_id = $1 /* OWNED user_llm_provider */`, userID).Scan(&existing); err != nil {
		return 0, err
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO user_llm_provider (user_id, label, provider, base_url, model, api_key_enc, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		userID, label, provider, baseURL, model, enc, existing == 0).Scan(&id)
	return id, err
}

// UpdateLLMProvider edits a provider owned by userID. apiKey == nil keeps the stored key; apiKey
// != nil replaces it (empty string clears it).
func (s *Store) UpdateLLMProvider(ctx context.Context, userID, id int64, label, provider, baseURL, model string, apiKey *string) error {
	if apiKey == nil {
		tag, err := s.pool.Exec(ctx, `
			UPDATE user_llm_provider SET label=$3, provider=$4, base_url=$5, model=$6, updated_at=now()
			WHERE user_id=$1 AND id=$2 /* OWNED user_llm_provider */`,
			userID, id, label, provider, baseURL, model)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	}
	enc := ""
	if *apiKey != "" {
		e, err := crypto.Encrypt([]byte(*apiKey))
		if err != nil {
			return err
		}
		enc = e
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE user_llm_provider SET label=$3, provider=$4, base_url=$5, model=$6, api_key_enc=$7, updated_at=now()
		WHERE user_id=$1 AND id=$2 /* OWNED user_llm_provider */`,
		userID, id, label, provider, baseURL, model, enc)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteLLMProvider removes a provider owned by userID.
func (s *Store) DeleteLLMProvider(ctx context.Context, userID, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM user_llm_provider WHERE user_id=$1 AND id=$2 /* OWNED user_llm_provider */`, userID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetActiveLLMProvider marks one provider active and clears the rest (one tx, so the partial unique
// index never conflicts).
func (s *Store) SetActiveLLMProvider(ctx context.Context, userID, id int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE user_llm_provider SET is_active=false WHERE user_id=$1 AND is_active /* OWNED user_llm_provider */`, userID); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `UPDATE user_llm_provider SET is_active=true, updated_at=now() WHERE user_id=$1 AND id=$2 /* OWNED user_llm_provider */`, userID, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/panda4096/homelab/finbrain/servers/internal/crypto"
)

// LLMConfig is a user's Copilot/LLM settings. APIKey is the DECRYPTED key (only populated by
// GetLLMConfig for in-process use — never serialize it to clients; expose HasKey instead).
type LLMConfig struct {
	Provider  string
	BaseURL   string
	Model     string
	APIKey    string
	HasKey    bool
	UpdatedAt time.Time
}

// GetLLMConfig returns the user's LLM config with the API key decrypted. ErrNotFound when unset.
func (s *Store) GetLLMConfig(ctx context.Context, userID int64) (LLMConfig, error) {
	var c LLMConfig
	var enc string
	err := s.pool.QueryRow(ctx, `
		SELECT provider, base_url, model, api_key_enc, updated_at
		FROM user_llm_config WHERE user_id = $1 /* OWNED user_llm_config */`, userID).
		Scan(&c.Provider, &c.BaseURL, &c.Model, &enc, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return LLMConfig{}, ErrNotFound
	}
	if err != nil {
		return LLMConfig{}, err
	}
	if enc != "" {
		plain, derr := crypto.Decrypt(enc)
		if derr != nil {
			return LLMConfig{}, derr
		}
		c.APIKey = string(plain)
		c.HasKey = true
	}
	return c, nil
}

// UpsertLLMConfig writes provider/base_url/model. apiKey == nil keeps the existing stored key;
// apiKey != nil replaces it (an empty string clears it). The key is encrypted before storage.
func (s *Store) UpsertLLMConfig(ctx context.Context, userID int64, provider, baseURL, model string, apiKey *string) error {
	if apiKey == nil {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO user_llm_config (user_id, provider, base_url, model, updated_at)
			VALUES ($1, $2, $3, $4, now())
			ON CONFLICT (user_id) DO UPDATE SET /* OWNED user_llm_config */
				provider = EXCLUDED.provider, base_url = EXCLUDED.base_url,
				model = EXCLUDED.model, updated_at = now()`,
			userID, provider, baseURL, model)
		return err
	}
	enc := ""
	if *apiKey != "" {
		e, err := crypto.Encrypt([]byte(*apiKey))
		if err != nil {
			return err
		}
		enc = e
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO user_llm_config (user_id, provider, base_url, model, api_key_enc, updated_at)
		VALUES ($1, $2, $3, $4, $5, now())
		ON CONFLICT (user_id) DO UPDATE SET /* OWNED user_llm_config */
			provider = EXCLUDED.provider, base_url = EXCLUDED.base_url, model = EXCLUDED.model,
			api_key_enc = EXCLUDED.api_key_enc, updated_at = now()`,
		userID, provider, baseURL, model, enc)
	return err
}

// DeleteLLMConfig removes the user's LLM config (reverting Copilot to the env-configured default).
func (s *Store) DeleteLLMConfig(ctx context.Context, userID int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM user_llm_config WHERE user_id = $1 /* OWNED user_llm_config */`, userID)
	return err
}

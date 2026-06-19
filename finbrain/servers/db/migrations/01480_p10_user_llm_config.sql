-- P10: per-user Copilot / LLM configuration. The API key is stored encrypted (AES-256-GCM,
-- application-side; see internal/crypto). base_url/model let a user point Copilot at any
-- OpenAI-compatible endpoint (we ship DeepSeek as the default provider). Keyed by user_id (the
-- ownership boundary is the PK + FK to users), so no separate enforce_owner trigger is needed.

-- +goose Up
CREATE TABLE IF NOT EXISTS user_llm_config (
    user_id     bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider    text        NOT NULL DEFAULT 'deepseek',
    base_url    text        NOT NULL DEFAULT '',
    model       text        NOT NULL DEFAULT '',
    api_key_enc text        NOT NULL DEFAULT '', -- base64(nonce||ciphertext); '' = no key
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS user_llm_config;

-- P10.1: evolve the single-row user_llm_config into a multi-provider manager. A user can store
-- several LLM endpoints (DeepSeek official, an OpenAI relay/中转站, etc.), each with its own
-- base_url / model / encrypted key, and mark exactly one active for Copilot. The prior single row
-- (if any) is migrated in as the active provider.

-- +goose Up
CREATE TABLE IF NOT EXISTS user_llm_provider (
    id          bigserial   PRIMARY KEY,
    user_id     bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label       text        NOT NULL DEFAULT '',
    provider    text        NOT NULL DEFAULT 'deepseek',
    base_url    text        NOT NULL DEFAULT '',
    model       text        NOT NULL DEFAULT '',
    api_key_enc text        NOT NULL DEFAULT '', -- base64(nonce||ciphertext); '' = no key
    is_active   boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_llm_provider_user ON user_llm_provider (user_id, created_at);
-- at most one active provider per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_llm_provider_active ON user_llm_provider (user_id) WHERE is_active;

INSERT INTO user_llm_provider (user_id, label, provider, base_url, model, api_key_enc, is_active)
SELECT user_id, '默认', provider, base_url, model, api_key_enc, true FROM user_llm_config;

DROP TABLE IF EXISTS user_llm_config;

-- +goose Down
CREATE TABLE IF NOT EXISTS user_llm_config (
    user_id     bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider    text        NOT NULL DEFAULT 'deepseek',
    base_url    text        NOT NULL DEFAULT '',
    model       text        NOT NULL DEFAULT '',
    api_key_enc text        NOT NULL DEFAULT '',
    updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO user_llm_config (user_id, provider, base_url, model, api_key_enc, updated_at)
SELECT DISTINCT ON (user_id) user_id, provider, base_url, model, api_key_enc, updated_at
FROM user_llm_provider WHERE is_active ORDER BY user_id, updated_at DESC;
DROP TABLE IF EXISTS user_llm_provider;

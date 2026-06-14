-- P8: Agent skill layer — API keys + unified audit (human UI ops + agent skill calls).
-- LLM/agents never touch SQL or the DB directly; everything goes through registered
-- skills, and every mutation (UI or agent) is audited here.

-- +goose Up
CREATE TABLE IF NOT EXISTS api_keys (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         varchar(128) NOT NULL,
    key_hash     text         NOT NULL UNIQUE,   -- sha256 of the secret; secret shown once
    prefix       varchar(16)  NOT NULL,          -- non-secret identifier shown in UI
    scopes       varchar(16)  NOT NULL DEFAULT 'read' CHECK (scopes IN ('read', 'read_write')),
    created_at   timestamptz  NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    revoked_at   timestamptz
);

CREATE TABLE IF NOT EXISTS agent_audit (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id             varchar(64)  NOT NULL,
    actor                  varchar(64)  NOT NULL DEFAULT 'owner',  -- owner | apikey:<name>
    source                 varchar(16)  NOT NULL DEFAULT 'agent',  -- ui | agent | apikey
    skill_name             varchar(64),
    skill_type             varchar(16),                            -- read | draft | write
    input_json             jsonb,
    output_row_count       int,
    affected_entities      jsonb,
    natural_language_source text,
    confirmed_by_user      boolean      NOT NULL DEFAULT false,
    status                 varchar(16)  NOT NULL,                  -- ok | error
    error_code             varchar(32),
    http_method            varchar(8),
    http_path              text,
    created_at             timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_audit_created ON agent_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_source ON agent_audit (source, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS agent_audit;
DROP TABLE IF EXISTS api_keys;

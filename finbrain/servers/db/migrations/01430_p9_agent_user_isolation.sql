-- P9.3: API keys and audit rows are owned by a user.
-- Existing rows are preserved and assigned to the legacy owner user 1.

-- +goose Up
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE api_keys SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE api_keys ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_user_id_fkey;
ALTER TABLE api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE agent_audit ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE agent_audit SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE agent_audit ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE agent_audit DROP CONSTRAINT IF EXISTS agent_audit_user_id_fkey;
ALTER TABLE agent_audit
    ADD CONSTRAINT agent_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_api_keys_user_created ON api_keys (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_user_created ON agent_audit (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_user_source_created ON agent_audit (user_id, source, created_at DESC, id DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_agent_audit_user_source_created;
DROP INDEX IF EXISTS idx_agent_audit_user_created;
DROP INDEX IF EXISTS idx_api_keys_user_created;

ALTER TABLE agent_audit DROP CONSTRAINT IF EXISTS agent_audit_user_id_fkey;
ALTER TABLE agent_audit DROP COLUMN IF EXISTS user_id;

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_user_id_fkey;
ALTER TABLE api_keys DROP COLUMN IF EXISTS user_id;

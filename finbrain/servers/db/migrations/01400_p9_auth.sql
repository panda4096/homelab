-- P9.0: application accounts, password identities, sessions, and per-user preferences.
-- Existing single-owner data is preserved and assigned to user 1 by later P9
-- isolation migrations.

-- +goose Up
CREATE TABLE IF NOT EXISTS users (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_name varchar(128) NOT NULL,
    is_active    boolean      NOT NULL DEFAULT true,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO users (id, display_name)
OVERRIDING SYSTEM VALUE
VALUES (1, 'owner')
ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT max(id) FROM users), 1), true);

CREATE TABLE IF NOT EXISTS user_identities (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              bigint       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider             varchar(16)  NOT NULL,
    identifier           varchar(255) NOT NULL,
    secret               text         NOT NULL,
    must_change_password boolean      NOT NULL DEFAULT false,
    created_at           timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (provider, identifier)
);

-- Placeholder secret is a syntactically valid argon2id hash with random bytes.
-- Deployments must run: finbrain-admin set-password owner <temporary-password>.
INSERT INTO user_identities (user_id, provider, identifier, secret, must_change_password)
VALUES (
    1,
    'password',
    'owner',
    '$argon2id$v=19$m=65536,t=3,p=1$+BSi4TU4u0feoNq1UOOXug$td55j+ymUOkqKU1foVsiLiEmPOJAHAUEm6ygFWeIqNg',
    true
)
ON CONFLICT (provider, identifier) DO NOTHING;

CREATE TABLE IF NOT EXISTS sessions (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      bigint      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   text        NOT NULL UNIQUE,
    expires_at   timestamptz NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NOT NULL DEFAULT now(),
    revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL;

ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE user_preferences SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE user_preferences ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Shanghai';
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_pkey;
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_id_check;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS id;
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);

-- +goose Down
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_key;
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey;
DELETE FROM user_preferences WHERE user_id <> 1;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS id int;
UPDATE user_preferences SET id = 1 WHERE id IS NULL;
ALTER TABLE user_preferences ALTER COLUMN id SET DEFAULT 1;
ALTER TABLE user_preferences ALTER COLUMN id SET NOT NULL;
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_id_check CHECK (id = 1);
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);
ALTER TABLE user_preferences DROP COLUMN IF EXISTS timezone;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS user_id;

DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS user_identities;
DROP TABLE IF EXISTS users;

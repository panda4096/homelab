-- P9.1: gateway table ownership for institutions and accounts.
-- Existing rows are preserved and assigned to user 1.

-- +goose Up
ALTER TABLE institutions ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE institutions SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE institutions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE institutions
    ADD CONSTRAINT institutions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE accounts a SET user_id = i.user_id FROM institutions i WHERE i.id = a.institution_id AND a.user_id IS NULL;
UPDATE accounts SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE accounts
    ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_name_key;
ALTER TABLE institutions ADD CONSTRAINT institutions_user_name_key UNIQUE (user_id, name);

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_institution_name_key;
ALTER TABLE accounts ADD CONSTRAINT accounts_user_institution_name_key UNIQUE (user_id, institution_id, name);

CREATE INDEX IF NOT EXISTS idx_institutions_user_order ON institutions (user_id, display_order, name);
CREATE INDEX IF NOT EXISTS idx_accounts_user_order ON accounts (user_id, is_archived, institution_id, display_order, kind, name);

-- +goose Down
DROP INDEX IF EXISTS idx_accounts_user_order;
DROP INDEX IF EXISTS idx_institutions_user_order;

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_institution_name_key;
ALTER TABLE accounts ADD CONSTRAINT accounts_institution_name_key UNIQUE (institution_id, name);

ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_user_name_key;
ALTER TABLE institutions ADD CONSTRAINT institutions_name_key UNIQUE (name);

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_id_fkey;
ALTER TABLE accounts DROP COLUMN IF EXISTS user_id;

ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_user_id_fkey;
ALTER TABLE institutions DROP COLUMN IF EXISTS user_id;

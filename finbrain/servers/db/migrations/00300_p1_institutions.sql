-- P1 增补：把机构从 accounts 上的自由文本提升为独立实体 institutions(PRD §5.2.18)。
-- 账户改为 institution_id 引用;现有 accounts.institution 文本自动迁移成机构记录。

-- +goose Up
CREATE TABLE IF NOT EXISTS institutions (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          varchar(128) NOT NULL UNIQUE,
    kind          varchar(16),
    note          text,
    display_order int          NOT NULL DEFAULT 0,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now()
);

-- 从现有账户的机构文本回填(去重)。
INSERT INTO institutions (name)
    SELECT DISTINCT institution FROM accounts
    ON CONFLICT (name) DO NOTHING;

ALTER TABLE accounts ADD COLUMN institution_id bigint REFERENCES institutions(id);
UPDATE accounts a SET institution_id = i.id FROM institutions i WHERE i.name = a.institution;
ALTER TABLE accounts ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE accounts DROP COLUMN institution;

-- +goose Down
ALTER TABLE accounts ADD COLUMN institution varchar(128);
UPDATE accounts a SET institution = i.name FROM institutions i WHERE i.id = a.institution_id;
ALTER TABLE accounts ALTER COLUMN institution SET NOT NULL;
ALTER TABLE accounts DROP COLUMN institution_id;
DROP TABLE IF EXISTS institutions;

-- 账户名唯一性从全局改为"机构内唯一",以便账户用精简名(港币/美股…)而不必带机构前缀。

-- +goose Up
ALTER TABLE accounts DROP CONSTRAINT accounts_name_key;
ALTER TABLE accounts ADD CONSTRAINT accounts_institution_name_key UNIQUE (institution_id, name);

-- +goose Down
ALTER TABLE accounts DROP CONSTRAINT accounts_institution_name_key;
ALTER TABLE accounts ADD CONSTRAINT accounts_name_key UNIQUE (name);

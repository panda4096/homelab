-- 交易的扣款/结算现金账户。买入从该账户扣现金、卖出向该账户入现金；为空则沿用
-- 旧口径（现金影响落在持仓账户自身）。对应 PRD §6.19 现金对账。

-- +goose Up
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_account_id bigint REFERENCES accounts(id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_account ON transactions (payment_account_id, settle_date);

-- +goose Down
ALTER TABLE transactions DROP COLUMN IF EXISTS payment_account_id;

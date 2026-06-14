-- P9.2: ownership for all remaining user-owned business data.
-- Existing rows are preserved and assigned to the owner of their account/set,
-- falling back to user 1 for legacy root tables.

-- +goose Up
ALTER TABLE allocation_target_sets ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE allocation_target_sets SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE allocation_target_sets ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE allocation_target_sets DROP CONSTRAINT IF EXISTS allocation_target_sets_user_id_fkey;
ALTER TABLE allocation_target_sets
    ADD CONSTRAINT allocation_target_sets_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE allocation_target_items ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE allocation_target_items i
SET user_id = s.user_id
FROM allocation_target_sets s
WHERE s.id = i.set_id AND i.user_id IS NULL;
UPDATE allocation_target_items SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE allocation_target_items ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE allocation_target_items DROP CONSTRAINT IF EXISTS allocation_target_items_user_id_fkey;
ALTER TABLE allocation_target_items
    ADD CONSTRAINT allocation_target_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE summaries ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE summaries SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE summaries ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE summaries DROP CONSTRAINT IF EXISTS summaries_user_id_fkey;
ALTER TABLE summaries
    ADD CONSTRAINT summaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE annotations ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE annotations SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE annotations ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE annotations DROP CONSTRAINT IF EXISTS annotations_user_id_fkey;
ALTER TABLE annotations
    ADD CONSTRAINT annotations_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE balance_snapshots ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE balance_snapshots b
SET user_id = a.user_id
FROM accounts a
WHERE a.id = b.account_id AND b.user_id IS NULL;
UPDATE balance_snapshots SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE balance_snapshots ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE balance_snapshots DROP CONSTRAINT IF EXISTS balance_snapshots_user_id_fkey;
ALTER TABLE balance_snapshots
    ADD CONSTRAINT balance_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE position_snapshots ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE position_snapshots p
SET user_id = a.user_id
FROM accounts a
WHERE a.id = p.account_id AND p.user_id IS NULL;
UPDATE position_snapshots SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE position_snapshots ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE position_snapshots DROP CONSTRAINT IF EXISTS position_snapshots_user_id_fkey;
ALTER TABLE position_snapshots
    ADD CONSTRAINT position_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE transactions t
SET user_id = a.user_id
FROM accounts a
WHERE a.id = t.account_id AND t.user_id IS NULL;
UPDATE transactions SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
ALTER TABLE transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE transfers t
SET user_id = fa.user_id
FROM accounts fa
JOIN accounts ta ON ta.user_id = fa.user_id
WHERE fa.id = t.from_account_id AND ta.id = t.to_account_id AND t.user_id IS NULL;
UPDATE transfers SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE transfers ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_user_id_fkey;
ALTER TABLE transfers
    ADD CONSTRAINT transfers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE income_events ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE income_events e
SET user_id = a.user_id
FROM accounts a
WHERE a.id = e.account_id AND e.user_id IS NULL;
UPDATE income_events SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE income_events ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE income_events DROP CONSTRAINT IF EXISTS income_events_user_id_fkey;
ALTER TABLE income_events
    ADD CONSTRAINT income_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE credit_card_bills ADD COLUMN IF NOT EXISTS user_id bigint;
UPDATE credit_card_bills b
SET user_id = a.user_id
FROM accounts a
WHERE a.id = b.account_id AND b.user_id IS NULL;
UPDATE credit_card_bills SET user_id = 1 WHERE user_id IS NULL;
ALTER TABLE credit_card_bills ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE credit_card_bills DROP CONSTRAINT IF EXISTS credit_card_bills_user_id_fkey;
ALTER TABLE credit_card_bills
    ADD CONSTRAINT credit_card_bills_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE allocation_target_sets DROP CONSTRAINT IF EXISTS allocation_target_sets_name_key;
ALTER TABLE allocation_target_sets DROP CONSTRAINT IF EXISTS allocation_target_sets_user_name_key;
ALTER TABLE allocation_target_sets ADD CONSTRAINT allocation_target_sets_user_name_key UNIQUE (user_id, name);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION finbrain_enforce_account_owner() RETURNS trigger AS $$
DECLARE
    account_col text;
    account_id bigint;
    account_owner bigint;
BEGIN
    FOREACH account_col IN ARRAY TG_ARGV LOOP
        account_id := NULLIF(to_jsonb(NEW)->>account_col, '')::bigint;
        IF account_id IS NULL THEN
            CONTINUE;
        END IF;
        SELECT user_id INTO account_owner FROM accounts WHERE id = account_id;
        IF account_owner IS NULL OR account_owner <> NEW.user_id THEN
            RAISE EXCEPTION 'owner mismatch for account column %', account_col USING ERRCODE = '23503';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION finbrain_enforce_target_item_owner() RETURNS trigger AS $$
DECLARE
    set_owner bigint;
BEGIN
    SELECT user_id INTO set_owner FROM allocation_target_sets WHERE id = NEW.set_id;
    IF set_owner IS NULL OR set_owner <> NEW.user_id THEN
        RAISE EXCEPTION 'owner mismatch for allocation target item' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_balance_snapshots_owner ON balance_snapshots;
CREATE TRIGGER trg_balance_snapshots_owner
    BEFORE INSERT OR UPDATE ON balance_snapshots
    FOR EACH ROW EXECUTE FUNCTION finbrain_enforce_account_owner('account_id');

DROP TRIGGER IF EXISTS trg_position_snapshots_owner ON position_snapshots;
CREATE TRIGGER trg_position_snapshots_owner
    BEFORE INSERT OR UPDATE ON position_snapshots
    FOR EACH ROW EXECUTE FUNCTION finbrain_enforce_account_owner('account_id');

DROP TRIGGER IF EXISTS trg_transactions_owner ON transactions;
CREATE TRIGGER trg_transactions_owner
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION finbrain_enforce_account_owner('account_id');

DROP TRIGGER IF EXISTS trg_transfers_owner ON transfers;
CREATE TRIGGER trg_transfers_owner
    BEFORE INSERT OR UPDATE ON transfers
    FOR EACH ROW EXECUTE FUNCTION finbrain_enforce_account_owner('from_account_id', 'to_account_id');

DROP TRIGGER IF EXISTS trg_income_events_owner ON income_events;
CREATE TRIGGER trg_income_events_owner
    BEFORE INSERT OR UPDATE ON income_events
    FOR EACH ROW EXECUTE FUNCTION finbrain_enforce_account_owner('account_id', 'payment_account_id');

DROP TRIGGER IF EXISTS trg_credit_card_bills_owner ON credit_card_bills;
CREATE TRIGGER trg_credit_card_bills_owner
    BEFORE INSERT OR UPDATE ON credit_card_bills
    FOR EACH ROW EXECUTE FUNCTION finbrain_enforce_account_owner('account_id', 'payment_account_id');

DROP TRIGGER IF EXISTS trg_allocation_target_items_owner ON allocation_target_items;
CREATE TRIGGER trg_allocation_target_items_owner
    BEFORE INSERT OR UPDATE ON allocation_target_items
    FOR EACH ROW EXECUTE FUNCTION finbrain_enforce_target_item_owner();

CREATE INDEX IF NOT EXISTS idx_allocation_target_sets_user_order ON allocation_target_sets (user_id, is_archived, name);
CREATE INDEX IF NOT EXISTS idx_allocation_target_items_user_set ON allocation_target_items (user_id, set_id, dimension_value);
CREATE INDEX IF NOT EXISTS idx_annotations_user_date ON annotations (user_id, event_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_summaries_user_period ON summaries (user_id, period_end DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_user_acct_date ON balance_snapshots (user_id, account_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_position_snapshots_user_acct_sym_date ON position_snapshots (user_id, account_id, symbol, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_acct_symbol_date ON transactions (user_id, account_id, symbol, trade_date, id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_symbol_date ON transactions (user_id, symbol, trade_date, id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_acct_date ON transactions (user_id, account_id, trade_date);
CREATE INDEX IF NOT EXISTS idx_transfers_user_from_date ON transfers (user_id, from_account_id, transfer_date);
CREATE INDEX IF NOT EXISTS idx_transfers_user_to_date ON transfers (user_id, to_account_id, transfer_date);
CREATE INDEX IF NOT EXISTS idx_income_events_user_acct_date ON income_events (user_id, account_id, event_date);
CREATE INDEX IF NOT EXISTS idx_income_events_user_symbol ON income_events (user_id, symbol, event_date);
CREATE INDEX IF NOT EXISTS idx_income_events_user_payment_account ON income_events (user_id, payment_account_id, event_date);
CREATE INDEX IF NOT EXISTS idx_credit_card_bills_user_acct_date ON credit_card_bills (user_id, account_id, statement_date DESC);
CREATE INDEX IF NOT EXISTS idx_credit_card_bills_user_unpaid ON credit_card_bills (user_id, statement_date DESC) WHERE paid_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_credit_card_bills_user_payment_account ON credit_card_bills (user_id, payment_account_id, paid_at);

-- +goose Down
DROP INDEX IF EXISTS idx_credit_card_bills_user_payment_account;
DROP INDEX IF EXISTS idx_credit_card_bills_user_unpaid;
DROP INDEX IF EXISTS idx_credit_card_bills_user_acct_date;
DROP INDEX IF EXISTS idx_income_events_user_payment_account;
DROP INDEX IF EXISTS idx_income_events_user_symbol;
DROP INDEX IF EXISTS idx_income_events_user_acct_date;
DROP INDEX IF EXISTS idx_transfers_user_to_date;
DROP INDEX IF EXISTS idx_transfers_user_from_date;
DROP INDEX IF EXISTS idx_transactions_user_acct_date;
DROP INDEX IF EXISTS idx_transactions_user_symbol_date;
DROP INDEX IF EXISTS idx_transactions_user_acct_symbol_date;
DROP INDEX IF EXISTS idx_position_snapshots_user_acct_sym_date;
DROP INDEX IF EXISTS idx_balance_snapshots_user_acct_date;
DROP INDEX IF EXISTS idx_summaries_user_period;
DROP INDEX IF EXISTS idx_annotations_user_date;
DROP INDEX IF EXISTS idx_allocation_target_items_user_set;
DROP INDEX IF EXISTS idx_allocation_target_sets_user_order;

DROP TRIGGER IF EXISTS trg_allocation_target_items_owner ON allocation_target_items;
DROP TRIGGER IF EXISTS trg_credit_card_bills_owner ON credit_card_bills;
DROP TRIGGER IF EXISTS trg_income_events_owner ON income_events;
DROP TRIGGER IF EXISTS trg_transfers_owner ON transfers;
DROP TRIGGER IF EXISTS trg_transactions_owner ON transactions;
DROP TRIGGER IF EXISTS trg_position_snapshots_owner ON position_snapshots;
DROP TRIGGER IF EXISTS trg_balance_snapshots_owner ON balance_snapshots;
DROP FUNCTION IF EXISTS finbrain_enforce_target_item_owner();
DROP FUNCTION IF EXISTS finbrain_enforce_account_owner();

ALTER TABLE allocation_target_sets DROP CONSTRAINT IF EXISTS allocation_target_sets_user_name_key;
ALTER TABLE allocation_target_sets ADD CONSTRAINT allocation_target_sets_name_key UNIQUE (name);

ALTER TABLE credit_card_bills DROP CONSTRAINT IF EXISTS credit_card_bills_user_id_fkey;
ALTER TABLE credit_card_bills DROP COLUMN IF EXISTS user_id;

ALTER TABLE income_events DROP CONSTRAINT IF EXISTS income_events_user_id_fkey;
ALTER TABLE income_events DROP COLUMN IF EXISTS user_id;

ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_user_id_fkey;
ALTER TABLE transfers DROP COLUMN IF EXISTS user_id;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;
ALTER TABLE transactions DROP COLUMN IF EXISTS user_id;

ALTER TABLE position_snapshots DROP CONSTRAINT IF EXISTS position_snapshots_user_id_fkey;
ALTER TABLE position_snapshots DROP COLUMN IF EXISTS user_id;

ALTER TABLE balance_snapshots DROP CONSTRAINT IF EXISTS balance_snapshots_user_id_fkey;
ALTER TABLE balance_snapshots DROP COLUMN IF EXISTS user_id;

ALTER TABLE annotations DROP CONSTRAINT IF EXISTS annotations_user_id_fkey;
ALTER TABLE annotations DROP COLUMN IF EXISTS user_id;

ALTER TABLE summaries DROP CONSTRAINT IF EXISTS summaries_user_id_fkey;
ALTER TABLE summaries DROP COLUMN IF EXISTS user_id;

ALTER TABLE allocation_target_items DROP CONSTRAINT IF EXISTS allocation_target_items_user_id_fkey;
ALTER TABLE allocation_target_items DROP COLUMN IF EXISTS user_id;

ALTER TABLE allocation_target_sets DROP CONSTRAINT IF EXISTS allocation_target_sets_user_id_fkey;
ALTER TABLE allocation_target_sets DROP COLUMN IF EXISTS user_id;

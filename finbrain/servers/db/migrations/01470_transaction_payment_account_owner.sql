-- transactions.payment_account_id was added in 01460, after the 01420 ownership trigger was
-- created with only 'account_id'. Extend the trigger so the DB also enforces that the cash
-- payment account belongs to the same owner (matching income_events / credit_card_bills), giving
-- a defence-in-depth backstop if any future write path skips the application-level owner check.

-- +goose Up
DROP TRIGGER IF EXISTS trg_transactions_owner ON transactions;
CREATE TRIGGER trg_transactions_owner
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION finbrain_enforce_account_owner('account_id', 'payment_account_id');

-- +goose Down
DROP TRIGGER IF EXISTS trg_transactions_owner ON transactions;
CREATE TRIGGER trg_transactions_owner
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION finbrain_enforce_account_owner('account_id');

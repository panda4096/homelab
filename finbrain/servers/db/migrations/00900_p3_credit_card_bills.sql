-- P3: 信用卡账单与月度盘点负债口径。对应 PRD §5.2.5 / §6.4 / §6.19。

-- +goose Up
CREATE TABLE IF NOT EXISTS credit_card_bills (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id         bigint        NOT NULL REFERENCES accounts(id),
    statement_date     date          NOT NULL,
    amount_total       numeric(20,4) NOT NULL CHECK (amount_total > 0),
    currency           varchar(8)    NOT NULL,
    top_categories     jsonb         NOT NULL DEFAULT '[]'::jsonb,
    paid_at            date,
    payment_account_id bigint        REFERENCES accounts(id),
    note               text,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    updated_at         timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (account_id, statement_date)
);

CREATE INDEX IF NOT EXISTS idx_credit_card_bills_acct_date ON credit_card_bills (account_id, statement_date DESC);
CREATE INDEX IF NOT EXISTS idx_credit_card_bills_unpaid ON credit_card_bills (statement_date DESC) WHERE paid_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_credit_card_bills_payment_account ON credit_card_bills (payment_account_id, paid_at);

-- +goose Down
DROP TABLE IF EXISTS credit_card_bills;

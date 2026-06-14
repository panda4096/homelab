-- P4: 交易流水 / 转账 / 收益事件 / 公司动作。对应 PRD §5.2.15–17 §5.2.6 / §6.15–6.20 §6.11。

-- +goose Up
CREATE TABLE IF NOT EXISTS transactions (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id  bigint        NOT NULL REFERENCES accounts(id),
    symbol      varchar(64)   NOT NULL REFERENCES instruments(symbol),
    action      varchar(16)   NOT NULL CHECK (action IN ('buy', 'sell')),
    trade_date  date          NOT NULL,
    settle_date date,
    quantity    numeric(20,8) NOT NULL CHECK (quantity > 0),
    price       numeric(20,8) NOT NULL CHECK (price >= 0),
    currency    varchar(8)    NOT NULL,
    fee         numeric(20,8) CHECK (fee >= 0),
    is_settled  boolean       NOT NULL DEFAULT false,
    notes       text,
    source      varchar(16)   NOT NULL DEFAULT 'manual',
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_acct_symbol_date ON transactions (account_id, symbol, trade_date, id);
CREATE INDEX IF NOT EXISTS idx_transactions_symbol_date ON transactions (symbol, trade_date, id);
CREATE INDEX IF NOT EXISTS idx_transactions_acct_date ON transactions (account_id, trade_date);

CREATE TABLE IF NOT EXISTS transfers (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_account_id bigint        NOT NULL REFERENCES accounts(id),
    to_account_id   bigint        NOT NULL REFERENCES accounts(id),
    from_amount     numeric(20,8) NOT NULL CHECK (from_amount > 0),
    to_amount       numeric(20,8) NOT NULL CHECK (to_amount > 0),
    transfer_date   date          NOT NULL,
    notes           text,
    source          varchar(16)   NOT NULL DEFAULT 'manual',
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now(),
    CHECK (from_account_id <> to_account_id)
);
CREATE INDEX IF NOT EXISTS idx_transfers_from_date ON transfers (from_account_id, transfer_date);
CREATE INDEX IF NOT EXISTS idx_transfers_to_date ON transfers (to_account_id, transfer_date);

CREATE TABLE IF NOT EXISTS income_events (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_kind         varchar(16)   NOT NULL,
    event_date         date          NOT NULL,
    account_id         bigint        NOT NULL REFERENCES accounts(id),
    symbol             varchar(64)   REFERENCES instruments(symbol),
    amount             numeric(20,4) NOT NULL CHECK (amount > 0),
    currency           varchar(8)    NOT NULL,
    payment_account_id bigint        REFERENCES accounts(id),
    tax_withheld       numeric(20,4) CHECK (tax_withheld >= 0),
    note               text,
    source             varchar(16)   NOT NULL DEFAULT 'manual',
    created_at         timestamptz   NOT NULL DEFAULT now(),
    updated_at         timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_income_events_acct_date ON income_events (account_id, event_date);
CREATE INDEX IF NOT EXISTS idx_income_events_symbol ON income_events (symbol, event_date);
CREATE INDEX IF NOT EXISTS idx_income_events_payment_account ON income_events (payment_account_id, event_date);

CREATE TABLE IF NOT EXISTS corporate_actions (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol            varchar(64)   NOT NULL REFERENCES instruments(symbol),
    action            varchar(16)   NOT NULL CHECK (action IN ('split', 'merge', 'rights')),
    event_date        date          NOT NULL,
    ratio_numerator   numeric(20,8) NOT NULL CHECK (ratio_numerator > 0),
    ratio_denominator numeric(20,8) NOT NULL CHECK (ratio_denominator > 0),
    extra             jsonb,
    notes             text,
    source            varchar(16)   NOT NULL DEFAULT 'manual',
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (symbol, action, event_date)
);
CREATE INDEX IF NOT EXISTS idx_corporate_actions_symbol_date ON corporate_actions (symbol, event_date, id);

-- +goose Down
DROP TABLE IF EXISTS corporate_actions;
DROP TABLE IF EXISTS income_events;
DROP TABLE IF EXISTS transfers;
DROP TABLE IF EXISTS transactions;

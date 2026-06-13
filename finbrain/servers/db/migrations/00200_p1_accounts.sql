-- P1：账户 + 余额快照 + 持仓快照。对应 PRD §5.2.1 / §5.2.3 / §5.2.4。
-- 稀疏存储：只存录入的快照,查询时"取最近一条"(§6.14)。

-- +goose Up
CREATE TABLE IF NOT EXISTS accounts (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        varchar(128) NOT NULL UNIQUE,
    institution varchar(128) NOT NULL,
    currency    varchar(8)   NOT NULL,
    kind        varchar(32)  NOT NULL,
    is_archived boolean      NOT NULL DEFAULT false,
    note        text,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS balance_snapshots (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id    bigint        NOT NULL REFERENCES accounts(id),
    snapshot_date date          NOT NULL,
    balance       numeric(20,4) NOT NULL,
    note          text,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (account_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_acct_date ON balance_snapshots (account_id, snapshot_date);

CREATE TABLE IF NOT EXISTS position_snapshots (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id    bigint        NOT NULL REFERENCES accounts(id),
    symbol        varchar(64)   NOT NULL REFERENCES instruments(symbol),
    quantity      numeric(28,8) NOT NULL CHECK (quantity >= 0),
    avg_cost      numeric(20,8),
    cost_currency varchar(8),
    snapshot_date date          NOT NULL,
    note          text,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    updated_at    timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (account_id, symbol, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_position_snapshots_acct_sym_date ON position_snapshots (account_id, symbol, snapshot_date);

-- +goose Down
DROP TABLE IF EXISTS position_snapshots;
DROP TABLE IF EXISTS balance_snapshots;
DROP TABLE IF EXISTS accounts;

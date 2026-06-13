-- P2：价格、汇率与估值输入。价格/汇率都是稀疏时间序列，估值时取目标日期之前最近一条。

-- +goose Up
CREATE TABLE IF NOT EXISTS prices (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol      varchar(64)   NOT NULL REFERENCES instruments(symbol),
    price_date  date          NOT NULL,
    price       numeric(20,8) NOT NULL CHECK (price > 0),
    currency    varchar(8)    NOT NULL,
    source      varchar(32)   NOT NULL DEFAULT 'manual',
    note        text,
    created_at  timestamptz   NOT NULL DEFAULT now(),
    updated_at  timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (symbol, price_date, currency)
);
CREATE INDEX IF NOT EXISTS idx_prices_symbol_date ON prices (symbol, price_date DESC);
CREATE INDEX IF NOT EXISTS idx_prices_date ON prices (price_date DESC);

CREATE TABLE IF NOT EXISTS fx_rates (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    base_currency  varchar(8)    NOT NULL,
    quote_currency varchar(8)    NOT NULL,
    rate_date      date          NOT NULL,
    rate           numeric(20,8) NOT NULL CHECK (rate > 0),
    source         varchar(32)   NOT NULL DEFAULT 'manual',
    note           text,
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now(),
    CHECK (base_currency <> quote_currency),
    UNIQUE (base_currency, quote_currency, rate_date)
);
CREATE INDEX IF NOT EXISTS idx_fx_rates_pair_date ON fx_rates (base_currency, quote_currency, rate_date DESC);
CREATE INDEX IF NOT EXISTS idx_fx_rates_date ON fx_rates (rate_date DESC);

-- +goose Down
DROP TABLE IF EXISTS fx_rates;
DROP TABLE IF EXISTS prices;

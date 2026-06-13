-- P6: 阶段性总结存档。对应 PRD §5.2.14 / §8.3。

-- +goose Up
CREATE TABLE IF NOT EXISTS summaries (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    period_kind      varchar(16)  NOT NULL,
    period_start     date         NOT NULL,
    period_end       date         NOT NULL,
    display_currency varchar(8)   NOT NULL,
    content          text         NOT NULL,
    meta             jsonb,
    created_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_summaries_period ON summaries (period_end DESC);

-- +goose Down
DROP TABLE IF EXISTS summaries;

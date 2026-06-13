-- P5: 目标配置(漂移)与标注。对应 PRD §5.2.10 §5.2.11 / §6.10。

-- +goose Up
CREATE TABLE IF NOT EXISTS allocation_target_sets (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                 varchar(128)  NOT NULL UNIQUE,
    dimension            varchar(32)   NOT NULL,
    drift_threshold_pct  numeric(5,2)  NOT NULL DEFAULT 5.00 CHECK (drift_threshold_pct > 0),
    is_dashboard_visible boolean       NOT NULL DEFAULT true,
    is_archived          boolean       NOT NULL DEFAULT false,
    note                 text,
    created_at           timestamptz   NOT NULL DEFAULT now(),
    updated_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS allocation_target_items (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    set_id          bigint        NOT NULL REFERENCES allocation_target_sets(id) ON DELETE CASCADE,
    dimension_value varchar(64)   NOT NULL,
    target_pct      numeric(5,2)  NOT NULL CHECK (target_pct > 0),
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (set_id, dimension_value)
);
CREATE INDEX IF NOT EXISTS idx_allocation_target_items_set ON allocation_target_items (set_id);

CREATE TABLE IF NOT EXISTS annotations (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    anchor_kind varchar(16)  NOT NULL,
    anchor_keys jsonb        NOT NULL DEFAULT '{}'::jsonb,
    event_date  date         NOT NULL,
    label       varchar(64)  NOT NULL,
    body        text,
    color       varchar(16),
    source      varchar(16)  NOT NULL DEFAULT 'manual',
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_annotations_date ON annotations (event_date);

-- +goose Down
DROP TABLE IF EXISTS annotations;
DROP TABLE IF EXISTS allocation_target_items;
DROP TABLE IF EXISTS allocation_target_sets;

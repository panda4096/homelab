-- P0 地基：标的元数据、用户偏好（单行）、建账模板（含内置模板）。
-- 对应 PRD §5.2.2 / §5.2.13 / §5.2.12。账户与快照等表在 P1 起建。

-- +goose Up
CREATE TABLE IF NOT EXISTS instruments (
    symbol          varchar(64) PRIMARY KEY,
    display_name    varchar(128),
    market          varchar(16),
    quote_currency  varchar(8),
    asset_kind      varchar(16),
    is_benchmark    boolean     NOT NULL DEFAULT false,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_preferences (
    id                       int         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    display_currency         varchar(8)  NOT NULL DEFAULT 'CNY',
    fx_mode                  varchar(16) NOT NULL DEFAULT 'current',
    time_aggregation_default varchar(8)  NOT NULL DEFAULT 'month',
    market_convention        varchar(16) NOT NULL DEFAULT 'western',
    updated_at               timestamptz NOT NULL DEFAULT now()
);

INSERT INTO user_preferences (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS account_templates (
    id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name               varchar(128) NOT NULL UNIQUE,
    description        text,
    is_builtin         boolean     NOT NULL DEFAULT false,
    account_blueprints jsonb       NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO account_templates (name, description, is_builtin, account_blueprints) VALUES
('汇丰多币种三件套', '汇丰一户三账户：港币现金 + 港股 + 美股', true,
 '[{"name_suffix":"港币现金","kind":"cash","currency":"HKD"},{"name_suffix":"港股账户","kind":"brokerage","currency":"HKD"},{"name_suffix":"美股账户","kind":"brokerage","currency":"USD"}]'::jsonb),
('富途证券标准', '富途证券：美股 + 港股 + 账户现金', true,
 '[{"name_suffix":"美股账户","kind":"brokerage","currency":"USD"},{"name_suffix":"港股账户","kind":"brokerage","currency":"HKD"},{"name_suffix":"现金","kind":"cash","currency":"USD"}]'::jsonb),
('招行借记+信用卡', '招商银行：借记现金 + 信用卡', true,
 '[{"name_suffix":"借记现金","kind":"cash","currency":"CNY"},{"name_suffix":"信用卡","kind":"credit_card","currency":"CNY"}]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS account_templates;
DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS instruments;

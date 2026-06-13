-- P3 dev 种子：信用卡合计账户 + 两期账单，支撑负债与盘点向导验收。
WITH inst AS (
    INSERT INTO institutions (name, kind, note)
    VALUES ('招商银行', 'bank', 'dev seed')
    ON CONFLICT (name) DO UPDATE SET kind = EXCLUDED.kind, updated_at = now()
    RETURNING id
),
cc_account AS (
    INSERT INTO accounts (institution_id, name, currency, kind, note, display_order)
    SELECT id, '信用卡合计', 'CNY', 'credit_card', 'dev seed', 90
    FROM inst
    ON CONFLICT (institution_id, name) DO UPDATE SET
        kind = EXCLUDED.kind,
        note = EXCLUDED.note,
        updated_at = now()
    RETURNING id
),
pay_account AS (
    INSERT INTO accounts (institution_id, name, currency, kind, note, display_order, is_archived)
    SELECT id, '还款现金账户', 'CNY', 'cash', 'dev seed repayment account', 80, false
    FROM inst
    ON CONFLICT (institution_id, name) DO UPDATE SET
        currency = EXCLUDED.currency,
        kind = EXCLUDED.kind,
        note = EXCLUDED.note,
        is_archived = false,
        updated_at = now()
    RETURNING id
),
bill_seed AS (
    INSERT INTO credit_card_bills (
        account_id, statement_date, amount_total, currency, top_categories,
        paid_at, payment_account_id, note
    )
    SELECT
        cc_account.id,
        current_date - interval '11 days',
        18640.00,
        'CNY',
        '[{"name":"餐饮","amount":"6200.00"},{"name":"网购","amount":"8120.00"},{"name":"数码","amount":"4320.00"}]'::jsonb,
        NULL,
        NULL,
        'dev seed unpaid'
    FROM cc_account
    UNION ALL
    SELECT
        cc_account.id,
        current_date - interval '42 days',
        16400.00,
        'CNY',
        '[{"name":"日用","amount":"5400.00"},{"name":"旅行","amount":"11000.00"}]'::jsonb,
        current_date - interval '30 days',
        pay_account.id,
        'dev seed paid'
    FROM cc_account
    JOIN pay_account ON true
    ON CONFLICT (account_id, statement_date) DO UPDATE SET
        amount_total = EXCLUDED.amount_total,
        currency = EXCLUDED.currency,
        top_categories = EXCLUDED.top_categories,
        paid_at = EXCLUDED.paid_at,
        payment_account_id = EXCLUDED.payment_account_id,
        note = EXCLUDED.note,
        updated_at = now()
    RETURNING 1
)
SELECT 1;

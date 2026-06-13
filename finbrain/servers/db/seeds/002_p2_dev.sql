-- P2 dev 种子：半年 ^HSI 稀疏历史价格 + 近月常用 FX。
WITH hsi_prices AS (
    INSERT INTO prices (symbol, price_date, price, currency, source, note)
    SELECT
        '^HSI',
        d::date,
        (18000 + (row_number() OVER (ORDER BY d) * 23.75))::numeric(20,8),
        'HKD',
        'manual',
        'dev seed'
    FROM generate_series(current_date - interval '180 days', current_date, interval '5 days') AS d
    ON CONFLICT (symbol, price_date, currency) DO UPDATE SET
        price = EXCLUDED.price,
        source = EXCLUDED.source,
        note = EXCLUDED.note,
        updated_at = now()
    RETURNING 1
),
current_position_prices AS (
    INSERT INTO prices (symbol, price_date, price, currency, source, note) VALUES
        ('GOOG', current_date, 184.25000000, 'USD', 'manual', 'dev seed'),
        ('0700.HK', current_date, 401.20000000, 'HKD', 'manual', 'dev seed')
    ON CONFLICT (symbol, price_date, currency) DO UPDATE SET
        price = EXCLUDED.price,
        source = EXCLUDED.source,
        note = EXCLUDED.note,
        updated_at = now()
    RETURNING 1
),
fx_seed AS (
    INSERT INTO fx_rates (base_currency, quote_currency, rate_date, rate, source, note) VALUES
        ('USD', 'CNY', current_date - interval '30 days', 7.18000000, 'manual', 'dev seed'),
        ('USD', 'CNY', current_date - interval '15 days', 7.20000000, 'manual', 'dev seed'),
        ('USD', 'CNY', current_date, 7.21000000, 'manual', 'dev seed'),
        ('HKD', 'CNY', current_date - interval '30 days', 0.91800000, 'manual', 'dev seed'),
        ('HKD', 'CNY', current_date - interval '15 days', 0.92000000, 'manual', 'dev seed'),
        ('HKD', 'CNY', current_date, 0.92100000, 'manual', 'dev seed'),
        ('USD', 'HKD', current_date - interval '30 days', 7.82000000, 'manual', 'dev seed'),
        ('USD', 'HKD', current_date - interval '15 days', 7.83000000, 'manual', 'dev seed'),
        ('USD', 'HKD', current_date, 7.83500000, 'manual', 'dev seed')
    ON CONFLICT (base_currency, quote_currency, rate_date) DO UPDATE SET
        rate = EXCLUDED.rate,
        source = EXCLUDED.source,
        note = EXCLUDED.note,
        updated_at = now()
    RETURNING 1
)
SELECT 1;

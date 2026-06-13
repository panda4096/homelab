-- P0 dev 种子：仅标的（账户/快照表在 P1 起建，届时本目录增量扩展）。
-- 单文件 = 单条语句（seed runner 按整文件执行）。
INSERT INTO instruments (symbol, display_name, market, quote_currency, asset_kind, is_benchmark) VALUES
    ('GOOG',    'Alphabet',   'US',     'USD', 'equity', false),
    ('0700.HK', '腾讯控股',   'HK',     'HKD', 'equity', false),
    ('BTC-USD', 'Bitcoin',    'CRYPTO', 'USD', 'crypto', false),
    ('^HSI',    '恒生指数',   'INDEX',  'HKD', 'index',  true)
ON CONFLICT (symbol) DO NOTHING;

-- 余额快照按货币金额处理，两位小数足够；持仓数量/成本不受影响。

-- +goose Up
ALTER TABLE balance_snapshots
    ALTER COLUMN balance TYPE numeric(20,2)
    USING round(balance, 2);

-- +goose Down
ALTER TABLE balance_snapshots
    ALTER COLUMN balance TYPE numeric(20,4)
    USING balance::numeric(20,4);

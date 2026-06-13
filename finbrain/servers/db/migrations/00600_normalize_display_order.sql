-- 把已有显示顺序归一化为 0/10/20...，拖拽后也按这个间隔继续写入。

-- +goose Up
WITH ordered_institutions AS (
    SELECT id,
           (row_number() OVER (ORDER BY display_order, name, id) - 1) * 10 AS next_order
    FROM institutions
)
UPDATE institutions i
SET display_order = ordered_institutions.next_order
FROM ordered_institutions
WHERE i.id = ordered_institutions.id;

WITH ordered_accounts AS (
    SELECT id,
           (row_number() OVER (
               PARTITION BY institution_id
               ORDER BY display_order, kind, name, id
           ) - 1) * 10 AS next_order
    FROM accounts
)
UPDATE accounts a
SET display_order = ordered_accounts.next_order
FROM ordered_accounts
WHERE a.id = ordered_accounts.id;

-- +goose Down
-- no-op: restoring duplicate/manual display_order values is not meaningful.

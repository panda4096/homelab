-- 账户列表显示顺序。机构已有 display_order；账户也需要同机构内可拖拽排序。

-- +goose Up
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS display_order int NOT NULL DEFAULT 0;

WITH ordered AS (
    SELECT id,
           (row_number() OVER (
               PARTITION BY institution_id
               ORDER BY kind, name, id
           ) - 1) * 10 AS next_order
    FROM accounts
)
UPDATE accounts a
SET display_order = ordered.next_order
FROM ordered
WHERE a.id = ordered.id;

-- +goose Down
ALTER TABLE accounts DROP COLUMN IF EXISTS display_order;

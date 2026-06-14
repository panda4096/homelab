# finbrain P9 执行清单：账号登录 + 每用户数据隔离

> 决策（业主 2026-06-15）：**面向个人用户**（非企业多租户）。开放注册、**用户名 + 密码**（`user_identities` 预留微信/邮箱/Google）、**argon2id 单向哈希**、**不做自助找回**（后台 CLI 重置 + 用户自助改密）、**时区可设默认东八区**、**每用户 `user_id` 行隔离**（共享 schema，不用 RLS / 分 schema）。
> 权威规格见 `PRD.md` §9；本文件是 P9 的施工与跟踪清单，与 PRD 冲突以 PRD 为准。
> 进度记号：`[ ]` 待办 · `[~]` 进行中 · `[x]` 完成。每勾一项前先确认对应自验通过。

## 0. 横切约定 & 闸门

- [x] argon2id 经 `golang.org/x/crypto/argon2`，**绝不**用 `sha256hex`（那是 API key/会话 token 用的）；密码哈希参数（time/memory/threads）写进常量并记于 §9。
- [ ] store 方法**显式接收 `userID int64`**，SQL 追加 `AND user_id=$N`（漏传=编译错）；每条 owned 查询打 `/* OWNED */` 注释。
- [x] 全局行情表**不加** `user_id`、**不加**谓词：`instruments` / `prices` / `fx_rates` / `corporate_actions` / `account_templates`。
- [x] dev（`cfg.IsDev()`）无会话默认 `userID=1`，现有免登录开发流不中断；生产受保护路由无会话 → 401。
- [x] 每阶段自验：`GOTOOLCHAIN=local go build ./... && go vet ./internal/... && go test ./internal/...` + `npx tsc -b` + 浏览器 preview → 提交 → 简报。
- [ ] 顺序：P9.0 → P9.1（**网关表 accounts/institutions 先做先测**）→ P9.2（扇出）→ P9.3（agent/审计）→ P9.4（加固）。每阶段一提交。

---

## 1. 数据模型（迁移 `db/migrations/01400_p9_auth.sql`）

**新表**
- [x] `users(id GENERATED ALWAYS AS IDENTITY PK, display_name varchar(128), is_active boolean NOT NULL DEFAULT true, created_at, updated_at)`
- [x] `user_identities(id PK, user_id FK→users, provider varchar(16) NOT NULL, identifier varchar(255) NOT NULL, secret text NOT NULL, must_change_password boolean NOT NULL DEFAULT false, created_at, UNIQUE(provider, identifier))`
- [x] `sessions(id PK, user_id FK→users, token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, created_at, last_used_at, revoked_at)`

**种子（保证现有数据零丢失）**
- [x] 插入默认 `users` 行 → `id=1`（display_name='owner'）
- [x] 插入 `user_identities(user_id=1, provider='password', identifier='owner', secret=<占位/部署时由 CLI 重置>, must_change_password=true)`

**owned 表加 `user_id`（逐表勾，模式：`ADD COLUMN user_id bigint` → `UPDATE … SET user_id=1` → `ALTER … SET NOT NULL` → 加 FK）**
- [x] 根表：`accounts`
- [x] 根表：`institutions`
- [x] 根表：`allocation_target_sets`
- [x] 根表：`allocation_target_items`
- [x] 根表：`summaries`
- [x] 根表：`annotations`
- [ ] 根表：`api_keys`
- [ ] 根表：`agent_audit`（历史行回填=1；或保留 NULL 作"pre-tenancy"——按 §9 取回填=1）
- [x] 子表（反范式）：`balance_snapshots`
- [x] 子表：`position_snapshots`
- [x] 子表：`transactions`
- [x] 子表：`transfers`
- [x] 子表：`income_events`
- [x] 子表：`credit_card_bills`

**唯一约束改造（按用户）**
- [x] `institutions`：drop `name` UNIQUE → `UNIQUE(user_id, name)`
- [x] `accounts`：drop `(institution_id, name)` UNIQUE → `UNIQUE(user_id, institution_id, name)`
- [x] `allocation_target_sets`：drop `name` UNIQUE → `UNIQUE(user_id, name)`

**user_preferences 单行 → 每用户**
- [x] drop `id INT PRIMARY KEY CHECK(id=1)`；`ADD user_id bigint`；现有行 `SET user_id=1`；`ADD UNIQUE(user_id)`
- [x] `ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'`

**完整性触发器 & 索引**
- [x] `enforce_owner()` 触发器：在 `balance_snapshots/position_snapshots/transactions/transfers/income_events/credit_card_bills` 校验 `NEW.user_id = (SELECT user_id FROM accounts WHERE id=NEW.account_id)`；`transfers` 同时校验 `to_account_id`，`income_events/credit_card_bills` 校验 `payment_account_id`；`allocation_target_items` 校验 `set_id` 归属；Go 侧也在 handler/store 做前置校验。
- [x] 热索引把 `user_id` 提到首列（如 `idx_transactions_acct_date`、`idx_balance_snapshots_acct_date`、`idx_position_snapshots_acct_sym_date` 等逐个重建）

**回滚**
- [ ] `-- +goose Down`：删触发器 → 还原索引/唯一约束 → 还原 `user_preferences` 单行 → 删各表 `user_id` → 删 `sessions`/`user_identities`/`users`
- [ ] 在 NUC dev DB 副本上跑通 up→down→up，确认无损

---

## 2. P9.0 · 认证基座 + 登录（先不做隔离）

**后端**
- [x] `internal/crypto`（或 auth 内）：`HashPassword(pw) (string,error)` / `VerifyPassword(pw, encoded) bool`（argon2id，常量时间）
- [x] `internal/store/users.go`：`CreateUser` · `GetPasswordIdentity(username)` · `CreateSession` · `ResolveSession(hash)→(userID, error)`（顺带刷新 last_used_at、校验未过期未吊销）· `RevokeSession` · `RevokeUserSessions(userID)` · `SetPassword(userID, hash, mustChange bool)` · `GetUser(id)`
- [x] `internal/httpapi/session_middleware.go`：`sessionMiddleware`（cookie `fb_session` 或 `Bearer fbs_` → `ctxUserID`；dev 缺省 1；生产缺省 401）+ `userOf(r) int64` + 新 ctxKey `ctxUserID="fb.uid"`
- [x] `internal/httpapi/auth.go`：`POST /api/auth/register`（开放）· `POST /api/auth/login`（设 cookie）· `POST /api/auth/logout`（吊销+清 cookie）· `GET /api/auth/me`（返回 user + timezone）· `POST /api/auth/change-password`（校验旧→写新→吊销其余会话）
- [x] `router.go`：把 auth 路由挂在 `authMiddleware` 之外；在 `/api` 链上把 `sessionMiddleware` 插在 `authMiddleware` 与 `mutationAuditMiddleware` 之间
- [x] `actorOf()` 回退由 `owner` 改为 `user:<id>`（有会话时）
- [x] `cmd/finbrain-admin`：`set-password <username> <临时密码>`（argon2 写库 + `RevokeUserSessions` + 置 `must_change_password=true`）

**前端**
- [x] `api.ts`：`request<T>` 加 `credentials:'include'`；全局 `401 → 跳 /login`
- [x] `api.ts`：`register/login/logout/getMe/changePassword`
- [x] auth zustand store（user / status）；`App.tsx` 启动先 `getMe()`（401 渲染登录页，否则 hydrate 偏好）
- [x] `screens/Login.tsx`（登录 + 注册切换）；`ProtectedRoute`；`/login` 路由
- [x] Topbar/Sidebar 加用户菜单 + 登出；`must_change_password` 时引导改密

**DoD（P9.0）**
- [x] 可注册→登录→`/me`→登出；重复用户名/错误密码被拒；CLI 重置后旧会话失效、可用新密码登录；改密后其余会话失效。**此时数据仍全归 user 1，隔离未启用。**

---

## 3. P9.1 · `user_id` 列落地 + 网关表隔离（先做先测）

- [x] 跑 P9.1 gateway 迁移（`accounts/institutions` 建列/回填 user 1/约束/索引；子表触发器留到 P9.2）
- [x] `store/accounts.go`：`ListAccounts/GetAccount/accountFull/accountMeta/CreateAccount/AccountHasData/DeleteAccountIfEmpty` 全部加 `userID` 参数 + `/* OWNED */` 谓词；`CreateAccount` 的 display_order 子查询加 `AND user_id=$`
- [x] `store/institutions.go`：同上
- [x] handler 层从 `userOf(r)` 取 `userID` 下传；agent 路径从 `ctxUserID` 取
- [x] `store/preferences.go`：`Get/UpdatePreferences` 由 `WHERE id=1`/`ON CONFLICT(id)` 改为 `WHERE user_id=$1`/`ON CONFLICT(user_id)`；返回含 timezone
- [x] **隔离测试**：建两个用户各自的机构/账户，互查/互删/直传他人 account_id 全部被拒；全局行情仍共享

**DoD（P9.1）**：accounts/institutions/preferences 完全按用户隔离并通过跨用户测试。

---

## 4. P9.2 · 扇出到其余 owned store

- [x] `balance_snapshots` / `position_snapshots` 读写加 `userID`
- [x] `transactions`（含 §6.15 回放查询）
- [x] `transfers`（双账户都校验同属当前用户）
- [x] `income_events`（`payment_account_id` 校验）
- [x] `credit_card_bills`（`payment_account_id` 校验）
- [x] `allocation_targets`（sets + items）
- [x] `annotations` / `summaries`
- [x] `valuation.go` 全部聚合 / `DISTINCT ON` / `LATERAL` 子查询按用户过滤（用子表反范式 `user_id`，热路径不加 join）
- [x] `review_batch.go`：批量写入**前**校验所有引用账户（含 transfer 双账户、payment_account_id）归属当前用户
- [x] `export.go`：导出限定当前用户
- [x] grep 审计：P9.2 owned 表 `SELECT/UPDATE/DELETE/INSERT` 均带 `user_id`；`instruments.go` 对 owned 表的无用户计数仅用于全局标的删除保护；`api_keys/agent_audit` 留到 P9.3。

**DoD（P9.2）**：全站所有视图/录入/导出仅作用于当前用户数据；跨用户越权用例全绿。

---

## 5. P9.3 · Agent / API Key / 审计按用户化

- [ ] `ResolveAPIKey` 返回 `user_id`；`agentAuthMiddleware` 注入 `ctxUserID`
- [ ] `ListAPIKeys/CreateAPIKey/RevokeAPIKey` 按 `userOf` 过滤/打戳
- [ ] `InsertAuditEvent` + `mutationAuditMiddleware` 记录 `user_id`；`ListAuditEvents` 按用户过滤（保留可选全局视图）
- [ ] 验证：agent 用某用户的 key 只能读写该用户数据；审计仅显示本人行为

**DoD（P9.3）**：agent 技能/审计/API key 全部按用户隔离，技能业务代码无需改动。

---

## 6. P9.4 · 生产加固

- [ ] cookie `Secure` 仅生产开启；同源假设复核（Vite 代理 / StaticDir）
- [ ] 部署前由 CLI 为 user 1 设真实密码
- [ ] CI/评审门禁：grep owned 表查询缺 `/* OWNED */` 即失败
- [ ] 时区端到端：切换用户时区后，估值截面/趋势/对账"今天"随之变化
- [ ] `FINBRAIN_ENV=production` 切换演练（dev 默认 user 1 → 生产强制会话，无停机窗口）

**DoD（P9.4）**：生产模式登录强制生效、密码已设、隔离门禁就位。

---

## 7. 风险登记（执行中持续核对）
- [ ] 越权主风险：漏一个 `accounts` 谓词即泄漏 → 显式 `userID` 参数 + grep 门禁 + 网关表先测
- [ ] 子表 `user_id` 一致性（transfers 双账户 / payment_account_id / review_batch 批量）→ 触发器 + Go 侧校验
- [ ] argon2 与 sha256 不可混用（密码绝不走 `sha256hex`）
- [ ] 唯一约束/`user_preferences` 改造为单向迁移 → 先在 dev DB 副本演练 up/down
- [ ] 时区下沉影响所有"今天"计算 → 回归估值/趋势/对账

## 8. 进度日志
| 日期 | 阶段 | 状态 | 备注 |
|---|---|---|---|
| 2026-06-15 | 设计 + 本清单 | 完成 | PRD §9 重写；本文件创建（未动实现代码） |
| 2026-06-15 | P9.0 认证基座 | 完成 | 新增 argon2id 密码、users/user_identities/sessions、session middleware、auth API、admin set-password、登录页；NUC dev 01400 up 通过，curl 验证注册/登录/改密/重置/登出，浏览器验证 dev user 1 免登录 |
| 2026-06-15 | P9.1 gateway 隔离 | 完成 | 新增 01410 gateway 迁移，将既有机构/账户回填到 user 1；accounts/institutions/preferences 入口按 user 隔离；接口验证 A/B 用户互查/互删/直传对方 account_id 均被拒，全局 instruments 仍共享；临时测试账户下空机构/账户已通过 API 清理 |
| 2026-06-15 | P9.2 owned 业务数据隔离 | 完成 | 新增 01420 owned 数据迁移，保留既有行并按账户/目标集回填 owner；balance/position/transactions/transfers/income/credit-card/targets/annotations/summaries/valuation/replay/recon/attribution/export/review batch 全链路下传 userID；NUC dev 迁移到 1420，Go build/vet/test 通过；API A/B 越权验证覆盖读写删、列表、估值、批量盘点，临时 `p9test` 数据已清理为 0 |

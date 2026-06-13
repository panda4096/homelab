# finbrain 开发交接（给 Codex）

权威文档：[`PRD.md`](PRD.md)（产品规格）、[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)（分阶段方案 P0–P7）。
`../design/` 是 Claude Design 原型，**只读参考，禁止 import / 修改**。后端 `../servers`（Go），前端 `../webs`（Vite+React+TS）。

进度：**P0 地基、P1 账户与快照 + 机构管理 已完成**；当前在修 P1 的几个 UI bug（见下）。下一阶段是 **P2 估值与仪表盘**。

---

## 1. 怎么跑 / 调试

**数据库**：复用 infra 已部署的 NUC dev postgres `192.168.100.29:30432`，库 `finbrain`，角色 `finbrain`（密码在 `../../infra/.secrets/postgresql.env` 的 `FINBRAIN_DB_PASSWORD`）。**不要起本地 docker postgres**。本机没装 psql，要连库用 docker 当客户端（需 `colima start` 起 docker）：
```bash
set -a; source ../../infra/.secrets/postgresql.env; set +a; export PGPASSWORD="$FINBRAIN_DB_PASSWORD"
docker run --rm -e PGPASSWORD postgres:17-alpine psql -h 192.168.100.29 -p 30432 -U finbrain -d finbrain -c "\dt"
```

**后端**（:8000）：
```bash
cd finbrain/servers
make migrate    # 跑迁移（db/migrations/00100..00400）
make seed       # dev 种子（标的）
make run        # 启动；Makefile 已设 GOTOOLCHAIN=local 并从密钥拼 DATABASE_URL
# 校验： GOTOOLCHAIN=local go build ./...  &&  go test ./...
```
重启前先 `pkill -f "finbrain serve"`。健康检查 `curl localhost:8000/healthz`。

**前端**（:5173，dev 代理 `/api`→:8000）：
```bash
cd finbrain/webs
npm run dev
npm run build   # 必须过：tsc -b && vite build（CI 门槛）
```

**当前后台已在跑**：一个 `go run ... serve`（:8000，nohup）和一个 vite dev（:5173）。Codex 接手可先 `pkill -f "finbrain serve"` 再 `make run`，前端 `npm run dev` 会复用/另起。

**关键坑**：
- 本机 `GOSUMDB=off` → `go` 无法自动下新 toolchain，**所有 go 命令加 `GOTOOLCHAIN=local`**；依赖须兼容 Go 1.25.4（goose 已固定 `v3.24.3`，别 `go get -u`）。
- 金额/数量在 API/JSON 里是 **decimal 字符串**（不是 number），前端只做展示格式化。
- 所有弹窗必须走 `webs/src/shell/Modal.tsx`（已改为 `createPortal` 到 body）——否则会被路由层 `.fb-fade` 的 transform 当成定位容器而**裁切**（这就是“机构编辑页遮挡”的根因）。
- 账户：机构创建后不可改；账户名 **机构内唯一**（`UNIQUE(institution_id,name)`），用精简名（港币/美股…），机构在 UI 单独体现。

---

## 2. 本会话正在修的 3 个 bug（用户报的）

### ✅ (1) 机构编辑页遮挡 — 已修
`webs/src/shell/Modal.tsx` 改用 `createPortal(..., document.body)`。需 `npm run build` + 浏览器复验：/institutions 点编辑，弹窗应居中不裁切。

### ⏳ (2) “账户新增按钮没找到” — 未做
按钮其实存在（/accounts 右上 “建账”，打开 `BuildAccount` 含“从模板/手动建账”，功能完好），是**标签不直观**。改名 “建账” → “新增账户”：
- `webs/src/screens/Accounts.tsx` 第 ~87、~336 行的按钮文案
- `webs/src/screens/Dashboard.tsx` 第 ~87、~114、~141 行的按钮文案（“内置建账模板”标题、prose 里的“建账”可不动）
- `webs/src/screens/BuildAccount.tsx` 第 ~128 行 Modal `title="建账"` → “新增账户”

### ⏳ (3) 快照不支持编辑 — 进行中（约 70%）
做法：复用快速录入弹窗做“编辑快照”（upsert 同 account+date[+symbol] 即覆盖=编辑）。
**已完成**：
- `webs/src/uiStore.ts`：`QuickEntryState` 已 export 并加了 `isEdit/date/balance/symbol/quantity/avgCost/costCurrency/note` 预填字段。
- `webs/src/screens/QuickEntry.tsx`：加了 `isEdit`，state 用 `initial.*` 预填，标题 `isEdit?'编辑快照':'快速录入'`，编辑时隐藏类型 Segmented、禁用账户 Select、禁用日期 Input。
**还差**（Codex 收尾）：
- `QuickEntry.tsx` 标的 `<Input>`（持仓 symbol，约第 300 行）加 `disabled={isEdit}`（账户/日期/标的都锁住才是“编辑同一条”）。
- `webs/src/screens/AccountDetail.tsx`：在**余额快照行**（~287 行删除按钮处）和**持仓历史行**（~458 行删除按钮处）各加一个“编辑” `IconButton`（图标 `pencil`），点击调 `openQuickEntry({...})`：
  - 余额：`openQuickEntry({ accountId: account.id, type:'balance', isEdit:true, date:s.snapshot_date, balance:s.balance, note:s.note??'' })`（该组件已有 `openQuickEntry`、`account`）。
  - 持仓历史：`openQuickEntry({ accountId, type:'position', isEdit:true, date:h.snapshot_date, symbol:h.symbol, quantity:h.quantity, avgCost:h.avg_cost??'', costCurrency:h.cost_currency??'', note:h.note??'' })`——`PositionRow` 组件（约 384 行）需加 `const openQuickEntry = useUiStore(s=>s.openQuickEntry)`，并 `import { useUiStore } from '../uiStore'`。
  - 两处操作列原 `Th w={60}` / `<Td right>` 容不下两个按钮，加宽到 ~88。
- 最后 `npm run build` 过 + 浏览器复验：余额/持仓行有编辑按钮，点开预填且账户/日期/标的锁定，改值保存后列表刷新。

> 已改文件（本会话）：`shell/Modal.tsx`、`uiStore.ts`、`screens/QuickEntry.tsx`（以上 3 个 bug）；另外上一轮还改了 `screens/Accounts.tsx`(色块按 KIND_TONE)、`screens/AccountDetail.tsx`(成本去重币种)、`screens/EditAccount.tsx`(机构只读) 等。建议先 `npm run build` 确认基线绿。

---

## 3. P1 其余待办（非阻塞，用户已知）

- 顶栏币种切换（CNY/HKD/USD）P1 不换算（换算是 P2，需汇率）；现在切了没反应，**建议 P1 先把切换器隐藏/置灰**，或留到 P2。
- 证券账户在账户列表余额显示“—”尽管有持仓（持仓市值需价格，P2）。
- 账户详情顶栏标题显示“账户列表”而非账户名（`webs/src/App.tsx` 按路径首段取 title，小问题）。
- 账户名前缀：现有 5 个账户已改精简名；如还有带“机构 ”前缀的旧数据可 SQL 清。
- bundle 体积：`lucide-react` 整包打入（JS ~955KB），按用到的 ~30 个图标 tree-shake。
- 删除确认用的是 `window.confirm`，可改成品牌化弹窗。

NUC 上现有 dev 数据：机构 `汇丰香港`(bank) + 5 账户(人民币/港币/美元/美股/港股)，我测试时录了几条余额/持仓快照（GOOG/0700.HK）。可按需清理。

---

## 4. 后续阶段（详见 IMPLEMENTATION_PLAN.md §5）

P2 估值与仪表盘（prices/fx_rates + §6.2–6.9 净资产/持仓盈亏/币种暴露 + 仪表盘点亮 + 持仓总览 + 展示币种联动）→ P3 盘点与负债 → P4 交易·对账 → P5 趋势分析 → P6 LLM → P7 收尾。每阶段一个纵向切片、严格“本阶段不做”边界、不污染 design/。

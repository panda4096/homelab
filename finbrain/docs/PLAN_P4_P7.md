# finbrain P4–P7 详细执行计划(冲刺到「接近上线」)

> 决策(业主 2026-06-14 夜)：**P4–P7 全做到近上线** · **等 Codex 修完 P3 再开始**(不与 Codex 同仓并行) · **§6.19 现金预期余额/对账并入 P4** · **LLM 用 DeepSeek(DEEPSEEK_API_KEY 已配)**。
> 「近上线」= 功能完整 + 打磨 + 测试绿 + 全站空态/缺数据降级 + 端到端自验通过。**部署/上线编排仍不在范围**(按既有约定)。
> 权威规格 `PRD.md`；本文件是 P4–P7 的施工与边界细化，与 PRD 冲突以 PRD 产品语义为准。

## 0. 开工闸门 & 协作
- **闸门**：Codex 修完 P3 后我才动手。判定「Codex 完成」= 满足全部：① `git log` 出现 `73a60f6` 之后、提及 P3/收口/fix 的提交；② 工作区基本干净(无半改的 P3 文件)；③ `GOTOOLCHAIN=local go build ./... && go test ./...` 与 `npx tsc -b` 全绿；④ P3 评审关键项已修(§6.9 暴露分母、批量导入 API、ReviewWizard 起始步=1、AccountDetail 无重复占位、POST 账单不再静默 upsert)。
- 闸门未达 → 继续等待轮询；达成 → `git pull`/同步后从 P4 起逐阶段实现。
- **每阶段交付检查点**：自验(go build/vet/test + tsc + 浏览器 preview)→ 提交 → 简报。我在主线推进，不再起隔离 worktree(业主已选「等 Codex 完成后做」，无并发冲突)。

## 1. 横切约定(每阶段都遵守)
decimal 全程(shopspring/decimal + ::numeric，绝不 float) · 批量写单事务 + 逐行错误(PLAN §2.6 结构 `{line_index,entity_type,field,error_code,message}`) · 错误信封 · 时区 Asia/Shanghai · 缺数据降级("无价格/按 1:1/—") · 列表 5000 上限+截断提示 · 每阶段补单元+关键集成测试 · `design/` 只读、对标重写不 import。

---

## 2. P4 · 交易 · 收益 · 转账 · 公司动作 · 对账(最硬核)

**目标**：从"快照口径"升级到"交易回放口径"；持仓与盈亏由交易派生、现金可对账；仪表盘交易类指标转真。

### 后端
- **迁移 01000_p4**：`transactions`(账户/标的/buy|sell/成交日/结算日?/数量/单价/币种/手续费?/settled)、`transfers`(从账户/到账户/日期/从额+从币/到额+到币/备注，§6.18)、`income_events`(§5.2.6：event_kind dividend|interest|rebate|other/事件日/账户/标的?/金额/币种/已扣税?/现金落地账户?)、`corporate_actions`(§6.17：标的/split|merge|rights/除权日/比例参数)。约束与 FK、唯一键按 §5.2；金额列 numeric(20,4)。
- **计算**：
  - §6.15 交易回放派生 `quantity_at` / 加权买入成本 / 净持有成本；(account,symbol) 有交易历史时优先回放，否则回退 `position_snapshots`(与 §6.7 衔接)。
  - §6.16 已实现盈亏 + 手续费口径(FIFO/加权按 PRD)；§6.11 收益事件累计(按持仓汇总，折显示币)。
  - §6.17 公司动作回放(split/merge 调整数量与成本基；rights 处理)。
  - §6.18 转账：净资产不变，仅改账户/币种分布；跨币种由业主录两侧实额，不算汇率。
  - **§6.19 现金预期余额**(并入本阶段)：`最近余额快照 + Σ交易现金效应 + Σ转账(±) + Σ收益事件(现金落地) + Σ信用卡还款(payment_account_id, 已还且在窗口内 −amount_total)` → 预期；与最新快照差额、阈值高亮。
  - §6.20 持仓快照 vs 回放对账(数量/成本差异提示)。
  - 仪表盘交易类指标(已实现盈亏 YTD、累计收益)由占位转真。
- **API**：transactions / transfers / income-events / corporate-actions 各 CRUD + 列表筛选；现金对账只读端点(account → 预期/快照/差额/事件流)；§6.20 对账端点。批量(盘点向导步4/5/7/8)纳入既有 `/reviews/batch` 单事务。

### 前端
- §7.9 持仓交易(buy/sell 切换、自动补全标的+新标的补元数据、未结算/已结算切换、提交预览本笔影响、对账提示条)。
- §7.8 收益事件、§7.11 转账、§7.10 公司动作、§7.12 现金对账(预期/快照/差额 + 事件流 + 差额排查清单；对标 design `ManageScreens.jsx::Recon`)。
- 盘点向导**补回步4 交易回顾 / 步5 转账 / 步7 收益事件 / 步8 现金对账**(把 P3 的占位换真)。
- 仪表盘交易类卡片转真值；账户详情补交易/收益/转账区块与对账卡。

### 验收(DoD)
交易回放出的数量/成本/已实现盈亏与手写 SQL 一致；公司动作回放正确；转账净资产不变；§6.19 预期余额与对账差额正确(含信用卡还款扣减)；§6.20 对账提示正确；批量原子；仪表盘交易指标转真。**本阶段不做**：趋势时间序列/目标漂移/基准(P5)、LLM(P6)。

---

## 3. P5 · 趋势与分析

**目标**：时间序列、配置漂移、期间对比与归因、基准对比。

### 后端
- 迁移 `allocation_target_sets`/`allocation_target_items`、`benchmarks`(已部分)、`annotations`。
- §6.5 时间轴截面(每日/月/季/年) + §6.14 稀疏每日曲线(`generate_series` + `LATERAL` 取最近一条)；§6.10 配置漂移(actual vs target、再平衡建议)；§6.12 期间对比 + 增长归因(价格/数量/收益/汇率四桶)；§6.13 基准对比(绝对/归一 rebase=100/超额)。
- API：趋势序列(on_date 区间 + 粒度 + 展示币 + fx_mode)、漂移、期间对比、多维聚合/透视、基准序列。

### 前端
- §7.15 趋势分析(净资产/持仓曲线 + 基准叠加 + 标注 + 收益事件标记 + 信用卡支出柱)、§7.14 目标配置、§7.16 期间对比、§7.17 多维聚合/透视。复用 `finance.tsx::LineChart` + design 图表。

### 验收
曲线/截面与 SQL 一致；漂移与再平衡金额正确；归因四桶相加=总变化；基准三口径正确。**不做**：LLM(P6)。

---

## 4. P6 · LLM 能力(DeepSeek)

**目标**：自然语言录入/查询/总结。

### 后端
- 迁移 `summaries`。LLM 客户端(DeepSeek 默认，env `DEEPSEEK_API_KEY`；可选 Anthropic 兜底)。
- §8.1 NL 录入：意图识别(11 类) + 字段抽取 + 账户名/标的模糊匹配(top-3 候选) → 产出结构化草稿，**业主确认后才落库**(走既有写接口 + JSON Schema 校验)。
- §8.2 NL 查询：**只读 SQL 沙箱**(白名单 schema/视图、强制 LIMIT、禁写、超时)，把白名单 schema 注入提示词；结果表格化。
- §8.3 阶段总结：基于区间关键数据生成总结，存 `summaries`。
- 凭据不入仓库/日志(§2.4)；LLM 不可用回 503 `llm_unavailable` 并优雅降级到纯手工。

### 前端
- ⌘K 自然语言浮层(录入/查询双模，候选确认 UI)、§7.19 历史阶段总结(列表/详情/对比)。

### 验收
NL 录入抽取正确并经确认落库；NL 查询沙箱不可越权写/读非白名单；总结可生成可对比；无 key 时优雅降级。**不做**：收尾打磨(P7)。

---

## 5. P7 · 收尾(上线质量)

- §7.20 设置(展示币/fx_mode/粒度/阈值/录入默认项/模板入口/LLM key 状态/导出)。
- onboarding 完善(空库引导)、建账模板管理(自定义模板 CRUD)。
- 全站空态/缺数据降级最终打磨；错误边界；lucide tree-shake、bundle 体积。
- 数据导出(按表 CSV 包)。
- 可观测性：结构化日志(不落金额，只记操作+账户ID)、`/healthz`、基本 metrics。
- 端到端自验脚本 + 关键路径回归。

### 验收
设置全可用并回源 preferences；空库 onboarding 走通；导出完整；可观测性就绪；全站无假数据、无裸 console、tsc/go test 绿、浏览器端到端走通。

---

## 6. 执行方式
每阶段一个纵向切片：用 workflow(设计 → 实现 → 对抗评审 → 收口)推进，骨架由主线统一写、可并行的独立部分用子代理；阶段末自验(go build/vet/test + tsc + 浏览器 preview)并提交。顺序 **P4 → P5 → P6 → P7**(P5 依赖 P4 数据，P6 依赖前面 schema)。P5–P7 在进入时按本文细化为可执行任务清单(just-in-time)。

---

## 进度日志（autonomous run）

### P4 — 已完成并验证（commits on branch feat/finbrain-p4-p7）
- ✅ 数据层:迁移 `01000_p4_transactions.sql`(transactions/transfers/income_events/corporate_actions)+ models + store CRUD + httpapi CRUD + routes;账户/标的删除守卫已扩展到新 FK。
- ✅ 交易回放引擎 `replay.go`(§6.15-6.17:买/卖/拆/合/配,加权成本、已实现盈亏、持有段起点、买入费模式),纯函数 + 4 个单测通过。
- ✅ 对账 `reconciliation.go`(§6.19 预期余额+事件流、§6.20 回放 vs 快照持仓差额),`GET /accounts/{id}/reconciliation`。
- ✅ 仪表盘 KPI:valuation 增 `realized_pl_ytd` / `income_ytd`(replay + income_events,折显示币),Dashboard 两张「待 P4」卡转真。
- ✅ 前端 5 屏:持仓交易 §7.9 / 收益事件 §7.8 / 账户转账 §7.11 / 公司动作 §7.10 / 现金对账 §7.12,nav+routes 已接,tsc 绿。
- ✅ **端到端实测**(真库):买100@10 + 卖40@15 fee2 → realized_pl_ytd=198.00 ✓;对账 delta=-402.00 ✓;持仓差额 replay60/snap0 ✓;浏览器 /transactions /recon 渲染无报错。迁移 01000 已应用到 NUC dev 库。

### P4 — 待收尾(refinement,非阻塞核心价值)
- ⏳ 盘点向导 §7.5 步4(交易回顾)/步5(转账)/步7(收益)/步8(现金对账):把 P3 占位替换为真实回填(读 transactions/transfers/income/recon)。
- ⏳ §6.7 持仓「有交易历史时优先回放」:valuation 持仓循环用 replay 覆盖 snapshot 的 quantity/avg_cost(并显示 realized/holding_days)。当前持仓仍按快照口径;对账页已暴露差额供人工同步。
- ⏳ AccountDetail:补交易/收益/转账区块 + 对账卡(链接 /recon)。
- 之后:P5 趋势与分析 → P6 LLM(DeepSeek)→ P7 收尾。

### 运行态
- 后端 P4 二进制:`/tmp/finbrain-p4 serve`(:8000,nohup,日志 /tmp/finbrain-p4.log);DATABASE_URL 由 secrets 拼 NUC。前端 vite :5173。

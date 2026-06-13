# finbrain 分阶段实施方案

> 本文把 [`PRD.md`](PRD.md) 的产品规格与 [`../design/`](../design/) 的高保真原型,落地成一条**可逐阶段推进**的工程路线。
> 原则:前后端都**不一口气全做**,按"纵向切片"逐阶段交付可用增量;`design/` 设计素材**只读、不污染**。
>
> 读者:业主、后端(Go)、前端。本文是实施排期与边界的权威输入;与 PRD 冲突时,产品语义以 PRD 为准、实施顺序以本文为准。
>
> _v3:全新工程;已剥离部署相关内容(旧的 `infra/apps/finbrain` 清单已废弃,不参考)。_

---

## 1. 总体架构与目录约定

finbrain 是一个**全新工程**:后端 Go(`servers/`)提供 `/api/*` JSON API + §6 计算规则 + LLM 能力;前端(`webs/`)是独立 SPA;二者都挂在 PostgreSQL 上。开发期前后端分别跑(Vite dev server 代理 `/api` 到 Go)。**如何打包 / 部署上线不在本方案范围**(见 §6);旧的 `infra/apps/finbrain` 部署清单已废弃,本方案不依赖、不参考它。

### 1.1 目录布局(均在 `finbrain/` 下,互不交叉)

```
finbrain/
├── docs/        PRD.md · IMPLEMENTATION_PLAN.md(本文)
├── design/      Claude Design 导出的原型 + 设计系统 —— 只读参考,永不被引用/修改
├── servers/     Go 后端(API + 计算规则 + LLM + 静态托管 + 迁移)
└── webs/        前端(Vite + React + TS),构建产物由 servers 内嵌托管
```

> 后端放 `servers/`、前端放 `webs/` —— 按业主要求。`design/` 与二者物理隔离(见 §3)。

### 1.2 技术选型(建议值,Phase 0 敲定后即冻结)

| 层 | 选型 | 理由 |
|---|---|---|
| 后端语言 | **Go**(module `github.com/panda4096/homelab/finbrain/servers`) | 业主指定;编译为单二进制、低占用 |
| HTTP 路由 | **chi** | 轻量、stdlib 兼容、中间件清晰 |
| 数据库 | **PostgreSQL**(独立库 `finbrain`) | PRD §10 |
| DB 访问 | **pgx/v5** + **sqlc**(类型安全、手写 SQL) | §6 计算规则高度 SQL 化(`generate_series`+`LATERAL`),sqlc 让手写 SQL 直出类型 |
| 迁移 | **goose**(SQL 迁移 + `go:embed`,作为 `finbrain migrate` 子命令) | 简单、可嵌入二进制 |
| 金额 | DB 用 `numeric`;Go 侧用 **shopspring/decimal**,绝不用 float | 钱不能有浮点误差 |
| 前端 | **Vite + React 18 + TypeScript** | 原型即 React;Vite 构建快;在根路径 `/` 提供 |
| 数据请求 | **TanStack Query** | 缓存/失效/重试,替代原型的 `data.js` 静态数据 |
| 路由 | **React Router** | 对应原型 14 路由 |
| 图标 | **lucide-react**(npm,非 CDN) | 与设计系统一致,且可离线 |
| 图表 | **先沿用原型手写 SVG 图表**(`design/.../charts.jsx` 移植为 `.tsx`) | 零依赖、像素级贴合设计;后续如需交互再换库 |
| 全局态 | **Zustand**(展示币种 / fx_mode / 涨跌约定),回源 `user_preferences` | 轻量;PRD §4.12 §5.2.13 |

---

## 2. 跨阶段工程约定(每阶段都遵守)

PRD 就绪度评审里点名的"工程补遗",在此一次性定死,各阶段直接套用。

### 2.1 API 约定
- **风格**:REST,资源名复数(`/api/accounts`、`/api/balance-snapshots`)。仅 `/api/*` 走 JSON,其余路径回退到前端 SPA(history fallback)。
- **认证**:见 §2.4(开发期免登录、可插拔鉴权中间件);最终认证形态随部署确定,不在本方案范围。
- **错误信封**:统一 `{ "error": { "code", "message", "details" } }`。错误码枚举 → HTTP:`validation_failed`→400 / `not_found`→404 / `conflict`→409 / `business_rule_violated`→422 / `unauthorized`→401 / `llm_unavailable`→503 / `internal`→500。
- **幂等**:快照类"同账户同日期唯一"用 DB 唯一约束 + `ON CONFLICT ... DO UPDATE`(PRD §3.2 幂等语义),不另设 idempotency-key。
- **分页/上限**:列表默认上限 5000 行(对齐 §8.2),超限截断并提示。

### 2.2 时区与日期
- 所有 `date` 字段语义为 **业主所在时区(默认 `Asia/Shanghai`,可配 `FINBRAIN_TIMEZONE`)当地的那一天**;"今天""今天+7天""月末截面"全部按该时区计算。**这填上了 PRD 评审里的时区缺口**。
- `created_at/updated_at` 用 `timestamptz`,仅审计用。
- **Go 侧落地**(P0 实现):启动时按 `FINBRAIN_TIMEZONE` 载入 `*time.Location`,所有"今天"经 `time.Now().In(loc)` 取;DB 连接 `SET timezone`,涉及日期边界的 SQL 显式 `AT TIME ZONE`;封装统一函数,禁止裸 `time.Now()`。

### 2.3 并发(单用户,Last-Write-Wins)
- P1-P2 阶段按单用户使用假设处理并发,写接口不要求 `If-Match`/版本号,也不做冲突对话框;多标签页同时修改时以后写覆盖。
- 每条资源继续返回 `updated_at`,当前用于审计和 TanStack Query refetch 后刷新界面;如果后续进入多人协作或强一致需求,再基于 `updated_at` 增加 `If-Match`/乐观锁。

### 2.4 安全(PRD §9)
- 单用户工具,app **不实现登录页**:开发期免登录(固定 dev 用户);鉴权中间件做成可插拔(默认放行),未来置于反代之后时再开启"信任反代身份头"(可配 `FINBRAIN_AUTH_HEADER`)。具体认证形态随部署决定,不在本方案范围。
- DB / LLM 凭据从环境变量读取(`DATABASE_URL`、`DEEPSEEK_API_KEY`,可选 `ANTHROPIC_API_KEY` 兜底),**秘钥不入仓库文档或代码**。LLM/Copilot 默认先用 DeepSeek;NL 查询沙箱见 §5 P6。日志不落金额/余额,只记操作类型 + 账户 ID。

### 2.5 PRD 修订项 ✅ 已完成(入场条件已满足)
- ✅ `credit_card_bills` 已补字段:`payment_account_id bigint`(可空,FK→`accounts.id`;为空=该期未指定还款账户;仅当 `paid_at` 非空时参与 §6.19)。PRD §5.2.5 + §4.4 已更新。
- ✅ `position_snapshots.cost_currency` 三级回退已统一为:本字段(如已填)→ `instruments.quote_currency`(如非空)→ `accounts.currency`。PRD §5.2.4 与 §6.7 已对齐。
- ✅ P2 `prices`/`fx_rates` 保留 `note` 作为自由备注,并新增结构化 `source varchar(32)` 记录数据来源(手工录入默认 `manual`),避免把来源与备注混写。

### 2.6 事务与批量操作
- **批量提交(盘点向导)= 单数据库事务,全成功或全回滚**。一个批次可跨 `balance_snapshots`/`position_snapshots`/`credit_card_bills`/`income_events`;任一行校验失败则整批回滚。
- 失败响应返回逐行错误清单:`{ line_index, entity_type, field, error_code, message }[]`。
- **草稿仅存客户端**(localStorage),不写库;恢复时重新跑前端校验,不预提交。pgx 事务由 store 层统一封装,sqlc 生成的查询接受 `pgx.Tx`。

### 2.7 API 缓存与前端获取
- GET 可选返回 `ETag`/`Last-Modified` 供 TanStack Query `If-None-Match`;写操作回新对象用于即时更新缓存。
- 列表/聚合接口在 §6 计算契约下应为纯函数式(给定 `on_date + display_ccy + fx_mode` 即定),便于缓存键设计。

### 2.8 设计素材防火墙
见 §3 —— 任何阶段**不得**修改或从 `design/` import。

---

## 3. `design/` 使用规则(不污染设计素材)

`design/` 是 Claude Design 导出物,作为**视觉与交互的权威参考**,三条铁律:

1. **只读**:任何代码不得修改 `design/` 内文件,不得从 `webs/` 用相对路径 import `design/`。
2. **拷贝而非引用**:`webs/` 自带一份设计系统。Phase 0 把 `design/.../_ds/`(tokens + components.css + styles.css)**拷贝**进 `webs/src/styles/ds/`;原型 `*.jsx` 屏作为**实现参照**逐屏重写为生产 `.tsx`,不直接搬运。
3. **可追溯同步**:`design/` 若后续在 Claude Design 迭代重导出,由人工 diff 后手动同步到 `webs/`,记录在 PR 说明里。

**P0 拷贝清单需逐项决策**(四个已知风险):
- **字体**:原型用 Google Fonts CDN(Noto Sans SC / IBM Plex Mono / Noto Serif SC)→ 生产改为 npm `@fontsource/*` 本地化,避免外网依赖。
- **图表**:`charts.jsx` 手写 SVG → 重写为 `.tsx` 组件,保持视觉一致。
- **图标**:Lucide UMD CDN → `lucide-react` npm。
- **CSS 变量**:tokens 全用 `--fb-*`/设计系统命名,导入时确认无与全局样式的命名冲突。

> 这样 `design/` 永远是干净的"设计真相源",`webs/` 是它的工程实现,二者解耦。

---

## 4. 分阶段路线图(总览)

每个阶段是一个**纵向切片**:后端表 + 计算 + API,前端对应屏,端到端可点可用,有明确验收。后阶段依赖前阶段。

| 阶段 | 主题 | PRD 计算 | 主要数据表 | 前端屏(PRD §7) | 价值产出 |
|---|---|---|---|---|---|
| **P0** | 地基 + 种子 | — | instruments, user_preferences, account_templates | 应用壳(侧栏+顶栏+14 路由占位)+ 最小 onboarding | 跑得起来的控制台骨架 + 端到端链路 + 测试种子 |
| **P1** | 账户与快照(脊柱) | §6.1 §6.14 | institutions, accounts, balance/position_snapshots | 机构管理 / 账户列表 §7.2 / 账户详情 §7.3 / 单条录入 §7.6 | 管理机构、登记账户与快照、看历史、模板建账 |
| **P2** | 估值与仪表盘 | §6.2–6.4 §6.6–6.9 | prices, fx_rates | 仪表盘 §7.1(快照口径)/ 持仓总览 §7.4 / 价格汇率维护 §7.18 | 净资产、浮动盈亏、多维分布、币种切换 |
| **P3** | 盘点与负债 | §6.4(负债) | credit_card_bills | 月度盘点向导 §7.5(步1-3,10-11)/ 信用卡录入 §7.7 | 一次盘点批量更新 + 信用卡负债 |
| **P4** | 交易·对账(硬核) | §6.15–6.20 §6.11 §6.16 | transactions, transfers, income_events, corporate_actions | 持仓交易 §7.9 / 收益事件 §7.8 / 转账 §7.11 / 公司动作 §7.10 / 现金对账 §7.12 | 交易回放、已实现盈亏、预期余额对账;仪表盘交易类指标转真 |
| **P5** | 趋势与分析 | §6.5 §6.10 §6.12 §6.13(§6.14 后置) | allocation_targets, benchmarks, annotations | 趋势 §7.15 / 目标配置 §7.14 / 期间对比 §7.16 / 多维聚合 §7.17 | 时间序列、配置漂移、基准、归因 |
| **P6** | LLM 能力 | §8.1–8.3 | summaries | 自然语言浮层(⌘K)/ 阶段总结 §7.19 | NL 录入/查询/总结 |
| **P7** | 收尾 | — | (无新表) | 设置 §7.20 / onboarding 完善 / 模板管理 / 空态 | 数据导出、可观测性、空态打磨 |

---

## 5. 各阶段详述

> 每阶段固定四块:**后端** / **前端** / **验收(DoD)** / **本阶段不做(留给后续)**。
> 通则:从 P1 起,所有屏即带**空态文案 + 缺数据降级**(无价格→"无价格"、无汇率→"按 1:1"、无值→"—"),不留到 P7。

### P0 · 地基、约定与种子
**目标**:搭骨架、打通最小链路、定死 §2 约定、备好测试种子。

- **后端**:`servers/` 初始化 go module;chi + pgx + goose 骨架;`cmd/finbrain`(含 `serve` 与 `migrate` 子命令)、`internal/{http,store,domain,config,llm}` 分层;`db/migrations`(按阶段编号 `00100-p0-*.sql … `)+ `db/queries` + sqlc 配置;**迁移管理**:`finbrain migrate` 子命令,本地可反复 down/up 调试;**时区初始化**(§2.2);`/healthz` + `instruments` CRUD + `/api/preferences`(读写单行,首条端到端 API);`account_templates` 表 + 3 个内置模板种子(汇丰多币种 / 富途证券 / 招行借记+信用卡);可插拔鉴权中间件(默认放行,见 §2.4);`db/seeds/`(1 机构 / 2 账户 / 3 标的 / 若干快照,各阶段增量扩展,`make seed-test`);`docker-compose.yml`(本地 postgres)+ `Makefile`。
- **前端**:`webs/` 初始化 Vite+React+TS;拷贝设计系统到 `src/styles/ds/`(§3 含拷贝清单决策);移植原型 `Shell`(侧栏+顶栏)+ React Router 注册全部 14 路由(未实现屏返回 `<Placeholder §7.x>`,可切换不 404);Zustand 全局态;`/api/preferences` 默认响应结构 `{display_currency:"CNY", fx_mode:"current", market_convention:"western"}` 与 store 映射、无偏好时 fallback;`api` 客户端 + TanStack Query;⌘K 浮层空壳;最小 onboarding(无账户时:欢迎→自助建一个账户→进仪表盘);Vite dev 代理 `/api` 到 Go,根路径 `/` 提供。
- **验收**:`make dev` 起后端+前端;在 `/` 进入设计系统正确的空壳控制台;14 路由可切换;币种切换写回 `user_preferences`;`/healthz` 200;migration 可从空库重放到最新;`make seed-test` 注入种子;onboarding 在空库可走通。
- **不做**:任何业务屏真实数据。

### P1 · 账户与快照(数据脊柱)
**目标**:登记账户与两类快照,稀疏存储 + "取最近一条"插值。

- **后端**:迁移 `institutions`(机构实体,§5.2.18)+ `accounts`(`institution_id` FK)+ `balance_snapshots` + `position_snapshots`(唯一约束 + 索引);机构 CRUD(改名联动所有账户、删除前检查无账户引用→409)+ 账户 CRUD;`instruments` 首次引用自动建元数据(§5.2.2);§6.1 当前余额、§6.14 `balance_at/quantity_at` 插值(`DISTINCT ON`/`LATERAL`);账户归档/删除规则(§4.1);**从模板建账**(选/建机构 + 模板);为 P3 铺底的批量录入端点(§2.6 事务)。
- **成本口径(本阶段)**:无交易历史,`cost_basis` 100% 取 `position_snapshots.avg_cost`(缺则按 §6.7 降级,不显盈亏);**不涉及交易回放**(P4 才升级)。
- **前端**:**机构管理页**(增删改机构、类型/备注/显示排序、删除前提示);建账/编辑账户处机构改为**下拉选(可新建)**;账户列表 §7.2(按机构 display_order 分组折叠、>35 天置灰);账户详情 §7.3 **渐进式**——本阶段展示余额快照列表(倒序)+ 持仓分组(数量/成本/无估值占位),交易时间线/收益/转账/信用卡区块留占位(P3/P4 填);单条快速录入浮层 §7.6,复用盘点表单逻辑:"保留上次"=预填该 `(account, 类型)` 最近一条快照值(无历史则灰显),日期默认今天、上限今天+7;表单校验按 §4.2/§4.3。
- **验收**:建/改/归档/(无快照时)删账户;余额、持仓快照录入/覆盖(幂等)/删除;`balance_at`/`quantity_at` 任意日期截面与手写 SQL 一致;清仓(quantity=0)语义正确。**不验证**已实现/浮动盈亏(需价格,P2)。
- **不做**:估值、汇率、盈亏(无 price/fx 时只显原币余额与数量)。

### P2 · 估值与仪表盘
**目标**:有价格/汇率后,算净资产、浮动盈亏、多维分布,点亮仪表盘(快照口径)。

- **后端**:迁移 `prices` `fx_rates`;§6.2 市值、§6.3 跨币种折算(current/historical + 反向/经 USD 中转 + 1:1 降级标记)、§6.4 净资产、§6.6 跨账户合并、§6.7 浮动盈亏与权重、§6.8 持仓时长、§6.9 币种暴露;聚合 API(按用途/机构/币种/市场/真实计价币种);**§4.10.1 批量导入 API**(prices + fx_rates,数组入参、整批 upsert、先校验任一行不合法整批拒绝、单事务、逐行报错;仅 API 无前端,供 agent/脚本补录历史);价格/汇率列表按 symbol、币种对、日期范围过滤(供折线取数);**成本口径**:`weighted_buy_cost` 回退到 `position_snapshots.avg_cost`(P4 交易录入后按 §6.15 自动升级为回放派生);**market 维度**动态枚举现有值(推荐 US/HK/CN/CRYPTO/INDEX/OTHER,业主可自定义,不预置死);为 P5 每日曲线**种子一只标的的历史价格**(如 HSI,半年每 5 天一条)。
- **前端**:仪表盘 §7.1(净资产 hero、配置饼图×4;趋势小图先静态;**已实现盈亏 YTD / 累计收益事件等交易类指标本阶段标"—/待 P4",不放假数据**);持仓总览 §7.4(多列可排序筛选、双成本口径切换、"无价格"置底);标的/汇率/基准维护 §7.18(**三 tab 主从布局 + 历史折线图**:价格点位并入「标的」详情[不单列价格 tab],标的=元数据+价格历史折线+点位单条 CRUD+「新增价格」、汇率=币种对历史折线、基准=基准价历史折线;均为单值折线[非 K 线]带密度/缺口提示;批量导入走 API、此页无批量录入 UI;视觉对标 design 原型 `ManageScreens.jsx::InstrumentManager/FxManager` + `charts.jsx::LineChart`,重写不 import);展示币种全局联动;缺数据降级 UI。
- **验收**:仪表盘各分布数字与 SQL 校验一致;币种切换即时重算;降级按 §6.3/§6.7 正确标注。
- **不做**:交易派生的已实现盈亏(P4)、趋势时间序列曲线(P5)、目标漂移卡(P5)。

### P3 · 盘点与负债
**目标**:月度盘点向导(可独立走完的子集)+ 信用卡负债并入净资产。

- **后端**:迁移 `credit_card_bills`(**含 §2.5 的 `payment_account_id`**);§6.4 负债扣减;盘点批量提交(§2.6 单事务、逐行错误清单);信用卡还款路径:编辑账单勾"已还"+ 选 `payment_account_id`,§6.19 在 [snapshot_date, on_date] 内对该账户扣减 `amount_total`,无需额外 transfer。
- **前端**:月度盘点向导 §7.5 交付**步1-3(日期/金额型清单"保留上次·无变化"/持仓清单增删改)+ 步10-11(预览/批量确认)**,可中断存草稿(客户端);步4 交易回顾、步8 现金对账显占位"本阶段不可用"(P4 回填),批量提交不依赖它们。信用卡账单录入 §7.7(顶类目动态加行)。账户详情补信用卡账单区块。
- **验收**:向导可独立走完并批量落库(原子、失败整批回滚);未还账单计入负债;草稿可恢复;§6.19 信用卡还款对预期余额的扣减正确。
- **不做**:向导的交易回顾/对账步骤(P4)。

### P4 · 交易·收益·转账·公司动作·对账(最复杂)
**目标**:细粒度事实源 + 回放派生 + 现金/持仓对账;补全仪表盘交易类指标。

- **后端**:迁移 `transactions`(唯一可 in-place 改的历史表)`transfers` `income_events` `corporate_actions`;§6.15 交易回放派生 quantity/加权买入成本、§6.16 已实现盈亏与手续费、§6.17 公司动作回放(split/merge/rights)、§6.18 转账、§6.11 收益累计、§6.19 现金预期余额、§6.20 持仓对账;两套事实源优先级(§3.10):有交易历史则回放优先,无则回退快照。
- **前端**:持仓交易 §7.9(buy/sell 切换;行内改数量/单价/费用,account 与 symbol 不可改;删除;状态列双击未结↔已结;currency≠quote_currency 时 UI 警示;预览本笔对持仓与预期现金的影响);收益事件 §7.8(按类型筛选;"是否已在余额快照反映"提示链接);账户转账 §7.11(双向箭头时间线;跨币种隐含汇率灰字显示);公司动作 §7.10(预览"当前 X 股→回放后 Y 股";删除二次确认);现金对账 §7.12("仅含已结算"切换 + 持久化、排查清单按 §4.9 顺序、"用预期覆盖/新建快照"两键、阈值临时调整);**回填 P3 向导步4/步8**;仪表盘已实现盈亏 YTD/累计收益转真实数据。
- **验收**:回放结果与人工核对一致;已实现盈亏符合 §6.16;预期余额/差额符合 §6.19;对账两条修复路径可用(§6.20)。
- **不做**:历史交易批量导入(PRD §4.6 明确不做)。

### P5 · 趋势·目标·对比·聚合
**目标**:时间序列与分析层。

- **后端**:**§6.5 月度/季度/年度截面**(从基础表按时间范围取末日状态,无需 generate_series,**先交付**);**§6.14 每日曲线**(`generate_series`+`LATERAL` 实时计算,依赖 P2 价格/汇率齐备,作为本阶段后半段或观察到需要时交付);迁移 `allocation_targets`(sets+items)+ §6.10 漂移;`benchmarks` + §6.13 基准对比(绝对/归一化/超额);`annotations`;§6.12 期间对比与收益归因四桶;多维聚合(行×列×值)。
- **前端**:趋势分析 §7.15(基准叠加、标注、收益事件标记);目标配置 §7.14(Σ=100% 校验、实时漂移);期间对比 §7.16(归因柱状);多维聚合 §7.17(透视表);仪表盘趋势小图/漂移卡转真实数据。
- **验收**:月度截面与手写 SQL 一致;任意日期单点查询与曲线一致(§11);归因四桶之和=净值变化;基准缺数据自动右移起点;每日曲线本地 Postgres 亚秒级。
- **不做**:物化视图优化(§6.14 注:观察到瓶颈再做)。

### P6 · LLM/Copilot 能力
**目标**:自然语言录入/查询/阶段总结。

- **后端**:LLM/Copilot 集成默认优先 DeepSeek(凭据走环境变量 `DEEPSEEK_API_KEY`,模型默认 `deepseek-chat`,接口按 OpenAI-compatible client 封装);如配置 `ANTHROPIC_API_KEY`,仅在 DeepSeek 未配置/显式关闭/不可用时作为 Anthropic Claude 兜底;§8.1 录入解析→结构化 JSON(置信度<0.6 必预览);§8.2 查询→SQL **沙箱**:表白名单 = `accounts, instruments, balance_snapshots, position_snapshots, prices, fx_rates, income_events, transactions, transfers, corporate_actions, credit_card_bills, allocation_target_sets, allocation_target_items, benchmarks, annotations`(不含 `user_preferences`);执行前解析 SQL,FROM/JOIN 仅白名单、拒绝非 SELECT、拒 `pg_*`/`information_schema`;执行层 10s 超时 + `LIMIT 5000`;危险样例写成单元测试 100% 拒绝;§8.3 总结(系统先算指标再交 LLM,落 `summaries`);LLM 日志留 30 天;设置可整体关闭(退化纯手工)。
- **前端**:⌘K 浮层接真实后端(意图判定→预览→确认写入);查询结果(数/表/图 + 折叠 SQL);历史阶段总结 §7.19。
- **验收**:§8.2 危险语句 100% 拒绝;§8.1 示例可解析预览后落库;总结基于预算指标不直读库。
- **不做**:LLM 自动定时总结(PRD 仅手动触发)。

### P7 · 收尾
**目标**:补齐边角。

- **后端**:数据导出 §4.24(全量 CSV / 单视图);§6.x 空态/0 值取值收口;可观测性(结构化日志)、错误码全覆盖。
- **前端**:设置 §7.20;onboarding 完善 + 建账模板管理页(表与种子在 P0/P1 已就绪,此处只做 UI);数据导出入口;全局空态打磨。
- **验收**:全量导出能完整还原所有快照/账单/价格/汇率(§11);设置项可改并持久化。
- **不做**:打包 / 部署上线(不在本方案范围,见 §6)。

---

## 6. 运行与打包(部署不在本方案范围)

- **本地开发**:`make dev` —— Go 跑 `finbrain serve`(连本地 `docker-compose` 的 postgres),Vite dev server 跑前端并把 `/api` 代理到 Go;根路径 `/`,免登录。
- **构建**:`webs` 产物为静态文件;Go 二进制可选用 `go:embed` 内嵌静态产物成单文件(便于后续部署),也可分开部署 —— 这一步留到真正要上线时再定。
- **明确不做**:容器镜像、k8s 清单、反代/认证接入、备份等部署事项均不在本方案内。旧的 `infra/apps/finbrain` 清单已废弃,不参考。

---

## 7. 推进方式(每阶段如何逐项落地)

- **入场条件**:✅ §2.5 两处 PRD 修订(`payment_account_id`、`cost_currency` 三级回退)已合入 PRD,入场条件满足,可开 P0。
- **顺序**:P0 → P7 串行;阶段内"后端先于/并行于前端",以"端到端那条线打通"为完成信号。
- **PR 边界**:阶段 = **数据特性**而非 PR 数量。一个阶段可 1 个 PR(优先)或 2–3 个原子提交(每个提交都保持可启动:`webs` 能起、API 至少有 `/healthz`),但不因拆提交而变成两个阶段。范围严格限定在该阶段表格内,不提前做后阶段功能(满足"不一口气全做")。
- **Definition of Done(每阶段)**:① 阶段验收项全过;② 涉及的 PRD §11 验收标准通过;③ 不触碰 `design/`;④ migration 可重放、`make test` 绿、`make seed-test` 可用。
- **下一步**:确认本方案(尤其 §1.2 选型与 §2.5 两处 PRD 修订),然后从 **P0 地基**开第一刀。

---

## 附:阶段 × PRD 数据表 速查

| 表 | 建于阶段 |
|---|---|
| instruments, user_preferences, account_templates | P0 |
| institutions, accounts, balance_snapshots, position_snapshots | P1 |
| prices, fx_rates | P2 |
| credit_card_bills | P3 |
| transactions, transfers, income_events, corporate_actions | P4 |
| allocation_target_sets/items, benchmarks, annotations | P5 |
| summaries | P6 |

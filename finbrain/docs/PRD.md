# finbrain 产品需求文档

> 本文档定义 finbrain 的产品形态、数据模型、功能边界、交互规则与验收标准。
> 是交互设计与工程实现的唯一权威输入。
>
> 文档读者：业主、交互设计、后端工程、前端工程。
> 任何与本文档冲突的实现都按本文档为准；如本文档与现实需求不符，优先修订本文档再实施。

---

## 目录

1. 产品定位
2. 术语表
3. 核心概念
4. 功能规格
5. 数据模型
6. 计算规则
7. 视图与交互
8. 自然语言能力契约
9. 安全与认证
10. 部署与运行
11. 验收标准
12. 产品边界（明确不做）
13. 附录

---

## 1. 产品定位

### 1.1 一句话定义

**finbrain 是一个个人资产快照管理与回顾工具**：用户定期登记各账户余额与持仓，系统按时间序列保留全部历史，并按多种维度聚合展示资产构成与变化。

### 1.2 解决的问题

业主长期同时使用多家境内外金融机构，资产分散在多种账户与币种。市面上的工具不能很好地满足以下需求：

- 现有的流水式记账工具（Firefly III、Actual Budget 等）要求逐笔录入，对低频操作的资产组合而言成本过高
- 现有的投资追踪工具（Ghostfolio 等）依赖自动行情抓取，对非美市场覆盖差，且无法统一描述"现金 + 理财 + 持仓"的全景
- 业主的真实诉求是 **"知道我现在有多少钱、过去趋势怎样、配置如何"**，而不是"知道我每一笔交易的来龙去脉"

### 1.3 解决方式

- 让用户只录入"某一天某账户的余额是多少"或"某一天某账户持有某标的多少股"这两类**快照**
- 不要求用户登记每笔交易；不依赖任何自动行情、账单或银行接口
- 系统按时间维度保留所有快照，按账户、机构、币种、市场、标的、用途等多维度聚合
- 对持仓提供可选的价格表与汇率表，允许用户手动维护，也允许后续接入自动数据源；不强制依赖
- 通过自然语言入口降低录入与查询的操作成本

### 1.4 产品定位边界

finbrain **是**：

- 个人单用户工具
- 资产盘点 + 历史趋势 + 多维聚合
- 自托管，部署在业主自己的家庭服务器
- 数据自有，不与任何第三方分享

finbrain **不是**：

- 不是消费流水记账工具（不记每笔日常消费）；但**持仓型账户的买卖交易**在范围内，作为快照的细粒度补充
- 不是自动账单聚合（不连接银行 / 券商 API）
- 不是预算 / 目标 / 提醒系统
- 不是多用户、多家庭、多组织产品
- 不是移动端原生应用

### 1.5 设计原则

| 原则 | 含义 |
|---|---|
| 灵活 | 业务枚举尽量用开放字符串 + 推荐值，避免遇到新场景就改 schema |
| 不硬编码 | 账户用途、消费类目、机构名称等都不写死；变化点用字段而非分支吸收 |
| 不过度设计 | 抑制"未来可能要支持"的发散；只为业主真实存在的资产形态设计 |
| 数据可读 | 表少、字段直白、主键自然，能直接 SQL 看懂 |
| 录入优先于完整 | 任何字段缺失都不应阻塞快照录入；缺失值在聚合时按规则降级 |
| 历史不可改变 | 快照与收益事件一旦录入即作为事实；修订通过新增同账户更晚日期的快照实现 |
| 交易可改 | 唯一例外：持仓交易（§4.6）与公司动作（§4.7）允许直接 in-place 修改历史记录，理由是券商月结单常需事后修订手续费、结算价等字段 |

---

## 2. 术语表

按字母顺序：

| 术语 | 定义 |
|---|---|
| **机构（institution）** | 持有账户的金融机构，作为独立实体管理（`institutions` 表，见 §5.2.18）。例 `HSBC HK`、`招商银行`、`富途证券`、`Binance`。账户通过 `institution_id` 引用机构 |
| **账户（account）** | 业主在某机构开立的具体账户。一个机构可以下挂多个账户，例如汇丰下挂"港币现金"、"港股账户"、"美股账户" |
| **账户币种（account currency）** | 账户的本位币种。一个账户只有一个本位币种 |
| **账户用途（account kind）** | 账户的功能类型。开放字符串，推荐值见 §3.1 |
| **快照（snapshot）** | 业主登记的"某一天某账户某项资产的状态"。是 finbrain 唯一的数据采集形式 |
| **余额快照（balance snapshot）** | 描述"某账户某天有多少金额"的快照。用于现金、定期、理财等金额型资产 |
| **持仓快照（position snapshot）** | 描述"某账户某天持有某标的多少份"的快照。用于股票、基金、加密等份额型资产 |
| **标的（instrument）** | 持仓的标识，如 `GOOG`、`0700.HK`、`161725.SZ`、`BTC`。自由文本 |
| **市场（market）** | 标的所属市场，如 `US`、`HK`、`CN`、`CRYPTO`。自由文本 |
| **加权买入成本（weighted buy cost）** | 持仓的加权平均买入单价 = Σ(每次 buy 数量 × buy 单价) ÷ Σ(每次 buy 数量)。**卖出不改变此值**，与券商显示的"持仓成本"口径一致 |
| **净持有成本（effective cost）** | 加权买入成本 − 累计已实现盈亏 ÷ 当前持仓数。卖出有盈利时会扣减，可为负值；类似富途的"摊薄持有成本"口径 |
| **平均成本（average cost）** | 单一字段口径泛指上述两套之一；UI 默认展示加权买入成本，业主可切换 |
| **持仓成本（cost basis）** | 一条持仓的成本总额 = 数量 × 加权买入成本，币种为成本币种 |
| **持仓市值（market value）** | 一条持仓的当前市值 = 数量 × 现价，币种为成本/账户币种 |
| **浮动盈亏（unrealized P/L）** | 持仓市值 − 持仓成本。仅反映**当前未平仓**部分的账面盈亏 |
| **已实现盈亏（realized P/L）** | 卖出时按 `(sell_price − 加权买入成本) × 卖出数量` 计算并累计；只随 sell 交易增加，不随价格波动 |
| **总盈亏（total P/L）** | 浮动盈亏 + 已实现盈亏 + 累计收益事件（同口径折算） |
| **浮动盈亏率（unrealized P/L %）** | 浮动盈亏 ÷ 持仓成本，按**原币口径**计算，避免汇率波动污染单标的真实涨跌 |
| **交易（transaction）** | 持仓型账户的单次买/卖记录，包含数量、价格、手续费、结算日等。是持仓的细粒度事实源（见 §3.10 与 §4.6） |
| **未结算 / 已结算（settled state）** | 交易的对账状态标签：未结算 = 业主已录但券商尚未出账（费用、结算价可能后续修订）；已结算 = 业主已对完账。两态均可直接修改字段，无 reversal 单 |
| **公司动作（corporate action）** | 标的层面的 split / merge / rights（拆股 / 合股 / 配股）事件；系统按比例自动调整后续 quantity 与加权买入成本，**不回写历史已实现盈亏** |
| **账户转账（transfer）** | 业主在自己的两个账户间的资金调动；跨币种时由业主手动录入两侧金额，系统不算汇率，净资产不变（仅币种/账户分布变化） |
| **对账差额（reconciliation delta）** | 由交易/收益事件/转账推演出的"预期余额" − 业主登记的快照实际余额，用于发现遗漏或错录 |
| **预期余额（expected balance）** | 从最近一次余额快照起，按期间所有 transactions / transfers / income_events / 信用卡还款推演出的当前理论金额 |
| **仓位权重（position weight）** | 该持仓市值 ÷ 持仓总市值，体现"在所有持仓里占多少" |
| **资产权重（asset weight）** | 该持仓市值 ÷ 净资产，体现"在整体资产里占多少" |
| **持仓时长（holding duration）** | 一条 (账户, 标的) 持仓自首次出现以来的天数；按持仓快照历史派生 |
| **真实计价币种（quote currency）** | 标的本身的计价币种，与账户币种解耦。例：GOOG 即使放在港币账户也是 USD 计价 |
| **币种暴露（currency exposure）** | 按"持仓的真实计价币种"聚合的资产分布，反映实际汇率风险，区别于"账户币种分布" |
| **目标配置（allocation target）** | 业主预设的理想资产配置，按用途/币种/市场任一维度的目标百分比 |
| **配置漂移（allocation drift）** | 当前实际配置 − 目标配置，正值=超配、负值=欠配；用于触发再平衡决策 |
| **收益事件（income event）** | 持仓的"非市价回报"事件，包含分红（dividend）、利息（interest）、返现（rebate）、其他（other）；不改变持仓数量与平均成本，独立记录以便追溯真实回报 |
| **基准（benchmark）** | 用于对比业主表现的外部参考曲线，如 HSI / S&P 500 / CSI 300；以特殊 symbol 在 `prices` 表维护历史值 |
| **标注（annotation）** | 在曲线/数据点上贴的人工或 LLM 生成的注释，用于回顾时还原决策上下文 |
| **信用卡账单（credit card bill）** | 信用卡某一期的账单记录，包含总额、出账日、顶类目 |
| **顶类目（top categories）** | 业主对信用卡当期消费的归类摘要。自由文本，不限制类目集合 |
| **价格（price）** | 某标的某天的市价。手动维护或后续自动接入 |
| **汇率（fx rate）** | 某币种对另一币种在某天的汇率 |
| **展示币种（display currency）** | UI 当前选择的统一展示口径。可在运行时切换。默认 CNY |
| **资产** | 账户余额（现金、理财等正向） + 持仓市值 |
| **负债** | 未还清的信用卡账单总额 |
| **净资产** | 资产 − 负债 |
| **盘点（review）** | 业主集中录入或更新一批快照的操作。通常每月一次 |
| **归档（archive）** | 把不再使用的账户标记为非活跃，但保留历史数据 |

---

## 3. 核心概念

### 3.1 账户与机构

**机构**是金融服务提供方（独立实体，见 §5.2.18 `institutions`），**账户**是业主在机构下开立的具体资金/持仓容器。一个机构可以挂多个账户；账户通过 `institution_id` 引用机构，改机构名自动反映到其所有账户。

账户用 `kind` 字段描述用途。`kind` 是开放字符串，推荐值如下；用户可以自定义任意新值。

| `kind` 推荐值 | 含义 |
|---|---|
| `cash` | 活期、当前可支取的现金账户 |
| `time_deposit` | 定期存款 |
| `wealth_product` | 银行理财、结构化产品（金额型） |
| `fund` | 公募/私募基金（份额型） |
| `brokerage` | 证券账户（持仓型） |
| `credit_card` | 信用卡 |
| `crypto_wallet` | 加密钱包 |

`kind` 决定 P1 可录入的快照类型，避免同一账户既按金额解释又按份额解释：

- 金额型账户：`cash` / `time_deposit` / `wealth_product`，只使用余额快照
- 持仓型账户：`brokerage` / `fund` / `crypto_wallet`，只使用持仓快照
- 信用卡账户：`credit_card`，只使用信用卡账单，不使用余额或持仓快照（见 §3.4）
- 自定义 `kind` 默认不开放 P1 快照入口；后续如需支持，应先明确它属于金额型还是持仓型

### 3.2 快照

快照是 finbrain 的**主要**数据采集形式（对于持仓型账户，业主也可以选择改用交易流水录入，见 §3.10）。一条快照表达 **"在某一天，某账户的某项资产是这个状态"**。

两类快照：

- **余额快照** 描述金额型资产（现金、理财、定期等）的当前余额
- **持仓快照** 描述份额型资产（股票、基金、加密等）的持有数量与平均成本

快照的关键性质：

| 性质 | 说明 |
|---|---|
| **稀疏存储** | 数据库只存业主真实录入的快照，不为缺失日期填充。这是 finbrain 的核心存储原则 |
| **查询插值** | 任意查询日期 D 上某账户/持仓的状态 = 该账户/持仓在 `snapshot_date <= D` 的最新一条快照（"取最近一条"原则） |
| **可修订** | 快照可以编辑（覆盖）或删除，作为业主纠错手段。修订一条快照自动改变其影响区间（直到下一条更新前的所有日期） |
| **幂等** | 同账户同日期的同类快照只能有一条；二次录入即更新该条 |
| **独立** | 不同账户、不同标的、不同类型的快照彼此独立，没有跨快照的事务约束 |
| **持仓清仓也是事件** | 清仓持仓不是"删除快照"，而是录入一条 `quantity = 0` 的快照，让历史曲线能正确画到 0 |

### 3.3 持仓

持仓由 `(账户, 标的)` 唯一标识。同一个标的在不同账户分别记录，互不合并：业主可能在汇丰持有 45 股 NVDA，在富途持有 6 股 NVDA，这是两个独立的持仓记录；但在多维聚合视图中可以按标的合并展示（见 §6.6）。

持仓的"成本"有两套口径（见 §2 术语表）：

- **加权买入成本**：仅 buy 累计，sell 不改变；与券商"持仓成本"列对齐
- **净持有成本**：加权买入成本扣减已实现盈利后的结果，可为负

两套口径都可由交易历史派生；在没有交易数据的简化场景下，业主也可以直接在持仓快照里填入加权买入成本（系统视其为该日的口径基准）。

### 3.4 信用卡账单

信用卡账户**不使用余额快照**。原因：信用卡的当期累积消费通常每月波动剧烈，用户的关注点是"还款时这一期总共花了多少、主要花在哪"，而不是"今天卡上欠多少"。

信用卡账户使用**信用卡账单**记录每一期：

- 一期账单 = 一条记录
- 包含总额、出账日、币种、顶类目、是否已还
- 顶类目是一个自由结构的列表（如 `[{name: "餐饮", amount: 3200}, {name: "网购", amount: 1800}]`），不限制类目名称

净资产计算时，未还清的账单总额按"负债"扣除（见 §6.4）。

### 3.5 价格

价格表存储 `(标的, 日期, 价格, 币种)` 四元组。

- 业主可以**手动**录入任意标的的任意日期价格
- 系统支持后续接入自动数据源（不在产品形态上做限制，是部署 / 实施选择）
- 持仓市值 = 持仓数量 × 该日期最近的价格（取该日期或之前最后一条）
- 没有任何价格记录时，市值显示为"无价格"，不阻塞其他计算

### 3.6 汇率

汇率表存储 `(源币种, 目标币种, 日期, 汇率)` 四元组。

- 业主可以**手动**录入任意币种对的任意日期汇率
- 系统支持后续接入自动数据源
- 跨币种折算优先取"该日期或之前最后一条"汇率
- 当前日期没有任何汇率记录时，按 "1:1" 降级处理并在 UI 上明显提示

### 3.7 展示币种 vs 账户币种

- **账户币种** 是数据存储口径，永远等于账户开立的本位币种，不变
- **展示币种** 是 UI 渲染口径，业主可在任意视图切换，默认 CNY，至少支持 CNY / HKD / USD（其他 ISO 4217 三字母币种也可使用）
- 切换展示币种**不修改任何数据**，只改变视图聚合时的折算目标

### 3.8 资产 vs 负债

- **资产**项：所有账户余额快照（除信用卡外）+ 持仓快照按价格折算的市值
- **负债**项：未还清的信用卡账单
- **净资产** = 资产 − 负债

业主在录入余额时，永远记**正数**：账户里的现金记正数、信用卡账单总额记正数。是否计入资产或负债由系统按 `account.kind` 与字段语义自动判断。

### 3.9 同机构下现金与持仓拆分

业主真实场景里，券商或银行常同时有现金与持仓。finbrain 不把两类事实塞进同一个账户，而是在同一机构下拆成多个账户，分别使用各自的快照类型。例如富途在某一天的状态：

```
institution: "富途证券"

account: "现金" (kind=cash, currency=USD)
balance_snapshot:    2026-05-05  USD 237.62

account: "美股" (kind=brokerage, currency=USD)
position_snapshots:  2026-05-05  MU     6 股, 平均成本 USD 399.75
                     2026-05-05  NVDA   6 股, 平均成本 USD 168.00
                     2026-05-05  NTDOY 60 股, 平均成本 USD 17.115
```

资产总览按机构聚合时，会合并该机构下的现金余额与持仓市值，显示为 "富途证券 总值 USD X"。

### 3.10 持仓交易与对账

持仓型账户除了走"持仓快照"对账模式外，业主也可以录入**交易流水**：每一次 buy / sell 都形成一条 `transactions` 记录，系统按时间顺序回放出任意日期的持仓状态。这样业主不需要等到下次盘点才能让持仓与现实对齐。

**两套事实源的优先级**：

| 场景 | 持仓状态取值 |
|---|---|
| 该 `(账户, 标的)` 有交易历史 | 起始持仓快照（如有）+ 之后的所有 transactions / corporate_actions 回放 |
| 该 `(账户, 标的)` 无交易历史 | 直接按最近的持仓快照取值（保留 §3.2 快照插值语义） |

业主可以为不同账户混用两种模式：例如 IBKR 走交易流水（高频）、汇丰证券走持仓快照（低频）。

**未结算 / 已结算**：交易录入后默认未结算；业主对完账单后将其标为已结算。两态均允许直接 in-place 修改任意字段（包括手续费、结算价），因为券商月结单常在交易日后数日才出账，需要事后补录或修正。修改交易不会触发任何 reversal 记录。

**对账差额**：当 `(账户, 标的)` 同时存在持仓快照和交易历史时，系统计算"回放结果 − 快照"作为差额。差额可能来自：未录入的交易、未录入的公司动作、单位错录等。差额不会自动消除，由业主决定是补录交易还是覆盖快照。

**现金侧的对账**：持仓型账户里的现金（券商账户余额）由 buy 扣款、sell 入账、income_event 入账、转账等共同推演出**预期余额**，与最近一次现金余额快照比对得到差额。

### 3.11 公司动作

公司动作是标的层面的事件，不属于业主的主动操作：拆股（split）、合股（merge）、配股（rights）。系统按比例自动调整该标的之后的：

- 持仓数量
- 加权买入成本

**不回写历史已实现盈亏**：拆股发生前已经计算的 realized P/L 保留原值，仅影响拆股之后的口径。

公司动作录入由业主负责（实时手工录入），系统不自动抓取上市公司公告。

### 3.12 账户转账

业主在自己名下两个账户间的资金调动。语义上：

- 转出账户余额减少
- 转入账户余额增加
- 总净资产**不变**（仅币种 / 账户 / 用途分布变化）

跨币种转账由业主**同时录入两侧实际到账金额**，系统不参与汇率换算（因为换汇通常发生在转账过程中，业主只关心两端实际金额）。

转账与交易明确区分：转账不涉及标的，不影响任何持仓；交易涉及标的，不涉及第二个账户。

---

## 4. 功能规格

### 4.1 账户管理

业主可以：

- 创建账户：必填 `name`、`institution_id`（从机构列表选，或新建机构）、`currency`（从支持币种列表选择）、`kind`；可选 `note`
- **从模板创建一组账户**：选一个建账模板（如"汇丰一户三账户"、"富途证券标准三件套"）+ 选机构（或新建），系统一次创建该模板预定义的多个账户骨架
- 修改账户：可修改 `name`、`kind`、`note`、`is_archived`；`institution_id` 与 `currency` 创建后不可修改（要换机构或币种需删除账户后重建）
- 归档账户：`is_archived=true`，账户从录入入口隐藏，但历史快照与聚合仍保留
- 取消归档：`is_archived=false`，账户重新出现在录入入口
- 删除账户：**仅当该账户没有任何快照、账单时**才允许删除；否则只能归档

建账模板：

- 系统内置常用模板（汇丰多币种账户、富途证券、招行借记+信用卡、加密钱包等）
- 业主可基于已有账户保存为自定义模板（"以这个机构下当前 N 个账户为蓝本"）
- 模板只是"批量创建账户的快捷方式"，与账户实例无任何运行时关联，删除模板不影响已创建的账户
- 模板存储见 §5.2.12 `account_templates`

机构管理（§5.2.18 `institutions`）：

- 业主可在机构管理页增删改机构；机构含 `name`、`kind`（银行/券商/交易所/钱包/其他，开放字符串）、`note`；显示顺序在机构列表页通过拖动行调整，持久化到 `display_order`
- 改机构名自动反映到其所有账户（账户引用 `institution_id`，不存机构名副本）
- 删除机构：仅当无账户引用时允许；否则提示先迁移/归档账户
- 建账与录入入口的机构选择均来自该列表，避免同名机构散成多个

账户列表展示：按机构分组（按机构 `display_order` 再按名称），机构内按账户 `display_order` 排序；机构和账户顺序均在列表页拖动调整。归档账户在折叠区分别列出。

### 4.2 余额快照录入

业主可以：

- 单条录入：选定账户 + 日期，填入金额
- 批量录入（盘点向导）：列出所有未归档的金额型账户（`cash` / `time_deposit` / `wealth_product`），逐个填入当日余额
- 修订录入：选择已存在的某条快照，修改日期、金额或备注；保存覆盖原记录
- 删除快照：单条删除（罕用，主要用于纠错）

约束：

- `(account_id, snapshot_date)` 唯一
- 仅金额型账户（`cash` / `time_deposit` / `wealth_product`）允许余额快照
- 金额支持负数（理论上不应出现，但 schema 不强制；UI 给警示）
- 日期不允许早于账户创建日（弱约束，UI 警示而不阻断）
- 日期不允许晚于"今天 + 7 天"（防止误填未来日期）

### 4.3 持仓快照录入

持仓快照在产品里有两种用途：

1. **唯一事实源**（业主不录入交易流水时）：每次盘点录入完整持仓清单，与 §3.2 快照插值规则一起决定任意日期的持仓状态
2. **对账锚点**（业主录入交易流水时）：定期对账时录入一条持仓快照，作为"从这天起重置回放起点"的基准；系统在 §6.20 用它与回放结果做差额校验

业主可以：

- 单条录入：选定持仓型账户、日期、标的，填入数量与平均成本
- 批量录入：在盘点向导中，对每个有持仓的账户列出"上次的持仓清单"，业主可：
  - 直接接受（数量、成本不变）
  - 修改数量
  - 修改平均成本
  - 删除（标的不再持有）
  - 新增（持有了新标的）
- 修订录入：选择已存在的某条快照，修改日期、数量、平均成本或备注；保存覆盖原记录
- 删除快照：单条删除

约束：

- `(account_id, symbol, snapshot_date)` 唯一
- 仅持仓型账户（`brokerage` / `fund` / `crypto_wallet`）允许持仓快照
- `quantity >= 0`
- `quantity = 0` 表示"该日清仓该标的"，是显式的事件记录。这样历史曲线能从持仓数量正确收敛到 0，并且后续查询能区分"从未持有"与"曾持有但已清仓"
- 清仓后再次买入：录入新的 `quantity > 0` 快照即可，与历史 0 快照按时间顺序自然衔接
- `avg_cost` 与 `cost_currency` 可选；不填则市值仍可基于价格表计算，但盈亏率无法计算
- 当 `(账户, 标的)` 同时有交易历史时：录入或修改持仓快照会触发 §6.20 的对账提示；业主可选择"以快照为准"（之前的回放差额视为补一笔调整交易）或"以交易为准"（撤销该快照）

### 4.4 信用卡账单录入

业主可以：

- 录入新账单：选信用卡账户、出账日，填总额、币种、可选顶类目、可选备注、可选"是否已还"、可选还款账户（`payment_account_id`）
- 修改账单：所有字段可修改
- 删除账单：单条删除
- 标记已还：操作 `paid_at` 字段（默认未还）；可同时指定 `payment_account_id`（还款落地账户），供 §6.19 现金预期余额据此扣减

约束：

- `(account_id, statement_date)` 唯一
- `amount_total` 必须 > 0
- `currency` 默认等于账户币种，可手动改（极少用）
- `top_categories` 是 JSON 列表，元素结构 `{ "name": string, "amount": number }`；列表可为空

**多卡合并录入（推荐用法）**：

- 业主关心的是"一段时间总消费"，不一定要按物理卡区分
- 推荐做法：建一个 `kind = credit_card` 的"信用卡合计"账户（institution = "合并"），每个还款周期把所有卡的合计消费录成一条账单挂这里
- 也支持每张卡分别建账户、分别录账单的精细做法；两种用法在表结构上无差异
- 参考 §12 边界：finbrain **不跟踪信用卡逐笔消费**，只在还款日维度登记上一周期合计

### 4.5 收益事件录入

收益事件用于记录与持仓相关、但不通过买卖动作发生的回报：分红、利息、返现等。它们独立于快照存在，**不修改持仓数量、平均成本或账户余额**，避免与"持仓快照"和"余额快照"双重记录。

支持的事件类型（开放枚举）：

| `event_kind` | 含义 |
|---|---|
| `dividend` | 股票/基金现金分红 |
| `interest` | 存款利息、债券票息、活期利息 |
| `rebate` | 信用卡返现、刷卡积分兑现、平台返利 |
| `other` | 其他非市价回报，需要在 `note` 中说明 |

业主可以：

- 单条录入：选事件类型、日期、金额、币种、关联账户、可选关联标的、可选入账账户（cash 落地账户）、备注
- 批量录入：盘点向导中"分红/利息汇总"步骤，按账户列出当期事件清单
- 修改 / 删除：所有字段可改

约束与语义：

- `dividend` 必须关联一个标的（symbol），可选关联"持仓所在账户"与"现金入账账户"（两者可不同；例如美股分红进入券商现金子账户）
- `interest` / `rebate` / `other` 标的可选；关联账户必填
- 录入收益事件**不会**自动创建或修改余额快照与持仓快照。如果业主同时希望反映现金到账，需另行录入余额快照（产品在 UI 上提示"是否已经在余额快照里反映"）
- 同一笔事件不应录入两次；系统按 `(account_id, symbol, event_kind, event_date, amount, currency)` 五元组检测重复并提示，但不强制阻塞（业主可能确实有同日多笔）

### 4.6 持仓交易录入

业主在持仓型账户（如 `brokerage`、`crypto`）发生买/卖时，可以录入一条交易（见 §3.10）。这是持仓的**细粒度事实源**，与持仓快照可并存或择一使用（详见 §6.15 派生与降级规则）。

业主可以：

- 单条录入：选账户 + 标的 + buy / sell + 数量 + 单价 + 币种 + 成交日 + 可选结算日 + 可选手续费；提交后默认 `is_settled = false`
- 标记已结算：完成与券商对账后单条置 `is_settled = true`；状态切换不限制方向，可来回切
- 修改 / 删除：**任何字段、任何状态都允许直接 in-place 改写**，包括手续费、结算价、币种；理由是券商常在交易日数日后才出账，未结算前的字段必然存在估算/缺省，事后修订是常态。系统不生成 reversal 反向单
- 历史导入：本期不做（业主从某一天起开始手工录入即可；之前的持仓状态由起始持仓快照承担）

录入流程：

- 录入时如该 `(账户, 标的)` 还没有 `instruments` 元数据，预填一个候选并提示业主补全 `quote_currency` / `market` / `display_name`
- 录入时若 `currency` 与 `instruments.quote_currency` 不一致，UI 警示但不阻断（用于业主用账户币种成本结算的少数场景）
- 录入时如对应账户里**现金不足**（按 §6.19 预期余额推演），UI 给提示但不阻断（业主可能尚未录入对应转账或入金）

约束：

- 不能把交易录到非持仓型账户（`kind` 不在 `brokerage` / `crypto` / 自定义持仓型枚举内时阻断）
- `quantity > 0`、`price >= 0`、`fee >= 0`
- 公司动作不进本视图，进 §4.7

跨币种买卖：finbrain 不支持"USD 股从 HKD 账户直接出钱买"。业主先用 §4.8 转账把 HKD 换成 USD 进同一账户的 USD 子户，再录交易。

### 4.7 公司动作

业主负责**手工录入**标的的拆股 / 合股 / 配股事件（系统不自动抓取）。一条 `corporate_actions` 记录立即生效到所有持有该 symbol 的账户。

业主可以：

- 录入：标的 + action（split / merge / rights）+ 除权日 + 比例分子分母 +（rights）配股价与基础比例
- 修改 / 删除：直接 in-place 改写；删除等价于回滚该次比例调整
- 预览影响：录入前 UI 显示"该 symbol 当前在 N 个账户共持有 X 股，回放后将变成 Y 股"

回放语义（详见 §6.17）：

- split / merge：调整后续 quantity 与加权买入成本；**不回写历史已实现盈亏**
- rights：系统按业主填写的配股价生成一条等价 buy 交易（标记 `source = corporate_action_<id>`），走 §6.15 的 buy 分支

约束：

- `(symbol, action, event_date)` 唯一
- `ratio_numerator > 0`、`ratio_denominator > 0`

### 4.8 账户转账

业主在自己名下两个账户间的资金调动（见 §3.12）。

业主可以：

- 单条录入：转出账户 + 转入账户 + 转出金额 + 转入金额 + 转账日 + 备注；同币种时转入金额自动 = 转出金额（可改），跨币种时业主同时手填两侧实际到账金额
- 修改 / 删除：直接 in-place 改写

约束：

- 转出与转入账户不能相同
- 跨币种转账隐含的"成交汇率"= `to_amount / from_amount`，**不写入 `fx_rates`**（一次性成交价，不可推广）
- 转账不影响净资产；转出账户当日预期余额 −`from_amount`，转入账户当日预期余额 +`to_amount`

转账与下列概念明确区分：

- **不是交易**：转账不涉及标的、不影响任何持仓
- **不是收益事件**：转账不创造价值，仅在两账户间搬移
- **不是信用卡还款**：信用卡还款仍在 §4.4 的"标记已还 + payment_account_id"路径处理；不要求业主额外录一条 transfer

### 4.9 现金对账

资产总览与账户详情均提供"预期余额 vs 快照余额"对照（见 §6.19）。本节描述操作流程，不重复定义计算规则。

业主可以：

- 在账户详情看到："最近一次现金快照（日期 + 金额）→ 期间 N 笔交易 / M 笔转账 / K 笔收益事件 / J 笔信用卡还款 → 预期余额 → 与最新快照差额"
- 切换"仅含已结算交易"以排查未结算项导致的差额
- 一键操作：**用预期余额覆盖快照** / **新建一条今日余额快照承认实际**
- 阈值提示：`|delta| / expected_balance > 阈值`（默认 0.5%，业主可改）时账户卡片高亮

差额来源排查清单（UI 在差额非零时按可能性排序展示）：

1. 未录入的交易（最常见）
2. 未录入的转账
3. 未录入的分红 / 利息（收益事件）
4. 未结算交易的费用估算偏差
5. 银行 / 券商小额费用（账户管理费、利息税等）—— 业主可补一条 `event_kind = other` 的收益事件（金额负数）

### 4.10 价格录入

业主可以：

- 单条录入：标的、日期、价格、币种
- 批量录入：表单一次填多行
- 修订与删除

约束：

- `(symbol, price_date, currency)` 唯一
- `price` > 0

### 4.11 汇率录入

业主可以：

- 单条录入：源币种、目标币种、日期、汇率
- 批量录入

约束：

- `(base_currency, quote_currency, rate_date)` 唯一
- `rate` > 0
- 反向汇率不需要单独录入：`USD/CNY=7.2` 与 `CNY/USD=1/7.2` 系统自动互换

### 4.12 展示币种切换

- 任何含金额展示的视图（仪表盘、账户列表、趋势图、聚合表）顶部都有币种切换器
- 切换立即生效，不刷新页面
- 当前选择持久化到用户偏好，下次进入应用沿用
- 默认值为 CNY

### 4.13 资产总览

固定展示当前（最近一次盘点）的：

- 净资产（一个数字，按展示币种）
- 资产总额、负债总额（两个子项）
- 按账户用途分组：每组的总值与占比
- 按机构分组：每个机构总值与占比
- 按账户币种分组：每个币种总值与占比
- 按**真实计价币种**分组（**币种暴露**视图，见 §6.9）：以"持仓的 quote_currency + 现金账户的 currency"作为分布口径，反映实际汇率风险
- 按市场分组（仅持仓）：US / HK / CN / CRYPTO 等总市值与占比
- 配置漂移卡（若已设置目标配置）：当前配置 vs 目标配置（同一维度），显示偏差最大的若干项与"再平衡建议金额"（见 §4.15 与 §6.10）

### 4.14 持仓分析

针对所有持仓型资产（股票、基金、加密等），提供逐持仓与汇总两层指标。

**单个持仓指标**（一条 `(账户, 标的)`）：

- 持仓数量
- **加权买入成本**（成本币种）：买入加权平均，卖出不变；UI 默认展示
- **净持有成本**（成本币种）：加权买入成本 − 累计已实现盈利 ÷ 当前持仓数；可负；UI 可切换
- 现价（成本币种，价格表币种不一致时按汇率折算）
- 持仓成本 = 数量 × 加权买入成本
- 持仓市值 = 数量 × 现价
- 浮动盈亏 = 持仓市值 − 持仓成本（仅未平仓部分）
- 浮动盈亏率 = 浮动盈亏 ÷ 持仓成本（**原币口径**）
- **已实现盈亏** = 该持仓历史所有 sell 按 §6.16 公式累计（仅当存在交易历史时可计算）
- 累计收益事件 = 该持仓历史所有 `dividend / interest / rebate / other` 事件金额折算到展示币种之和（见 §6.11）
- **总盈亏 = 浮动盈亏 + 已实现盈亏 + 累计收益事件**
- 总盈亏率 = 总盈亏 ÷ 持仓成本
- 仓位权重 = 该持仓市值 ÷ 持仓总市值
- 资产权重 = 该持仓市值 ÷ 净资产
- 真实计价币种（quote_currency）
- 持仓时长 = 当前日期 − 该 (账户, 标的) 首次出现 `quantity > 0` 的快照日期；中途清仓后再买入按"最近一次连续持有段"计算（见 §6.8）
- 最近快照日期、最近价格日期、**最近交易日期**（如有交易历史）

**持仓汇总指标**（所有持仓合并）：

- 持仓总成本（折算到展示币种）
- 持仓总市值（折算到展示币种）
- 总浮动盈亏 = 总市值 − 总成本
- **总已实现盈亏** = Σ 单持仓已实现盈亏（折算到展示币种）
- **总累计收益事件** = Σ 单持仓累计收益事件
- **持仓总盈亏 = 总浮动 + 总已实现 + 总累计收益事件**
- 总盈亏率 = 总盈亏 ÷ 总成本
- 持仓在净资产中的占比

**跨账户合并**：在"按标的"视图下，多账户同 symbol 合并展示（见 §6.6），合并后的盈亏与权重按合并后口径重算（见 §6.7）。

**已知边界**：

- 浮动盈亏率默认按原币口径计算；展示币种汇总只用于盈亏的绝对值，不影响盈亏率
- 缺少 `avg_cost` 的持仓只显示市值与权重，不显示盈亏；缺少价格的持仓单独标记"无价格"，不计入汇总
- 已实现盈亏仅当存在交易历史（`transactions` 行）时可计算；纯快照模式下该指标为空，不展示
- 历史拆股 / 合股按 §6.17 自动调整数量与加权买入成本，**不回写历史已实现盈亏**

### 4.15 目标配置与漂移

业主可设定一组或多组**目标配置**（allocation target），描述理想的资产分布；系统在资产总览、盘点向导、阶段性总结中持续比对当前与目标，给出**配置漂移**与"再平衡建议"。

支持的目标维度（开放枚举，业主可同时维护多套）：

| 维度 | 示例目标 |
|---|---|
| `kind`（账户用途） | `cash 30%` / `brokerage 50%` / `wealth_product 20%` |
| `currency`（账户币种） | `CNY 50%` / `HKD 25%` / `USD 25%` |
| `quote_currency`（真实计价币种） | `CNY 40%` / `USD 40%` / `HKD 20%` |
| `market`（仅持仓） | `US 50%` / `HK 30%` / `CN 20%` |
| `institution` | `汇丰 60%` / `富途 25%` / `招行 15%` |
| 自定义 | 业主自由命名维度并选择枚举值 |

业主可以：

- 创建一套目标配置：选维度、为每个枚举值分配百分比，所有项之和必须 = 100%
- 同时维护多套（例：一套 `kind`、一套 `quote_currency`），互不冲突
- 编辑、归档、复制（基于上一套微调）
- 设置每套是否在仪表盘展示
- 为每套设置"漂移阈值"（如 ±5%），超出阈值的项在 UI 上高亮

漂移与再平衡：

- 漂移 = 实际占比 − 目标占比；正值=超配，负值=欠配
- 再平衡建议金额 = 漂移百分点 × 当前净资产（按展示币种）
- 不强制业主操作，仅提供决策辅助

详细计算见 §6.10。

### 4.16 趋势分析

- 时间轴聚合：每日、月度、季度、年度四档（用户可切换；默认见 §5.2.13 用户偏好）
- 折线图：净资产随时间变化
- 折线图：持仓总市值与持仓总成本随时间变化（差值即历史浮动盈亏曲线）
- 堆叠面积图：净资产按用途分层（cash / brokerage / wealth_product / ...）随时间变化
- 第二条轴：信用卡当月支出柱状图
- 叠加层（可开关）：标注（见 §4.19）、基准对比曲线（见 §4.18）、收益事件标记（分红/利息发生点，见 §4.5）
- 时间范围：默认"最近 12 个月"，可切换"全部"、"今年"、"自定义区间"

### 4.17 期间对比

将"任意两个截面"的全部资产构成做差异分析，回答"这段时间发生了什么"。

业主可以：

- 选两个对比期：
  - **本期 vs 上期**预设：本月 vs 上月、本季 vs 上季、本年 vs 上年
  - **任意两个截面日期**自定义
- 选展示币种与 fx_mode（见 §6.3）

输出（见 §6.12）：

- 顶部汇总：净资产期初、期末、变化值、变化率
- 三栏明细表（行=账户/标的/任一聚合维度，列=期初值、期末值、变化值、变化率、对净资产变化的贡献占比）
- 自动分桶：增长前 5、下跌前 5、新增项、消失项
- "增长来源"分解（见 §6.12 收益归因）：
  - 价格变动贡献
  - 数量/余额变动贡献
  - 收益事件贡献（分红/利息）
  - 汇率变动贡献（仅 `fx_mode = historical` 时输出）

### 4.18 基准对比

业主可在趋势图上叠加一条或多条**基准曲线**，把净资产或持仓总值的增长与外部参考做横向对比。

业主可以：

- 维护基准列表（见 §7.18）：每条基准包含 symbol、显示名、资产类型；价格数据存放在 `prices` 表中（与普通持仓一致）
- 在趋势分析图上勾选要叠加的基准
- 选择对比口径：
  - **绝对值**：双 y 轴，左 = 业主净值，右 = 基准点位
  - **归一化（rebase=100）**：把对比起点统一归一到 100，看相对增幅
  - **超额收益**：业主曲线 − 基准曲线（同样以 rebase=100 为基线）

系统预置但不强制的基准建议（业主自行决定是否启用）：

| symbol | 资产类型 | 备注 |
|---|---|---|
| `^GSPC`、`SPY` 等 | 美股大盘 | S&P 500 |
| `^HSI`、`2800.HK` | 港股大盘 | 恒生指数 |
| `000300.SH` | A 股大盘 | 沪深 300 |
| `BTC-USD` | 加密 | 比特币 |
| 自定义 | — | 业主可加入任意 symbol 当基准 |

详细计算见 §6.13。

### 4.19 标注

业主可在曲线、表格、单条快照上贴**标注**（annotation），用于回溯当时的决策上下文。标注是回顾型功能，不参与任何计算。

标注的锚点类型：

| `anchor_kind` | 锚点 |
|---|---|
| `date` | 某个日期，标注会在所有时间序列图上以竖线显示 |
| `account` | 某个账户的某个日期 |
| `symbol` | 某个标的的某个日期（不区分账户） |
| `position` | 某条 (账户, 标的) 持仓的某个日期 |

业主可以：

- 手动新增、编辑、删除标注；每条标注含日期、标签（短文本）、备注（长文本）、可选标签颜色
- 在阶段性总结生成后，由 LLM 自动产出"建议标注"草稿（如"本月持仓变化最大的事件"），业主确认后落库
- 在趋势图、持仓详情、账户详情中以图标 / 竖线 / 角标显示
- 在标注管理页全局列出与搜索

### 4.20 多维聚合

多维表格视图，业主可自由选择行、列、值：

- **行/列维度**：账户、机构、币种、市场、用途、时间（日/月/季/年）、标的
- **值维度**：金额（折算到展示币种）、原币金额、占比、变化值、变化率、持仓成本、持仓市值、浮动盈亏、浮动盈亏率、仓位权重、资产权重
- 提供常见预设：
  - "按机构 × 时间 = 金额折算"
  - "按用途 × 当前 = 金额 + 占比"
  - "按标的 × 时间 = 数量 + 市值"
  - "按标的 × 当前 = 持仓市值 + 浮动盈亏 + 仓位权重"
  - "按市场 × 当前 = 市值 + 占比"

### 4.21 自然语言录入

业主可以在录入入口直接输入自然语言，系统调用 LLM 解析为结构化操作并预览，业主确认后写入。

支持的输入示例与对应操作（见 §8.1 详细契约）：

- "招行 6231 今天 12.3 万"  →  招商银行 cash 账户 → 余额快照
- "汇丰美股 GOOG 加到 50 股，成本不变"  →  汇丰美股账户 → GOOG 持仓快照
- "招行信用卡这期 5800，餐饮 2k 网购 1.5k"  →  招行信用卡 → 当期账单
- "今天 USD/CNY 7.18"  →  汇率快照

### 4.22 自然语言查询

业主可以在查询入口直接提问，系统：

1. 调用 LLM 把问题翻译成 SQL（仅 SELECT，禁止 DML/DDL）
2. 在 finbrain 数据库上执行
3. 把结果以表格 / 数字 / 图表渲染
4. 同时展示生成的 SQL 与可读解释

支持的提问示例（见 §8.2 详细契约）：

- "我去年总资产增长多少？"
- "外汇敞口现在多少？"
- "持有最久的标的是哪只？"
- "这三个月信用卡支出最大的两个类目？"

### 4.23 阶段性总结

业主可手动触发"本月总结"、"本季度总结"、"年度总结"，系统调用 LLM 生成结构化文字总结，包含：

- 总资产变化（绝对值 + 比率）
- 资产配置变化（用途/币种/市场分布对比）
- 持仓增减
- 信用卡支出趋势
- 异常项（如某账户余额骤变）

总结结果可保存为快照式文档，存档于 finbrain 数据库。

### 4.24 数据导出

业主可以：

- 全量导出：所有表的 CSV 包，按表分文件
- 单视图导出：仪表盘、趋势、多维表都支持导出当前视图为 CSV / PNG

---

## 5. 数据模型

### 5.1 实体关系总图

```
institutions ──< accounts    （账户通过 institution_id 引用机构；institutions/accounts 均含 display_order）

accounts ──┬──< balance_snapshots
           │
           ├──< position_snapshots ────> instruments（按 symbol 关联）
           │
           ├──< credit_card_bills
           │
           ├──< income_events ──┐
           │                    └─→ instruments（可选关联标的）
           │
           ├──< transactions ───> instruments（按 symbol 关联，持仓买卖流水）
           │
           ├──< transfers (from_account_id / to_account_id 双向引用)
           │
           └──< （间接被 allocation_targets 与 annotations 引用）

instruments       （标的元数据，symbol 主键，含真实计价币种、市场、资产类型）
corporate_actions （公司动作；按 symbol 关联 instruments，影响所有持有该 symbol 的账户）
prices            （独立，按 symbol 关联 instruments；基准曲线也存这里）
fx_rates          （独立）
allocation_targets（业主目标配置，多套；每套含若干 dimension/key/pct 项）
benchmarks        （基准列表，引用 prices.symbol）
annotations       （标注；通过 anchor_kind + anchor_keys 锚到日期/账户/标的/持仓）
account_templates （建账模板，与运行时账户无引用关系）
user_preferences  （单行）
summaries         （独立，存阶段总结）
```

### 5.2 实体定义

#### 5.2.1 `accounts`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键，自增 |
| `name` | varchar(128) | ✓ | 显示名，唯一 |
| `institution_id` | bigint | ✓ | 外键 → `institutions.id`（见 §5.2.18）；**创建后不可修改** |
| `currency` | varchar(8) | ✓ | ISO 4217 三字母（HKD / USD / CNY 等） |
| `kind` | varchar(32) | ✓ | 用途，推荐值见 §3.1 |
| `display_order` | int | ✓ | 机构内账户排序，默认 0；由账户列表拖动调整 |
| `is_archived` | boolean | ✓ | 默认 false |
| `note` | text | | 自由备注 |
| `created_at` | timestamptz | ✓ | 创建时间 |
| `updated_at` | timestamptz | ✓ | 更新时间 |

约束：

- `UNIQUE(institution_id, name)`（同一机构内账户名唯一；账户名用精简名，机构在 UI 上单独体现）
- `name` 不允许仅空白
- `currency` 形如 `^[A-Z]{3}$`

#### 5.2.2 `instruments`

标的元数据表。一个 symbol 一行，被 `position_snapshots`、`prices`、`income_events`、`benchmarks` 共同引用。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `symbol` | varchar(64) | ✓ | 主键，标的标识，自由文本（如 `GOOG`、`0700.HK`、`161725.SZ`、`BTC-USD`、`^GSPC`） |
| `display_name` | varchar(128) | | 展示名（"腾讯控股"） |
| `market` | varchar(16) | | 市场标签：`US` / `HK` / `CN` / `CRYPTO` / `INDEX` / `OTHER`，开放枚举 |
| `quote_currency` | varchar(8) | | 标的真实计价币种；不填时由应用层在首次出现 `prices` 记录时回填该 price 的 currency |
| `asset_kind` | varchar(16) | | 资产类型：`equity` / `fund` / `etf` / `crypto` / `bond` / `index` / `other`，开放枚举 |
| `is_benchmark` | boolean | ✓ | 是否参与基准对比（默认 false；置 true 后该 symbol 出现在基准选择器中），与 `benchmarks` 表配合使用 |
| `note` | text | | 自由备注 |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `PRIMARY KEY(symbol)`
- 应用层规则：首次在持仓快照、价格、收益事件中引用未登记的 symbol 时，自动创建一条空元数据记录；业主可随时补全字段
- 删除 instruments 必须级联检查所有引用方为空，否则禁止；通常只归档为 `is_benchmark=false`，不删除

#### 5.2.3 `balance_snapshots`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `account_id` | bigint | ✓ | 外键 → accounts.id |
| `snapshot_date` | date | ✓ | 快照日期 |
| `balance` | numeric(20,2) | ✓ | 金额（账户币种），最多两位小数 |
| `note` | text | | 备注 |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(account_id, snapshot_date)`
- `account.kind != 'credit_card'`（应用层校验）

#### 5.2.4 `position_snapshots`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `account_id` | bigint | ✓ | 外键 |
| `symbol` | varchar(64) | ✓ | 标的标识；FK → `instruments.symbol`；首次引用未登记的 symbol 时由应用层自动新建 instruments 记录（业主之后可补全元数据） |
| `quantity` | numeric(28,8) | ✓ | 数量；>= 0（0 表示清仓事件） |
| `avg_cost` | numeric(20,8) | | 平均成本单价 |
| `cost_currency` | varchar(8) | | 成本币种；解析优先级：本字段（如已填） → `instruments.quote_currency`（如非空） → `accounts.currency` |
| `snapshot_date` | date | ✓ | |
| `note` | text | | |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(account_id, symbol, snapshot_date)`
- `quantity >= 0`
- 标的的展示名、市场、真实计价币种、资产类型不在本表存储，按 `symbol` 关联到 `instruments`（见 §5.2.2），避免跨快照重复维护元数据

#### 5.2.5 `credit_card_bills`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `account_id` | bigint | ✓ | 外键，必须是 `kind=credit_card` |
| `statement_date` | date | ✓ | 出账日 |
| `amount_total` | numeric(20,4) | ✓ | 账单总额 |
| `currency` | varchar(8) | ✓ | 默认 = 账户币种 |
| `top_categories` | jsonb | | 顶类目列表 `[{name, amount}]` |
| `paid_at` | date | | 已还日期；NULL 表示未还 |
| `payment_account_id` | bigint | | 还款落地账户；FK → `accounts.id`；NULL = 未指定还款账户。§6.19 现金预期余额据此对该账户扣减 `amount_total` |
| `note` | text | | |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(account_id, statement_date)`
- `amount_total > 0`
- `account.kind = 'credit_card'`（应用层校验）
- `payment_account_id`（如填）FK → `accounts.id`，通常指向现金/借记账户（`kind != 'credit_card'`）；仅当 `paid_at` 非空时参与 §6.19 推演

#### 5.2.6 `income_events`

记录与持仓相关、但不通过买卖动作发生的回报：分红、利息、返现等。独立于快照，**不修改持仓数量、平均成本或账户余额**。详见 §4.5、§6.11。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `event_kind` | varchar(16) | ✓ | `dividend` / `interest` / `rebate` / `other`，开放枚举 |
| `event_date` | date | ✓ | 事件发生日（除息日 / 入账日，由业主选择口径并保持一致） |
| `account_id` | bigint | ✓ | 事件所属的"持仓所在账户"或"利息发生账户" |
| `symbol` | varchar(64) | | FK → `instruments.symbol`；`dividend` 必填，其他可选 |
| `amount` | numeric(20,4) | ✓ | 事件金额；> 0 |
| `currency` | varchar(8) | ✓ | 金额币种 |
| `payment_account_id` | bigint | | 现金落地账户；可与 `account_id` 不同（例：美股分红进入券商现金子账户） |
| `tax_withheld` | numeric(20,4) | | 已扣税额（与 amount 同币种）；可选，便于"税前/税后"统计 |
| `note` | text | | |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `amount > 0`、`tax_withheld >= 0`（如填）
- `event_kind = 'dividend'` 时 `symbol` 必填
- 应用层"重复检测"：`(account_id, symbol, event_kind, event_date, amount, currency)` 五元组重复时提示业主，但不强制阻塞

#### 5.2.7 `prices`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `symbol` | varchar(64) | ✓ | 标的 |
| `price_date` | date | ✓ | 报价日期 |
| `price` | numeric(20,8) | ✓ | 价格；> 0 |
| `currency` | varchar(8) | ✓ | 报价币种 |
| `source` | varchar(32) | | 来源标记（`manual`、`yahoo`、`futu` 等） |
| `created_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(symbol, price_date, currency)`

#### 5.2.8 `fx_rates`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `base_currency` | varchar(8) | ✓ | 源币种 |
| `quote_currency` | varchar(8) | ✓ | 目标币种 |
| `rate_date` | date | ✓ | 汇率日期 |
| `rate` | numeric(20,8) | ✓ | `1 base = rate quote` |
| `source` | varchar(32) | | 来源 |
| `created_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(base_currency, quote_currency, rate_date)`
- `base_currency != quote_currency`
- `rate > 0`

#### 5.2.9 `benchmarks`

业主选择参与"基准对比"（§4.18）的标的清单。基准的价格数据存放在 `prices` 表中，与普通持仓共用同一张表；本表仅描述"哪些 symbol 是基准、显示名是什么"。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `symbol` | varchar(64) | ✓ | FK → `instruments.symbol`；同时要求 `instruments.is_benchmark = true` |
| `display_name` | varchar(128) | ✓ | 显示名（"S&P 500"、"恒生指数"） |
| `default_visible` | boolean | ✓ | 是否在趋势图上默认勾选叠加 |
| `display_order` | int | ✓ | 排序 |
| `note` | text | | |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(symbol)`
- 删除 `benchmarks` 行只取消"作为基准"的身份，不删除 `prices` 中的历史价格

#### 5.2.10 `allocation_targets`

业主的目标配置（§4.15）。每"套"目标 = 一行 `allocation_target_sets` + 多行 `allocation_target_items`。

##### 5.2.10.1 `allocation_target_sets`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `name` | varchar(128) | ✓ | 业主自命名（"按用途分布目标"） |
| `dimension` | varchar(32) | ✓ | 目标维度：`kind` / `currency` / `quote_currency` / `market` / `institution` / 自定义字符串 |
| `drift_threshold_pct` | numeric(5,2) | ✓ | 漂移阈值，超过则 UI 高亮，默认 5.00 |
| `is_dashboard_visible` | boolean | ✓ | 是否在仪表盘展示，默认 true |
| `is_archived` | boolean | ✓ | 默认 false |
| `note` | text | | |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(name)`
- `drift_threshold_pct > 0`

##### 5.2.10.2 `allocation_target_items`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `set_id` | bigint | ✓ | FK → `allocation_target_sets.id`，删除级联 |
| `dimension_value` | varchar(64) | ✓ | 维度的具体值（`cash` / `USD` / `US` / `汇丰` 等） |
| `target_pct` | numeric(5,2) | ✓ | 目标百分比；> 0 |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(set_id, dimension_value)`
- `target_pct > 0` 且同一 `set_id` 的 `Σ target_pct = 100.00`（应用层校验，写入时校验，允许 ±0.01 容差）

#### 5.2.11 `annotations`

标注（§4.19）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `anchor_kind` | varchar(16) | ✓ | `date` / `account` / `symbol` / `position` |
| `anchor_keys` | jsonb | ✓ | 锚点键值，结构按 `anchor_kind` 而定，例：`{"account_id": 12}` 或 `{"symbol": "GOOG"}` 或 `{"account_id": 12, "symbol": "GOOG"}` |
| `event_date` | date | ✓ | 标注对应的日期（用于在曲线上定位） |
| `label` | varchar(64) | ✓ | 短标签 |
| `body` | text | | 长备注 |
| `color` | varchar(16) | | 标签色（如 `red` / `green` / `gray`），仅 UI 表现用 |
| `source` | varchar(16) | ✓ | `manual` / `llm`（LLM 自动建议后业主已确认），默认 `manual` |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `event_date` 必填
- `anchor_keys` 结构由应用层按 `anchor_kind` 校验

#### 5.2.12 `account_templates`

建账模板（§4.1）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `name` | varchar(128) | ✓ | 模板名（"汇丰多币种三件套"） |
| `description` | text | | 模板说明 |
| `is_builtin` | boolean | ✓ | 系统内置模板不可删除，可复制为自定义模板 |
| `account_blueprints` | jsonb | ✓ | 账户骨架列表，元素结构 `{name_suffix, kind, currency, note}` |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(name)`
- 模板被使用后即生成独立的 `accounts` 行，与模板无运行时关联；删除模板不影响已创建账户

#### 5.2.13 `user_preferences`

单行表，键值对存储用户偏好。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | int | ✓ | 永远 = 1 |
| `display_currency` | varchar(8) | ✓ | 默认 `CNY` |
| `fx_mode` | varchar(16) | ✓ | `current`（当前汇率折算）/ `historical`（按快照日汇率），默认 `current` |
| `time_aggregation_default` | varchar(8) | ✓ | `day` / `month` / `quarter` / `year`，默认 `month` |
| `updated_at` | timestamptz | ✓ | |

#### 5.2.14 `summaries`

存档阶段性总结。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `period_kind` | varchar(16) | ✓ | `month` / `quarter` / `year` |
| `period_start` | date | ✓ | |
| `period_end` | date | ✓ | |
| `display_currency` | varchar(8) | ✓ | 生成时的展示币种 |
| `content` | text | ✓ | 总结正文（Markdown） |
| `meta` | jsonb | | 生成时使用的关键数据快照 |
| `created_at` | timestamptz | ✓ | |

#### 5.2.15 `transactions`

持仓型账户的买卖交易流水（§3.10、§4.6）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `account_id` | bigint | ✓ | FK → `accounts.id`，必须是持仓型账户（如 `brokerage`、`crypto`） |
| `symbol` | varchar(64) | ✓ | FK → `instruments.symbol` |
| `action` | varchar(16) | ✓ | `buy` / `sell` |
| `trade_date` | date | ✓ | 成交日 |
| `settle_date` | date | | 结算日，缺省视为当日；用于现金预期余额推演 |
| `quantity` | numeric(20,8) | ✓ | 数量（始终为正，方向由 `action` 决定） |
| `price` | numeric(20,8) | ✓ | 单价（成交价） |
| `currency` | varchar(8) | ✓ | 成交价与手续费的币种（同币种简化原则；跨币种买卖前先 §4.X 转账换汇） |
| `fee` | numeric(20,8) | | 手续费 + 印花税 + 平台费等综合费用；未结算时常缺省，事后补录 |
| `is_settled` | boolean | ✓ | 默认 `false`；业主对完账后置 `true`。**两态均可直接修改字段** |
| `notes` | text | | 备注 |
| `source` | varchar(16) | ✓ | `manual` / `llm`，默认 `manual` |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `(account_id, symbol, action, trade_date, price, quantity)` 不强制唯一，业主同日可能多笔同价同向交易
- `action` 仅 `buy` / `sell`；公司动作（split / merge / rights）不进本表，进 `corporate_actions`
- `quantity > 0`、`price >= 0`、`fee >= 0`
- `currency` 应与该 `symbol` 在 `instruments.quote_currency` 一致；不一致允许但 UI 警示
- **本表允许 in-place 修改与删除任意历史记录**，是 finbrain 唯一对历史可修改的业务表

#### 5.2.16 `corporate_actions`

公司动作事件（§3.11、§4.7）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `symbol` | varchar(64) | ✓ | FK → `instruments.symbol` |
| `action` | varchar(16) | ✓ | `split`（拆股）/ `merge`（合股）/ `rights`（配股） |
| `event_date` | date | ✓ | 除权日 |
| `ratio_numerator` | numeric(20,8) | ✓ | 拆股 1→N 中的 N；合股 N→1 中的 1 |
| `ratio_denominator` | numeric(20,8) | ✓ | 拆股 1→N 中的 1；合股 N→1 中的 N |
| `extra` | jsonb | | 配股细节，如 `{rights_price, rights_currency, base_share_ratio}` |
| `notes` | text | | |
| `source` | varchar(16) | ✓ | `manual` / `llm` |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(symbol, action, event_date)`
- 拆股回放规则：之后所有持仓数量 × `ratio_numerator / ratio_denominator`，加权买入成本按反比缩放；**不回写已实现盈亏**
- 合股是拆股的反向
- 配股按"系统自动生成一条 buy 交易"的方式处理（数量与价格按 `extra` 推断），生成的 `transactions` 行 `source = corporate_action_<id>`

#### 5.2.17 `transfers`

账户间转账（§3.12、§4.8）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键 |
| `from_account_id` | bigint | ✓ | FK → `accounts.id` |
| `to_account_id` | bigint | ✓ | FK → `accounts.id` |
| `from_amount` | numeric(20,8) | ✓ | 转出金额（以转出账户币种计） |
| `to_amount` | numeric(20,8) | ✓ | 转入金额（以转入账户币种计）；同币种时 = `from_amount`，跨币种由业主手填 |
| `transfer_date` | date | ✓ | 转账日；用于现金预期余额推演 |
| `notes` | text | | |
| `source` | varchar(16) | ✓ | `manual` / `llm` |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `from_account_id <> to_account_id`
- `from_amount > 0`、`to_amount > 0`
- 跨币种转账（账户币种不一致）时 `to_amount / from_amount` 是隐含的成交汇率，**不写入 `fx_rates` 表**（这是单次成交价，不可推广）
- 总净资产在 transfer 前后**不变**（仅币种 / 账户 / 用途分布变化）
- 允许 in-place 修改与删除

#### 5.2.18 `institutions`

机构实体（§3.1、§4.1）。账户通过 `institution_id` 引用机构；改机构名自动反映到其所有账户。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | bigint | ✓ | 主键，自增 |
| `name` | varchar(128) | ✓ | 机构名，唯一（如 `汇丰`、`招商银行`、`富途证券`） |
| `kind` | varchar(16) | | 机构类型：`bank` / `broker` / `exchange` / `wallet` / `other`，开放字符串 |
| `note` | text | | 自由备注 |
| `display_order` | int | ✓ | 机构排序，默认 0；由机构列表拖动调整 |
| `created_at` | timestamptz | ✓ | |
| `updated_at` | timestamptz | ✓ | |

约束：

- `UNIQUE(name)`、`name` 不允许仅空白
- 删除机构：仅当没有任何 `accounts.institution_id` 引用它时允许；否则禁止（应用层校验）

---

### 5.3 时序与历史保留

- 所有快照表都按 `snapshot_date` / `statement_date` 索引；查询某日截面的"取该日期或之前最后一条"
- 不删除任何历史快照，除非业主主动删除
- 修改账户元数据（如 `name`、`kind`、`note`）不影响历史快照中已存的金额；账户 `currency` 创建后不可修改，避免历史快照被按新币种重新解释

---

## 6. 计算规则

### 6.1 账户当前余额取值

- **金额型账户**当前余额 = 该账户最新一条 `balance_snapshots.balance`
- 若账户没有任何余额快照，当前余额为 0（不显示为"未知"，因为业主可能就是没录）

### 6.2 持仓市值

对每条 (account, symbol) 持仓：

```
market_value(account, symbol, on_date)
  = quantity_at(account, symbol, on_date)
    × price_of(symbol, on_date, in account.currency)
```

其中：

- `quantity_at` = 该账户该标的不晚于 `on_date` 的最新一条 `position_snapshots.quantity`
- `price_of` = `prices` 表中该标的不晚于 `on_date` 的最新一条价格，若价格币种与账户币种不同，再过一道汇率折算

若任一查找失败：

- 找不到 `quantity` → 持仓视为 0
- 找不到 `price` → 该持仓在视图中标记"无价格"，单独列出但不计入总值

### 6.3 跨币种折算

折算单位金额 `amount_in_currency(amount, from_ccy, to_ccy, on_date)`：

- 若 `from_ccy == to_ccy`，直接返回 `amount`
- 否则查找汇率：
  - **fx_mode = `current`**（默认）：取 `fx_rates` 中 `(from_ccy, to_ccy)` 的最新一条（不限日期）
  - **fx_mode = `historical`**：取 `fx_rates` 中 `(from_ccy, to_ccy)` 不晚于 `on_date` 的最新一条
- 若找不到直接汇率：尝试反向汇率（`(to_ccy, from_ccy)` 取倒数）；再失败则尝试间接路径（经 USD 中转）；都失败按 1:1 降级，并在 UI 标注"汇率缺失"

### 6.4 总资产 / 总负债 / 净资产

```
total_assets(on_date, display_ccy) =
    Σ over accounts where kind != 'credit_card':
        amount_in_currency(
          balance_at(account, on_date) + Σ market_values(account, on_date),
          account.currency,
          display_ccy,
          on_date
        )

total_liabilities(on_date, display_ccy) =
    Σ over credit_card_bills where paid_at IS NULL or paid_at > on_date:
        amount_in_currency(amount_total, currency, display_ccy, on_date)

net_worth = total_assets - total_liabilities
```

### 6.5 时间轴聚合

时间轴按"截面"取值，而非"区间"求和。任意日期 D 的截面 = §6.1–6.4 在 `on_date = D` 上的计算结果。

支持的粒度：

- **每日**：区间内每一天都画一个点
- **月度**：每月最后一天的截面（当月 = 今天）
- **季度**：每季度最后一天的截面（当季 = 今天）
- **年度**：每年最后一天的截面（当年 = 今天）

业主可在偏好中改默认粒度；任意视图都允许临时切换。

每日粒度的实现见 §6.14。

信用卡支出柱状图按"账单 statement_date 落在该期"汇总（不参与截面取值）。

### 6.6 同 symbol 跨账户合并

聚合"按标的"展示时：

- 多账户同 symbol 合并显示总数量
- 总市值 = 各账户分别按账户币种计算市值，再分别折算到展示币种后求和
- 平均成本：按 `Σ(quantity_i × avg_cost_i × cost_currency_to_display) / Σ(quantity_i)` 计算加权均值，跨币种均换算到展示币种后再加权
- 合并后的盈亏与权重重新按 §6.7 公式计算（先合并、后算指标，避免按各账户算后再加和导致口径不一致）

### 6.7 持仓盈亏与仓位指标

对每条 (account, symbol) 持仓，在日期 D 与展示币种 display_ccy 下：

```
quantity     = quantity_at(account, symbol, D)
avg_cost     = 该 quantity 同一条 position_snapshots 的 avg_cost
cost_ccy     = position_snapshots.cost_currency（如填） → instruments.quote_currency（如非空） → accounts.currency
price        = price_of(symbol, D, in cost_ccy)

# 原币口径
cost_basis_native    = quantity × avg_cost
market_value_native  = quantity × price
unrealized_pl_native = market_value_native − cost_basis_native
unrealized_pl_rate   = unrealized_pl_native / cost_basis_native    # 原币口径，无汇率噪声

# 展示币种口径（用于汇总与排名）
cost_basis_display    = amount_in_currency(cost_basis_native,    cost_ccy, display_ccy, D)
market_value_display  = amount_in_currency(market_value_native,  cost_ccy, display_ccy, D)
unrealized_pl_display = market_value_display − cost_basis_display
```

**仓位权重**（在日期 D，展示币种 display_ccy 下）：

```
total_position_value(D, display_ccy) =
    Σ over all (account, symbol) positions:
        market_value_display(account, symbol, D, display_ccy)

position_weight(account, symbol) =
    market_value_display(account, symbol) / total_position_value
asset_weight(account, symbol) =
    market_value_display(account, symbol) / net_worth(D, display_ccy)
```

**汇总指标**：

```
total_cost_basis_display    = Σ cost_basis_display
total_market_value_display  = total_position_value
total_unrealized_pl_display = total_market_value_display − total_cost_basis_display
total_unrealized_pl_rate    = total_unrealized_pl_display / total_cost_basis_display
```

**降级**：

- 找不到价格 → 该持仓盈亏与权重不计算，UI 标注"无价格"，不计入汇总分子分母
- 找不到 `avg_cost` → 该持仓只显示市值与权重，不显示盈亏与盈亏率，不计入总成本与总盈亏的分子分母
- 跨账户合并见 §6.6（先合并 quantity 与加权 avg_cost、再按本节公式重新计算）

**口径说明**：

- 单标的盈亏率默认按"原币口径"计算，避免汇率波动污染单标的真实涨跌
- 盈亏绝对值在汇总到展示币种时，按 §6.3 fx_mode 折算
- **未平仓部分**为浮动盈亏；**已平仓部分**为已实现盈亏（见 §6.15–6.17）。**总盈亏 = 浮动 + 已实现 + 累计收益事件**
- 当 `(account, symbol)` 存在交易历史时，`quantity` 与 `avg_cost` 优先按交易回放派生（§6.15）；无交易历史则回退到 `position_snapshots`

### 6.8 持仓时长

对每条 `(account, symbol)` 持仓，在日期 D：

```
最近一次连续持有段起点 = 在不晚于 D 的快照里，最近一段连续 quantity > 0 的起始日。
形式定义：找出 D 之前最近的一条 quantity = 0 的快照（或不存在），
该快照之后的第一条 quantity > 0 的快照即为起点 S；
若从未出现 quantity = 0 的快照，则 S = 该 (account, symbol) 的最早一条 quantity > 0 的快照日期。

holding_duration_days(account, symbol, D) = D − S
```

**跨账户合并的持仓时长**（按 symbol 合并展示时）：取该 symbol 在所有账户中最早的"最近一次连续持有段起点"为起点，重新计算时长。

**降级**：若该 symbol 在 D 时点 `quantity = 0` 或无任何快照，持仓时长为空（UI 显示 "—"）。

### 6.9 真实币种暴露

把"业主在某币种上的真实风险敞口"按持仓的**真实计价币种**而非账户币种聚合。

```
exposure(currency, on_date, display_ccy) =
    Σ over balance_snapshots (account.currency = currency, kind != 'credit_card'):
        amount_in_currency(balance_at(account, on_date), currency, display_ccy, on_date)
  + Σ over position_snapshots
        WHERE instruments[symbol].quote_currency = currency
        AND quantity_at(account, symbol, on_date) > 0:
        amount_in_currency(market_value_native(account, symbol, on_date), currency, display_ccy, on_date)
  − Σ over credit_card_bills (currency = currency, paid_at IS NULL or > on_date):
        amount_in_currency(amount_total, currency, display_ccy, on_date)
```

口径说明：

- "真实计价币种"取自 `instruments.quote_currency`；缺省时回退到 `position_snapshots.cost_currency`，再回退到 `accounts.currency`
- 现金类账户的暴露 = 账户币种（账户里就是这个币种的现金）
- 持仓类资产的暴露 = 标的的真实计价币种（GOOG 在港币账户依然算 USD 暴露）
- 信用卡未还账单按账单币种扣减
- 暴露占比 = 该币种暴露 ÷ Σ 全部币种暴露绝对值

### 6.10 配置漂移

对每套目标配置（`allocation_target_sets` 一行 + 关联的 items），在日期 D 与展示币种 display_ccy 下：

```
# 1. 按目标维度算实际占比
actual_pct(set, dim_value) =
    aggregate_value(dimension = set.dimension, dim_value, on_date = D, display_ccy)
  / total_aggregable_value(set.dimension, on_date = D, display_ccy)
  × 100

其中 aggregate_value 按维度选择不同口径：
- dimension = kind / institution / currency / market：基于 §6.4 net_worth 的子集
- dimension = quote_currency：基于 §6.9 的暴露口径

# 2. 漂移
drift(set, dim_value) = actual_pct − target_pct
abs_drift(set, dim_value) = |drift|

# 3. 再平衡建议金额
rebalance_amount(set, dim_value) = drift × net_worth(D, display_ccy) / 100

# 4. 漂移命中阈值
hit_threshold = abs_drift > set.drift_threshold_pct
```

**未在目标里出现的维度值**：以 `target_pct = 0` 处理（即任何实际占比都视为漂移）。

**总和校验**：实际占比之和不必恰为 100%（取决于 dimension 是否覆盖全部资产，比如 `market` 仅覆盖持仓型）；UI 上要显示分母与覆盖率说明。

### 6.11 收益事件汇总

对一条 `(account, symbol)` 持仓在区间 [D1, D2]（含两端）：

```
income_total_native(account, symbol, [D1, D2], event_kind) =
    Σ income_events
        WHERE account_id = account.id
          AND symbol = symbol
          AND event_kind = event_kind   -- 任一类型或全部
          AND event_date BETWEEN D1 AND D2:
        amount

income_total_display(account, symbol, [D1, D2], event_kind, display_ccy) =
    Σ income_events 同上:
        amount_in_currency(amount, currency, display_ccy, event_date)
```

**累计口径**（持仓分析里"累计收益事件"指标）：D1 = `'1970-01-01'`（即历史开始），D2 = 当前日期。

**总回报**（持仓维度，区间 [D1, D2]）：

```
total_return_native(account, symbol, [D1, D2]) =
    market_value_native(account, symbol, D2) − market_value_native(account, symbol, D1)
  + income_total_native(account, symbol, [D1, D2], all)

total_return_display = 各项分别按各自时点折算到 display_ccy 后求和
```

口径说明：

- 收益事件**不**自动改变持仓数量、平均成本或余额；如业主同时录了余额快照"反映"该笔现金到账，收益事件本身不会重复影响净资产计算（净资产基于快照，不基于事件）
- 但在"总回报""期间收益归因"等口径里，收益事件作为独立加项参与，避免低估真实回报
- 跨账户合并：收益事件按 symbol 合并求和

### 6.12 期间对比与贡献度

对两个截面日期 D1、D2（D1 < D2），展示币种 display_ccy：

```
# 1. 净资产变化
delta_nw_display = net_worth(D2, display_ccy) − net_worth(D1, display_ccy)

# 2. 任一聚合维度的差异（行=维度值）
对每个维度值 v：
    v1 = aggregate_value(dimension, v, D1, display_ccy)
    v2 = aggregate_value(dimension, v, D2, display_ccy)
    delta_v = v2 − v1
    delta_rate_v = delta_v / v1   # v1 = 0 时记为新增
    contrib_pct_v = delta_v / delta_nw_display × 100   # 对净资产变化的贡献占比
```

**收益归因**（区间 [D1, D2] 内对单条 `(account, symbol)` 持仓的总贡献分解）：

```
# 数据准备
q1, q2 = quantity_at(D1), quantity_at(D2)
p1, p2 = price_of(D1), price_of(D2)
fx1, fx2 = fx_rate(cost_ccy → display_ccy, D1), fx_rate(..., D2)

# 在 fx_mode = current 下（汇率统一用 D2 时点）
contrib_price    = q1 × (p2 − p1) × fx2
contrib_quantity = (q2 − q1) × p2  × fx2
contrib_income   = income_total_display(account, symbol, [D1, D2], all, display_ccy)
contrib_total    = contrib_price + contrib_quantity + contrib_income
                 = market_value_display(D2) − market_value_display(D1) + contrib_income

# 在 fx_mode = historical 下额外分离 fx 贡献
contrib_fx       = q1 × p1 × (fx2 − fx1)
contrib_total    = contrib_price + contrib_quantity + contrib_income + contrib_fx
```

口径说明：

- 数量贡献 `contrib_quantity` 把"加仓 / 减仓 / 清仓"的影响归到独立的桶，不与价格变动混淆
- 收益事件贡献 `contrib_income` 反映分红/利息的真实回报，不会被快照差值"吞掉"
- 汇率贡献 `contrib_fx` 仅在 historical 模式下输出；current 模式下汇率统一为 D2，不产生 fx 贡献

**降级**：

- 缺 D1 或 D2 时点的价格 / 汇率 → 该持仓不参与归因，单列展示
- 现金账户没有 price 概念，归因桶里只有 `contrib_quantity`（即余额变化），加上其关联的收益事件

### 6.13 基准对比

对一条基准 `bench`（symbol b 在 `instruments` 中 `is_benchmark = true`）与业主净值 / 持仓总值在区间 [D1, D2]：

```
bench_native(b, D) = price_of(b, D, in instruments[b].quote_currency)
bench_display(b, D) = amount_in_currency(bench_native(b, D), instruments[b].quote_currency, display_ccy, D)

# 三种对比口径
1. 绝对值：双 y 轴，左 = subject（业主指标），右 = bench_native（基准原币点位）
2. 归一化（rebase=100）：
       subject_indexed(D) = subject(D)        / subject(D1)        × 100
       bench_indexed(D)   = bench_display(D)  / bench_display(D1)  × 100
3. 超额收益：excess(D) = subject_indexed(D) − bench_indexed(D)
```

口径说明：

- subject 可选：净资产 / 持仓总市值 / 任一目标配置桶的市值
- 基准价格统一通过 §6.3 跨币种折算到 display_ccy 后再做归一化，避免基准币种不同造成视觉错位
- 对比起点 D1 必须是基准与 subject 都有数据的日期；任一缺失时把对比起点向右推到首个共同有数据的日

### 6.14 稀疏存储与查询插值

finbrain 的核心存储原则是**稀疏存储**：数据库只保留业主真实录入的快照，不为缺失日期填充。任意日期截面通过"取最近一条"规则实时计算。

**查询插值规则**：

```
balance_at(account, on_date) =
    最新一条 balance_snapshots
    WHERE account_id = account.id
      AND snapshot_date <= on_date

quantity_at(account, symbol, on_date) =
    最新一条 position_snapshots.quantity
    WHERE account_id = account.id
      AND symbol = symbol
      AND snapshot_date <= on_date

price_at(symbol, on_date) =
    最新一条 prices.price
    WHERE symbol = symbol
      AND price_date <= on_date

fx_rate_at(base, quote, on_date) =
    见 §6.3 的 fx_mode 分支
```

若某账户/某标的在 `on_date` 之前没有任何快照，按 0 处理（视为该账户/标的当时不存在）。

**修订语义**：

- 修改一条快照立即改变其影响区间（从该快照日期到下一条同维度快照前）
- 删除一条快照让其原影响区间退化为前一条快照（或 0，如果是最早一条）
- 不需要级联更新任何派生数据，因为不存在派生数据

**每日曲线实现**：

每日曲线在查询时实时计算，不预生成；典型实现是 SQL 的 `generate_series` + `LATERAL JOIN` 一条查询完成。即使引入每日价格与汇率后，5 年 × 数十账户 × 数十持仓的计算量在 PostgreSQL 上仍稳定在亚秒级，完全满足产品诉求。

如未来观察到性能瓶颈，可在不改动业务表结构的前提下引入物化视图；这是实施层选择，不影响产品语义。

### 6.15 持仓交易回放与派生口径

当 `(account, symbol)` 存在 `transactions` 记录时，持仓的 quantity 与加权买入成本通过**回放**派生：

```
# 起点：取该 (account, symbol) 在首条 transaction 之前的最新 position_snapshot
state = {
  quantity:           snapshot.quantity 或 0,
  weighted_buy_cost:  snapshot.avg_cost 或 0,
  realized_pl:        0,            # 已实现盈亏累计（原币）
}

# 按 (trade_date, id) 升序遍历该 symbol 的所有 transactions 与 corporate_actions
for event in events_in_order:
  if event is buy:
    new_total_cost = state.weighted_buy_cost × state.quantity
                   + event.price × event.quantity
                   + (event.fee 计入成本时按 §6.16 决策)
    state.quantity         += event.quantity
    state.weighted_buy_cost = new_total_cost / state.quantity

  elif event is sell:
    realized_per_share = event.price − state.weighted_buy_cost
    state.realized_pl  += realized_per_share × event.quantity − event.fee  # 卖出手续费扣减已实现盈亏
    state.quantity     -= event.quantity
    # 卖出不改变 weighted_buy_cost

  elif event is corporate_action(split | merge):
    factor = ratio_numerator / ratio_denominator
    state.quantity         *= factor
    state.weighted_buy_cost /= factor
    # 不修改 state.realized_pl

  elif event is corporate_action(rights):
    # 按 extra 推断一条等价 buy 交易并走 buy 分支
    ...
```

**派生指标**：

```
effective_cost   = state.weighted_buy_cost − state.realized_pl / state.quantity   # 净持有成本，可负
total_pl_native  = unrealized_pl_native + state.realized_pl + income_total_native
```

**降级规则**：

- 无交易历史 → 走 §6.7 既有规则（按 position_snapshot 取 avg_cost）
- 有交易历史但无起始 position_snapshot → 起始状态视为 `quantity=0`、`weighted_buy_cost=0`
- 同日同 symbol 多笔交易按 `id` 升序处理（业主录入顺序）

### 6.16 已实现盈亏与手续费口径

**已实现盈亏（每笔 sell）**：

```
realized_pl_per_share = sell_price − weighted_buy_cost(at sell time)
realized_pl_of_sell   = realized_pl_per_share × sell_quantity − sell_fee
```

**手续费归属**：

- **买入手续费**：默认**不计入加权买入成本**（保持与券商"持仓成本"列一致）；以单独累计的 `buy_fee_total` 字段反映在总盈亏分母里
- **卖出手续费**：直接从该笔 sell 的 realized_pl 中扣减
- 业主可在偏好中切换"买入手续费计入成本"模式（此时 weighted_buy_cost 用 `(price × qty + fee) / qty` 入栈）；默认关闭

**总盈亏汇总**：

```
total_pl(account, symbol, on_date)
  = unrealized_pl_native(on_date)        # 未平仓部分账面浮动
  + cumulative_realized_pl(on_date)      # 已平仓部分历史累计
  + cumulative_income(on_date)           # 同 §6.11 的 income_events 累计
```

汇总到展示币种时各段分别按 §6.3 折算。

### 6.17 公司动作回放

公司动作在 §6.15 的事件队列中按 `event_date` 与交易混排，按以下规则处理：

- **split / merge**：调整 `quantity` 与 `weighted_buy_cost`，不修改 `realized_pl`，不修改历史 transactions 行
- **rights**：按 `extra` 推断一条等价 buy（数量 = 当时持仓 × `base_share_ratio`，价格 = `rights_price`），追加到事件流；该 buy 的 source 标为 `corporate_action_<id>`

**幂等**：corporate_action 行存在即生效；删除该行则相当于回滚该次比例调整。

**不回写历史**：拆股之前已经计算并落账的 realized_pl 保留原值。例如：1 元买入 100 股，10 元卖出 50 股得 realized = 450 元；之后 1→2 拆股，持仓变 100 股、weighted_buy_cost 变 0.5 元，realized_pl 仍是 450 元。

### 6.18 账户转账

`transfers` 不影响净资产。对现金预期余额的影响：

```
expected_balance_delta(from_account) += −from_amount   # 转出日
expected_balance_delta(to_account)   += +to_amount     # 转入日（即使跨币种）
```

跨币种转账隐含的 `to_amount / from_amount` 仅在该次成交时有效，不写入 `fx_rates`。

### 6.19 现金预期余额与对账差额

对持仓型账户或现金型账户，**预期余额**从最近一次 `balance_snapshot` 起按期间所有事件推演：

```
expected_balance(account, on_date) =
    balance_snapshot.balance(account, snapshot_date)              # 最近基准
  + Σ transactions   between (snapshot_date, on_date]:            # 仅当 account 是该 transaction 的 account_id
        action=buy   →  −(price × quantity + fee)
        action=sell  →  +(price × quantity − fee)
  + Σ transfers      between (snapshot_date, on_date]:
        from_account_id = account.id  →  −from_amount
        to_account_id   = account.id  →  +to_amount
  + Σ income_events  between (snapshot_date, on_date]:
        payment_account_id = account.id  →  +amount
  + Σ credit_card_bills paid in window with payment_account_id = account.id
                                       →  −amount_total
```

**对账差额**：

```
reconciliation_delta(account, on_date)
  = expected_balance(account, on_date)
  − latest_balance_snapshot(account, on_date).balance
```

当 `|delta| / expected_balance > 0.5%`（业主可配置阈值，默认 0.5%）时，账户详情高亮提示业主补录交易或修订快照。

**仅含已结算口径**：业主可在视图上切换"仅含 `is_settled=true` 的交易"参与推演，用于排查未结算项导致的差额。

### 6.20 持仓快照与交易回放的对账

对存在交易历史的 `(account, symbol)`：

```
replay_quantity        = §6.15 回放结果
snapshot_quantity      = quantity_at(account, symbol, on_date)
position_delta         = replay_quantity − snapshot_quantity
```

`position_delta != 0` 时视图标记差额。差额可能来自：未录入的 split、未录入的 sell、单位错录等。业主可选择"以交易为准覆盖快照"或"以快照为准补一条调整交易"。

---

## 7. 视图与交互

> 本节面向交互设计，描述视图的内容与流转，不规定具体布局。

### 7.1 仪表盘（首页）

- 顶部：净资产大数 + 较上月变化
- 顶部：展示币种切换、刷新按钮、"开始本月盘点"主按钮
- 顶部摘要卡：持仓总市值、总浮动盈亏（绝对值 + 百分比）、本年已实现盈亏、累计收益事件（本年），点击进入 §7.4 持仓总览
- 配置漂移卡（每套 `is_dashboard_visible = true` 的目标配置一行）：当前 vs 目标的 mini 条形对比 + 漂移最大的 1–2 项；点击进入 §7.14 目标配置
- 对账状态卡：列出"现金对账差额超阈值的账户数量 + 未结算交易数量"；点击进入 §7.12 现金对账
- 中部并排：
  - 资产配置（按用途）饼图 + 列表
  - 资产配置（按账户币种）饼图 + 列表
  - 资产配置（按真实计价币种 / 币种暴露）饼图 + 列表，见 §6.9
  - 资产配置（按机构）饼图 + 列表
- 下部：净资产趋势折线图（默认最近 12 月，叠加默认基准与最近标注）
- 下部：信用卡当月支出柱状图（最近 12 月）
- 侧栏快捷入口：账户列表、持仓总览、目标配置、趋势分析、期间对比、多维聚合、自然语言、收益事件、持仓交易、公司动作、账户转账、现金对账、价格/汇率/基准维护、设置

### 7.2 账户列表

- 按机构折叠分组，每个机构下列出账户
- 每个账户显示：名称、用途标签、币种、当前余额（账户币种 + 折算到展示币种）、最近一次快照日期
- 长期未更新（> 35 天）的账户在最近快照日期上标灰提示
- 点击账户进入"账户详情"

### 7.3 账户详情

- 头部：账户元数据
- 头部摘要卡（仅持仓型账户）：本账户持仓总市值、总浮动盈亏（绝对值 + 百分比）、**已实现盈亏**（如有交易历史）、累计收益事件（按当前展示币种）、本账户在净资产中的占比
- 头部对账卡（仅当存在交易/转账/收益事件历史）：预期余额 vs 最新现金快照差额；超阈值高亮，点击进入 §7.12 现金对账
- 主区：该账户所有余额快照按时间倒序列表
- 主区：该账户所有持仓按 symbol 分组，每组显示当前数量、加权买入成本、净持有成本、现价、持仓成本、持仓市值、浮动盈亏、浮动盈亏率、已实现盈亏、累计收益事件、总盈亏、持仓时长、仓位权重、资产权重，展开后是该 symbol 历史持仓快照 + 历史交易时间线
- 主区：该账户所有收益事件按时间倒序列表（可按事件类型筛选）
- 主区：该账户所有交易（如有）按时间倒序列表，行内可改可删，按未结算/已结算筛选
- 主区：该账户所有转入 / 转出（如有）按时间倒序列表
- 主区：该账户所有信用卡账单（如适用）
- 操作：录入新快照、编辑快照、删除快照、归档账户、新增收益事件、新增交易、新增转账

### 7.4 持仓总览

集中展示所有持仓型资产的当前状态，是业主做"持仓体检"的入口。

- 顶部汇总卡：持仓总市值、持仓总成本、总浮动盈亏、**总已实现盈亏**、累计收益事件、**总盈亏**（=浮动+已实现+收益事件）、持仓占净资产比，全部按展示币种
- 主表格：每行一条 `(账户, 标的)` 持仓
  - 列：账户、机构、标的、市场、真实计价币种、数量、加权买入成本、净持有成本、现价、持仓成本、持仓市值、浮动盈亏、浮动盈亏率、已实现盈亏、累计收益事件、总盈亏、持仓时长、仓位权重、资产权重、最近快照日期、最近交易日期、最近价格日期
  - 列可显示/隐藏、可排序
  - "无价格"行高亮提示并置底
  - 盈亏列正负色编码（约定值在交互稿决定）
  - 成本列双口径切换：加权买入成本（默认）/ 净持有成本
- 视图切换：
  - **按账户分组**：每账户折叠列出其持仓
  - **按标的合并**：多账户同 symbol 合并为一行（见 §6.6 / §6.7 / §6.8 / §6.11）
  - **按市场分组**：US / HK / CN / CRYPTO 等分组
  - **按真实计价币种分组**：USD / HKD / CNY 等
- 筛选：账户、机构、市场、账户币种、真实计价币种、是否盈利、是否有价格、持仓时长 > N 天、是否有交易历史
- 点击任意行进入"持仓详情"：该持仓的历史快照列表 + 历史交易时间线（含公司动作）+ 历史浮动盈亏曲线 + 已实现盈亏分段 + 该持仓的收益事件时间线 + 与该 symbol 关联的标注

### 7.5 月度盘点向导（核心录入流程）

引导业主一次性更新所有账户的当月快照：

1. **选择盘点日期**（默认今天）
2. **金额型账户清单**：列出非信用卡的活跃账户，逐个填入当日余额。提供：
   - "上次值"参考
   - "保留上次"按钮（一键复制上次值）
   - "无变化"按钮（不录入新快照，跳过）
3. **持仓型账户清单**：对每个有历史持仓的账户：
   - 若该账户走交易流水模式：展示自上次盘点至今的所有交易回顾，提示业主补录遗漏的交易、把未结算交易置为已结算
   - 若该账户走纯快照模式：列出"上次的持仓清单"，业主逐项确认数量与成本、增删标的
4. **公司动作回顾**：列出本期间内任何已记录的 split / merge / rights 对持仓的影响概览；提示业主补录可能遗漏的公司动作
5. **账户转账**：列出本期间内已录入的转账，提示业主补录遗漏（提示来源：现金对账差额排查）
6. **信用卡账单**：对每张信用卡（或"信用卡合计"账户），提示是否录入本期账单
7. **收益事件**：列出本期间（自上次盘点起至今）业主可能漏记的分红/利息提示（基于"持仓中含分红记录的标的"启发式提示，不强制），允许批量勾选录入
8. **现金对账**：每个账户展示预期余额与最新快照差额，超阈值时提示补录或新建一条余额快照
9. **目标配置漂移检视**：展示每套目标的当前漂移与再平衡建议金额（提醒为主，不阻塞）
10. **预览**：所有待写入的快照、账单、收益事件、交易、转账一览
11. **确认**：批量提交

任意步骤可中断、保存草稿，下次接着填。

### 7.6 单条快速录入

不进向导，从仪表盘或账户详情直接打开浮层：

- 选账户 → 选日期 → 填值 → 提交
- 浮层不离开当前页

### 7.7 信用卡账单录入

- 选信用卡账户、出账日
- 填总额、币种、可选顶类目（动态加行）、可选备注、是否已还
- 提交

### 7.8 收益事件录入

- 顶部事件类型切换：分红 / 利息 / 返现 / 其他
- 选择关联账户（必填）、关联标的（分红必填、其他可选）
- 输入事件日期、金额、币种、可选已扣税额、可选现金落地账户、可选备注
- 提交后系统给出"是否需要同步录入余额快照"的提示链接（不自动写入）
- 列表页：按时间倒序展示历史事件，支持按账户 / 标的 / 类型筛选；行内可编辑、删除

### 7.9 持仓交易录入

- 顶部 buy / sell 切换；切换不改已填字段
- 必填：账户（仅持仓型可选）、标的（自动补全 + 候选 instruments，新标的弹"补元数据"小窗）、数量、单价、币种（默认 = 标的 quote_currency）、成交日
- 可选：结算日、手续费（未结算时常缺省）、备注
- 顶部状态切换：未结算（默认）/ 已结算
- 提交后预览：本笔对持仓数量、加权买入成本、净持有成本、当日预期现金的影响
- 列表页：按账户、按标的、按时间筛选；行内可改任意字段、可删除；状态列双击切换
- 顶部"对账提示条"：列出当前账户最近 N 天预期余额与快照差额超阈值的项，点击跳转 §7.12 现金对账

### 7.10 公司动作

- 单条录入：标的 + action（split / merge / rights）+ 除权日 + 比例 +（rights）配股价、基础比例
- 录入预览：列出该 symbol 当前在 N 个账户共持有 X 股，回放后变成 Y 股；加权买入成本前后对比
- 列表页：按 symbol 分组，按 event_date 排序，行内可改可删
- 删除提示：删除一条公司动作会**回滚**该次比例调整，业主再次确认

### 7.11 账户转账

- 单条录入：转出账户 + 转入账户 + 转出金额 + 转入金额（同币种自动同步、跨币种独立可填）+ 转账日 + 备注
- 跨币种时显示隐含成交汇率（仅展示，不写 fx_rates）
- 列表页：双向时间线视图（每行用箭头展示资金流向），按账户筛选；行内可改可删

### 7.12 现金对账

- 顶部账户选择器（持仓型 + 现金型账户）
- 主区：最近一次现金快照 → 期间事件流（买卖 / 转账 / 收益事件 / 信用卡还款）→ 预期余额 → 与最新快照差额
- 切换"仅含已结算"按钮；切换"按周期对照"模式（按月分段展示对账历史）
- 差额超阈值时高亮 + 排查清单（按 §4.9 第二段顺序）
- 一键操作：「用预期余额覆盖快照」「新建一条今日余额快照承认实际」
- 阈值在偏好里全局设置，也可在本页临时调整

### 7.13 自然语言入口

页面顶栏全局搜索框，业主输入自然语言：

- 系统判断意图：录入 vs 查询 vs 总结
- 如为录入：解析成结构化操作的预览面板，业主确认后写入
- 如为查询：执行并展示结果（数字 / 表 / 图）+ 折叠展示生成的 SQL
- 如为总结：触发阶段性总结生成

### 7.14 目标配置

- 列表：所有目标配置套（含名称、维度、漂移阈值、是否仪表盘可见、是否归档）
- 编辑器（一套配置一页）：
  - 顶部：套名称、维度选择、漂移阈值、仪表盘开关
  - 主区：维度值列表 + 目标百分比输入；右侧实时显示"当前实际占比 / 漂移 / 再平衡建议金额"
  - 总和指示器：实时校验 Σ target_pct = 100%
- 操作：新建、编辑、复制、归档、删除（已归档的可永久删除）
- 与仪表盘联动：勾选"仪表盘可见"后，§7.1 仪表盘"配置漂移卡"展示该套

### 7.15 趋势分析（含基准与标注）

独立页面，比仪表盘的趋势小图维度更全：

- 顶部控件：subject 选择（净资产 / 持仓总市值 / 任一目标配置桶）、时间范围、时间粒度（每日/月/季/年）、展示币种、fx_mode
- 主图：subject 折线 + 可叠加层
  - 基准：在控件勾选要叠加的基准（来自 `benchmarks` 表 `default_visible = true` 默认勾选），三种对比口径切换（绝对值 / 归一化 / 超额收益，见 §6.13）
  - 标注：以竖线 + 角标显示，鼠标悬停展开 label 与 body
  - 收益事件标记：在事件日期打小图标，按事件类型着色
- 下方副图：净资产按用途/币种/市场任选维度的堆叠面积图
- 右侧标注侧栏：列出当前时间范围内的所有标注，可在此新增/编辑/删除（也可在主图上直接点空白添加）

### 7.16 期间对比

- 顶部：两个截面日期选择器，预设按钮（本月vs上月 / 本季vs上季 / 本年vs上年 / 自定义）
- 中部：净资产期初、期末、变化值、变化率四个大数
- 主表格：维度切换（账户 / 标的 / 用途 / 机构 / 币种 / 真实计价币种 / 市场），列固定为 `期初 / 期末 / 变化值 / 变化率 / 贡献占比`
- 自动分桶卡片：增长前 5、下跌前 5、新增项、消失项
- 收益归因卡片（仅 subject = 净资产或持仓总值时展示）：四桶（价格 / 数量 / 收益事件 / 汇率）柱状图，按 §6.12 公式计算

### 7.17 多维聚合视图

类似透视表：

- 顶部维度选择：行（account / institution / currency / market / kind / time / symbol）、列（同样选择集）、值（amount / original_amount / share / delta / delta_rate / cost_basis / market_value / unrealized_pl / unrealized_pl_rate / position_weight / asset_weight）
- 主区表格 + 可切换为图表
- 预设组合下拉

### 7.18 价格 / 汇率 / 基准维护

四个并列的维护页（同一导航入口下切换）：

- **价格表**：所有 `prices` 记录，按 symbol 过滤、按日期排序；新增 / 编辑 / 删除
- **汇率表**：同上
- **标的（instruments）**：所有 symbol 的元数据（`display_name` / `market` / `quote_currency` / `asset_kind` / `is_benchmark`）；新增、编辑、归档；基准切换在此完成
- **基准（benchmarks）**：从 `is_benchmark=true` 的 instruments 里挑一组并设置显示名、是否默认在趋势图上叠加、排序；同步在 §7.15 趋势分析的勾选器中可见

### 7.19 历史阶段总结

- 列表展示历史生成的 `summaries`
- 详情页显示总结正文 + 当时使用的关键数据
- 可对比两次总结之间的差异

### 7.20 设置

- 默认展示币种
- 汇率折算模式（current / historical）
- 时间轴默认粒度
- 标注默认颜色、收益事件默认事件类型等录入快捷项
- 建账模板管理入口（§4.1 / §5.2.12）
- LLM API key 状态（已配置 / 未配置）
- 数据导出入口
- 关于 finbrain（版本号、文档链接）

---

## 8. 自然语言能力契约

### 8.1 自然语言录入

**输入**：业主自由文本。

**LLM 任务**：

1. 识别意图（余额快照 / 持仓快照 / 信用卡账单 / 收益事件 / 持仓交易 / 公司动作 / 账户转账 / 价格 / 汇率 / 目标配置 / 标注）
2. 抽取关键字段
3. 把"账户名"模糊匹配到 `accounts.name`（允许简称、缩写、口语化），返回 top-3 候选
4. 把"标的"映射到 symbol（允许中英文混用，"腾讯" → `0700.HK`）
5. 把日期表达解析成 ISO 日期（"今天"、"昨天"、"3 月 5 号"）
6. 输出严格的结构化 JSON

**输出契约**（JSON Schema）：

```json
{
  "intent": "balance_snapshot | position_snapshot | credit_card_bill | income_event | transaction | corporate_action | transfer | price | fx_rate | allocation_target | annotation",
  "confidence": 0.0,
  "candidates": [ /* 候选解释列表，业主在 UI 上择一 */ ],
  "needs_clarification": ["..."]
}
```

**意图与目标实体的对应关系**：

| intent | 目标实体 | 备注 |
|---|---|---|
| `balance_snapshot` | `balance_snapshots` | §4.2 |
| `position_snapshot` | `position_snapshots` | §4.3 |
| `credit_card_bill` | `credit_card_bills` | §4.4 |
| `income_event` | `income_events` | §4.5；不修改余额与持仓 |
| `transaction` | `transactions` | §4.6；buy/sell；默认 `is_settled = false`，业主确认后落库 |
| `corporate_action` | `corporate_actions` | §4.7；split/merge/rights；预览影响后再落库 |
| `transfer` | `transfers` | §4.8；跨币种时必须明确 from_amount 与 to_amount 两个数 |
| `price` | `prices` | §4.10 |
| `fx_rate` | `fx_rates` | §4.11 |
| `allocation_target` | `allocation_targets` | §4.15；自然语言写入仅允许更新 target_pct，不允许新增维度 |
| `annotation` | `annotations` | §4.19；写入时 `source = llm` |

**前置规则**：

- 如果置信度低于 0.6，不直接写入，必须 UI 预览 + 业主确认
- 所有写操作最终都经过 UI 预览，无静默写入
- LLM 输出非合法 JSON 时，前端回退为"原始文本 + 手工录入"

### 8.2 自然语言查询

**输入**：业主自由文本提问。

**LLM 任务**：

1. 翻译为单条 SQL
2. SQL 仅允许 `SELECT`；任何 `INSERT / UPDATE / DELETE / DROP / ALTER / TRUNCATE / GRANT / REVOKE / COPY` 都拒绝执行并提示
3. SQL 仅允许查询 finbrain 的业务表（白名单）；不允许 `pg_*`、`information_schema`、`pg_catalog`
4. 输出：SQL + 中文解释 + 推荐的可视化形式（table / number / line_chart / bar_chart / pie_chart）

**前置规则**：

- LLM 输出的 SQL 经过白名单 + 解析校验后再执行
- 执行结果带行数上限（5000 行），超限截断 + 提示
- 执行超时上限（10 秒），超时取消

### 8.3 阶段性总结

**输入**：业主选择期间（month / quarter / year）+ 起止日期 + 当前展示币种。

**LLM 任务**：

1. 系统先在 SQL 层算好关键指标（总资产期初/期末、变化、按用途分布对比、持仓增减、信用卡支出）
2. 把这些指标作为结构化数据输入 LLM
3. LLM 生成 Markdown 文本总结
4. 落库到 `summaries`

**前置规则**：

- LLM 不直接接触原始数据库；只接受系统预先算好的聚合结果
- 总结是事后档案，不参与任何决策逻辑

### 8.4 通用约束

- 所有 LLM 调用使用 Anthropic Claude API
- API 凭据存储在 `infra/.secrets/finbrain.env`，应用通过环境变量读取
- 业主可在设置中关闭所有 LLM 功能（应用退化为纯手工模式）
- 任何 LLM 输出在写入数据库前都必须经过：JSON Schema 校验 + 业主 UI 确认
- LLM 调用日志（输入、输出、时间、token 消耗）保留 30 天用于审计与调试

---

## 9. 安全与认证

- 应用通过 Traefik 暴露，前置 Authelia OIDC 单点登录
- finbrain 自身不实现登录页，依赖反向代理传入的认证头
- 仅业主单用户访问；不存在多用户、权限角色概念
- 数据库连接凭据、LLM API key 存储在 Kubernetes Secret，不入仓库
- 应用日志不记录任何金额或账户余额数值；只记录操作类型与账户 ID

---

## 10. 部署与运行

- 运行环境：Kubernetes（NUC 单节点 k3s）
- 数据库：复用 `infra/data/postgresql` 共享 PostgreSQL 实例，建独立库 `finbrain`
- 入口：Traefik HTTPRoute，路径前缀 `/finbrain/`
- 认证：Authelia OIDC
- 备份：每日 cron 在集群内执行 `pg_dump finbrain` 写入 PVC，保留最近 30 份
- 镜像拉取：通过 NUC 已配置的 DaoCloud 镜像加速
- 资源占用预算：单 Pod，request 50m CPU / 128MiB 内存，limit 500m / 512MiB

---

## 11. 验收标准

每条核心功能的可验证条件：

| 功能 | 验收标准 |
|---|---|
| 账户管理 | 能创建、编辑、归档、取消归档、（无快照时）删除账户；归档账户从录入入口隐藏 |
| 余额快照 | 能录入、覆盖、删除；同账户同日期幂等 |
| 持仓快照 | 能录入、覆盖、删除；多账户同 symbol 互不干扰 |
| 信用卡账单 | 能录入完整账单；能标记已还；未还账单计入负债 |
| 价格 / 汇率 | 能录入；持仓市值与跨币种聚合在有数据时正确，无数据时降级且 UI 提示 |
| 展示币种切换 | 任意视图切换币种立即生效，所有金额按规则重新折算 |
| 资产总览 | 净资产、按用途/机构/币种/市场分布数字与 SQL 验证结果一致 |
| 趋势分析 | 每日/月度/季度/年度截面取值符合 §6.5 与 §6.14 规则；任意日期单点查询与曲线查询数值一致 |
| 持仓分析 | 单持仓的成本、市值、浮动盈亏、盈亏率、仓位权重、资产权重均符合 §6.7 公式；汇总指标与按口径合并后的单条之和一致；缺价格/缺成本时按 §6.7 降级规则处理；两套成本口径（加权买入 / 净持有）切换正确 |
| 收益事件 | 能录入 dividend / interest / rebate / other；不修改任何快照与余额；累计收益事件与总盈亏符合 §6.11；按账户 / 标的 / 时间窗汇总数字一致 |
| 持仓交易 | 能录入 buy / sell；任何字段、任何状态均可 in-place 修改与删除；无 reversal 单；按 §6.15 回放结果与人工核对一致 |
| 已实现盈亏 | 卖出按 (sell_price − 加权买入成本) × quantity 计算并累计；卖出不改变加权买入成本；卖出手续费扣减已实现盈亏；符合 §6.16 |
| 公司动作 | split / merge 后 quantity 与加权买入成本按比例自动调整；**已实现盈亏不变**；rights 等价为系统生成的 buy 交易；符合 §6.17 |
| 账户转账 | 同币种 / 跨币种均能录入；总净资产前后不变；预期余额按 §6.18 双向更新；不写 fx_rates |
| 现金对账 | 任意账户的"预期余额 − 快照余额"差额与 §6.19 公式一致；超阈值时账户卡片高亮；"仅含已结算"切换正确 |
| 持仓对账 | 有交易历史的 (账户, 标的) 同时存在快照时，§6.20 差额展示正确；提供"以快照为准 / 以交易为准"两种修复路径 |
| 信用卡合并录入 | 业主可建一个"信用卡合计"账户聚合多卡账单；表结构与按卡录入完全一致 |
| 目标配置 | 能创建多套目标配置（kind ∈ currency / quote_currency / market / institution / asset_kind）；Σ target_pct = 100% 校验通过；漂移与再平衡建议符合 §6.10；超阈值时仪表盘漂移卡正确高亮 |
| 期间对比 | 任意两截面对比的期初 / 期末 / 变化 / 贡献占比与 SQL 验证一致；收益归因四桶（price / quantity / income / fx）符合 §6.12，且四桶之和等于期间净值变化 |
| 基准对比 | 三种对比口径（absolute / rebase=100 / excess）的曲线与 §6.13 公式一致；基准缺数据时自动右移起点并提示 |
| 标注 | 4 种 anchor_kind（date / account / symbol / position）均可创建、编辑、删除；在趋势 / 账户 / 持仓视图按锚点正确呈现；LLM 生成的标注标记 source = llm |
| 真实币种暴露 | 按真实计价币种聚合的暴露数字与 §6.9 公式一致；与按账户币种分布的差异在视图中可对照 |
| 持仓时长 | 跨清仓段时按"最近一次连续持有段"计算，符合 §6.8；从未清仓的持仓返回首次出现至今 |
| 建账模板 | 模板可批量创建账户骨架；删除模板不影响已创建账户；模板字段与账户字段对齐 |
| 多维聚合 | 任意 行 × 列 × 值 组合均能正确聚合 |
| 自然语言录入 | 给定 §8.1 示例输入，LLM 解析并预览结构化操作；业主确认后落库 |
| 自然语言查询 | §8.2 危险语句 100% 拒绝；正常查询返回结果与 SQL 一并展示 |
| 阶段性总结 | 能生成 month/quarter/year 总结并存档；总结基于系统预算指标，不直接读库 |
| 数据导出 | 全量导出能完整还原所有快照、账单、价格、汇率 |
| 备份恢复 | 能从最近一份 pg_dump 完整还原数据库 |
| 单点登录 | 未通过 Authelia 的请求被拒绝；通过的请求识别业主身份 |

---

## 12. 产品边界（明确不做）

| 不做项 | 理由 |
|---|---|
| 消费流水逐笔记账 | 仅指**日常消费**（餐饮、购物等）；信用卡按"还款日登记上周期合计消费"，不细到每笔。**持仓型账户的买卖交易**不属于本条，是支持的（见 §4.6） |
| 自动账单 / 银行 API 接入 | 跨机构成本与可靠性差；业主接受手工录入 |
| 持仓交易的批量月结 | 月结单一次出账多笔费用时，业主人工修订对应交易记录即可，不为此做批量录入视图（见 §4.6） |
| 多用户 / 权限 / 家庭共享 | 产品形态为单用户；多用户引入显著复杂度 |
| 预算 / 储蓄目标 / 提醒推送 | 与"事后回顾"的产品定位不符；注意"目标配置"（§4.15）是配置态的资产分布期望，不是流水侧的预算或储蓄目标 |
| 移动端原生应用 | 浏览器移动端能满足；维护原生 app 成本不匹配 |
| 实时行情自动抓取 | 不可靠且非必需；价格表支持手动维护或后续接入 |
| 收据 / 凭证附件存储 | 显著增加存储与备份成本；业主不需要 |
| 内置外发分享（公开链接、邮件报告） | 产品仅自托管自看，不外发 |

---

## 13. 附录

### 13.1 ISO 4217 货币代码示例

| 代码 | 名称 |
|---|---|
| `CNY` | 人民币 |
| `HKD` | 港币 |
| `USD` | 美元 |
| `JPY` | 日元 |
| `EUR` | 欧元 |
| `GBP` | 英镑 |
| `SGD` | 新加坡元 |
| `TWD` | 新台币 |

### 13.2 标的标识规范示例

| 市场 | 推荐写法 | 示例 |
|---|---|---|
| 美股 | 大写代码 | `GOOG`、`AAPL`、`NVDA` |
| 港股 | 4 位代码 + `.HK` | `0700.HK`、`0005.HK`、`9988.HK` |
| A 股 | 6 位代码 + `.SH` 或 `.SZ` | `601318.SH`、`000333.SZ` |
| 公募基金 | 6 位代码 + `.OF` | `161725.OF` |
| 加密 | 大写符号 | `BTC`、`ETH` |

业主可不遵循此规范（标的字段本身是自由文本），但同一只标的应保持一致写法以便聚合。

### 13.3 信用卡顶类目示例

业主可使用任意类目名称。常见参考：

`餐饮` / `网购` / `超市` / `交通` / `加油` / `医疗` / `娱乐` / `差旅` / `数码` / `服饰` / `教育` / `订阅服务` / `其他`

### 13.4 文档维护

- 任何对本文档的修改都视为产品规格变更，需同步更新 DRD 与实现
- 文档版本通过 Git 历史维护，不在文末列 changelog

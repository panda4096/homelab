# finbrain 控制台 · 设计原型

这是用 **Claude Design**（claude.ai/design）基于 [`finbrain/docs/PRD.md`](../docs/PRD.md) 做出的 finbrain Web 控制台**高保真、可点击原型**，连同它的完整设计系统一起导出（handoff bundle）。

> 来源：`api.anthropic.com/v1/design/h/xcd2t8RHi7BCr6Mmx3lMKw`（`finbrain-handoff.tar.gz`）
> 这是原型 / 视觉稿，**不是生产代码**。后续我们在此基础上继续优化，最终再用合适的技术栈（React/Vue/原生…）落地实现。

---

## 设计语言（一句话）

**暗色 · 鎏金 · 高密度 · Bloomberg 风的私人财富控制台**。冷墨色层级靠表面提亮 + 1px 发丝边表达高度；鎏金（`#C9A86A`）是稀缺资源，只用于品牌 / 单一主操作 / 净资产 hero。

- **涨跌约定可切换**：默认 **西式「绿涨红跌」**（`<html data-market-convention="western">`），可切回 CN「红涨绿跌」。组件读 `--gain` / `--loss`，不写死颜色。
- **默认展示币种 CNY**，顶栏可切 CNY / HKD / USD，全局联动。
- **字体**：Noto Sans SC（UI）+ IBM Plex Mono（所有数字 / 行情 / 代码，永远 tabular-nums + slashed-zero）；图标用 Lucide。
- 完整设计规范见 [`project/_ds/.../readme.md`](project/_ds/finbrain-9e1a0319-39ef-435e-8a6c-aa9d4f9a7d5a/readme.md)。

## 已实现内容

**原型 14 个主要路由全部可点击**（覆盖 PRD §7 的核心视图），没有占位页：

仪表盘 · 持仓总览 · 趋势分析 · 月度盘点向导 · 期间对比 · 多维聚合 / 透视表 · 持仓交易 · 收益事件 · 账户转账 · 账户列表 · 目标配置 · 现金对账 · 价格/汇率/基准 · 设置。

外加全局 **⌘K 自然语言录入 / 查询浮层**（Copilot），以及表单校验、筛选排序、币种 / 涨跌约定的全联动。

生产实现已在该原型基础上扩展独立入口：公司动作、技能 / API、审计日志；自然语言入口采用后端 skill catalog + audit，而非直接 SQL。

## 如何预览

原型用 React UMD + **Babel standalone 在浏览器内编译 JSX**，`.jsx` 是通过 XHR 加载的——所以**不能直接双击 `file://` 打开**（会被 CORS 拦），需要起一个本地静态服务器；同时需要联网（React / Babel / Lucide 走 CDN）。

```bash
cd finbrain/design/project
python3 -m http.server 8080
# 然后浏览器打开 http://localhost:8080/ ，点开「finbrain 控制台.html」
```

> 文件名带空格与中文，直接从目录列表点击最省事；或访问 URL 编码后的 `http://localhost:8080/finbrain%20%E6%8E%A7%E5%88%B6%E5%8F%B0.html`。

## 目录结构

```
finbrain/design/
├── README.md                  本文件（如何预览 + 概览）
├── HANDOFF.md                 Claude Design 原始导出说明
├── chats/chat1.md             设计过程对话记录（需求与最终落点的来源）
└── project/
    ├── finbrain 控制台.html    入口（壳 + 路由 + ⌘K 浮层）
    ├── app/                   各屏 React 组件 + 模拟数据（data.js）+ SVG 图表 + 图标
    │   ├── Shell / Dashboard / Holdings / TrendAnalysis / ReviewWizard …
    │   ├── Accounts / Transactions / Pivot / Compare / Copilot
    │   ├── EntryScreens（收益事件 / 转账）/ ManageScreens（目标/对账/行情/设置）
    │   ├── data.js · charts.jsx · icons.jsx · ui.jsx
    │   └── assets/logo/        鎏金 logo mark + wordmark
    ├── _ds/finbrain-.../       设计系统：tokens（颜色/字体/间距/投影/动效）+ 组件 + 编译产物
    └── uploads/                设计时的参考截图
```

## 与 PRD 的关系 / 下一步

- 这套原型是 [`docs/PRD.md`](../docs/PRD.md) 的视觉化落地；数据是 `app/data.js` 里的模拟数据。
- PRD 已按当前实现口径更新：基准用 `instruments.is_benchmark`，不设独立 `benchmarks` 表；Agent / NL 走后端 skill；公司动作 rights 在回放中等价 buy，不物化交易行。
- 之前对 PRD 的就绪度评审指出的几个缺口（首启/空态、样例数据集、视觉设计语言），**视觉设计语言这块已由本设计系统补齐**。
- 待优化方向（后续迭代）：补首次启动 / 空数据态、把模拟数据换成更贴近真实的一套、再决定生产实现技术栈与组件库。

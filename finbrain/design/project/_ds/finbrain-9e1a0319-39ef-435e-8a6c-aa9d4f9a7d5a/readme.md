# finbrain 设计系统

> 暗色 · 鎏金 · 私人财富 · 高密度数据。
> 一个为自托管个人资产管理工具 **finbrain** 打造的设计系统——把"知道我现在有多少钱、过去趋势怎样、配置如何"这件事，做得克制、精确、值得信赖。

---

## 1. 产品背景

**finbrain** 是一个个人资产**快照管理与回顾工具**（单用户、自托管）。业主长期同时使用多家境内外金融机构，资产分散在多种账户与币种。finbrain 让用户只登记两类**快照**——"某天某账户的余额"或"某天某账户持有某标的多少份"——系统按时间序列保留全部历史，并按账户 / 机构 / 币种 / 市场 / 标的 / 用途等多维度聚合展示资产构成与变化。

它**不是**流水记账（不记每笔消费）、**不是**自动账单聚合（不连银行 / 券商 API）、**不是**预算提醒系统、**不是**多用户产品、**不是**移动原生应用。核心是**资产盘点 + 历史趋势 + 多维聚合**，叠加自然语言录入 / 查询 / 阶段总结的 LLM 能力。

### 产品表面（本系统覆盖）
- **Web 控制台**（桌面，暗色，高密度，Bloomberg 风）—— 唯一表面。仪表盘、持仓总览、趋势分析、月度盘点向导、期间对比、多维聚合、现金对账、目标配置等（见 PRD §7）。

### 资料来源
- **PRD**：用户提供的《finbrain 产品需求文档》（§1–§13，含数据模型、计算规则、视图与交互、自然语言契约）。这是本系统所有界面与文案的权威输入。
- **无代码库 / 无 Figma**：本设计系统的视觉语言由 PRD 的产品语义 + 用户的方向选择（暗色私人财富、鎏金、高密度、红涨绿跌可切换）从零设计。若后续提供 finbrain 实际代码库或 Figma，应据此校准。

---

## 2. 内容基调（Content Fundamentals）

finbrain 面向**单一业主自己**，语气是**冷静、精确、内敛的私人管家**，不是面向大众的理财 App。

- **人称**：基本无人称。界面以**名词短语**和**指标名**为主（"净资产""持仓总市值""配置漂移"），不喊"你的资产"。文档 / 提示里指向用户时用"**业主**"这一中性第三人称（源自 PRD），不用"您 / 你"。
- **语言**：简体中文为主，金融术语与代码标识（`brokerage`、`GOOG`、`USD/CNY`、`quote_currency`）保留英文 / 符号原样。中英混排时数字与代码走等宽体。
- **大小写**：英文眉标（eyebrow）全大写 + 字距加宽（`NET WORTH`、`ALLOCATION`）；正文英文标识保持原大小写。
- **数字优先**：每个有意义的数字都带**口径**与**币种**，绝不裸奔。金额用千分位 + 制表数字 + 斜杠零；涨跌带方向符号与百分比。
- **克制**：不感叹、不营销、不 emoji、不"恭喜你赚了"。提示是事实陈述："预期 $312.40 · 快照 $237.62 · 差额 +$74.78"。建议是中性辅助："再平衡建议：cash 减配 ¥54,200"，从不替业主下决定。
- **诚实降级**：缺价格写"无价格"，缺汇率标"汇率缺失按 1:1"，从不假装有数据。
- **示例语气**
  - 标题："2026 年 6 月盘点" / "按真实计价币种分组"
  - 眉标：`RECONCILIATION` / `ALLOCATION DRIFT`
  - 提示："白线为目标占比 · 同账户同日期幂等覆盖 · 缺失值不阻塞，聚合时按规则降级"
  - 状态徽章："未结算""已还""无价格""草稿已自动保存"

---

## 3. 视觉基础（Visual Foundations）

### 色彩
- **墨色层级（ink surfaces）**：冷石墨带极弱暖意，从 `--surface-sunken #06080A` → `base #0B0D11` → `panel` → `card` → `raised` → `overlay`。**高度靠表面提亮 + 发丝边**表达，不是靠投影堆叠。
- **鎏金品牌色（champagne gold）**：`--gold-500 #C9A86A` 为主，hover 提亮 `--gold-bright`，按下加深 `--gold-deep`。金色是**稀缺资源**——只用于品牌、单一主操作、关键高亮、净资产 hero 数字的金属渐变文字。绝不大面积铺金。
- **涨跌双约定（可切换）**：默认 **CN「红涨绿跌」**（gain=红、loss=绿）；`<html data-market-convention="western">` 切到「绿涨红跌」。组件读 `--gain` / `--loss`，自动跟随，不写死颜色。
- **次级冷调** `--azure-500` 用于链接 / 信息 / 数据可视化的钢蓝；**语义色** success/warning/danger/info 独立于涨跌约定。
- **数据可视化**：8 色 categorical 调色板（gold / steel / emerald / plum / copper / teal / rose / slate），低饱和、克制、在墨色上耐看。

### 字体
- **Noto Sans SC**：UI 与中英文正文。
- **IBM Plex Mono**：所有数字 / 行情 / 代码 / 表格——**永远 tabular-nums + slashed-zero**（`.fb-num` / `[data-numeric]`）。
- **Noto Serif SC**：节制的编辑式点缀（极少用）。
- **字阶**：高密度桌面。表格主体 13px，正文 14px，最小微标签 11px；净资产 hero 可达 58–60px。字距：大数收紧 `-0.02em`，英文眉标放宽 `0.14em`。
- ⚠️ **字体替代说明**：本系统经 Google Fonts CDN 加载 Noto Sans SC / Noto Serif SC / IBM Plex Mono。若 finbrain 有自有字体（如思源 / HarmonyOS Sans / 商用等宽体），请提供字体文件，我会替换 `@font-face` 与 `styles.css` 的字体导入。

### 间距 · 圆角 · 投影
- **4px 基准网格**（`--space-1`=4 → `--space-16`=64）。
- **圆角克制**：卡片默认 `--radius-lg 10px`；控件 7px；徽章 5px。**高端 ≠ 圆润**，不用大圆角气泡。
- **投影深而安静** + **顶部 1px 内高光（sheen）**当作斜面。卡片 = `--elev-card`（浅投影 + sheen + 发丝边）。无紫色玻璃拟态，无彩色光晕。

### 背景 · 纹理 · 渐变
- 背景是**纯墨色平涂**，无大图、无插画、无重复纹理。可选极弱发丝网格（`--hairline-grid`，仅密集仪表盘）。
- 渐变只在三处：品牌金（logo / 主按钮）、净资产 hero 的**金属文字渐变**、图表的**面积填充淡出**。保护性 scrim 用于图表边缘内容压暗。

### 动效
- **measured，从不弹跳**。默认进入缓动 `--ease-out cubic-bezier(.16,1,.30,1)`；时长 140–340ms。
- 卡片 / 路由切换是 6px 上移 + 淡入（`fbFade`）。数字不做花哨动画。`prefers-reduced-motion` 时长归零。

### 状态
- **Hover**：中性面提亮（叠 5% 白）/ 主操作金色提亮；行 hover 切到 `--surface-raised`。
- **Press**：颜色加深 + 1px 下沉（`translateY(.5px)`）。
- **Focus**：金色聚焦环 `--ring-focus`（1px 实边 + 4px 柔光），从不裸 outline。
- **Disabled**：opacity 0.4–0.45，禁止指针。

### 卡片长相
深色卡面 `--surface-card` + 1px 发丝边 `--border-default` + 顶部 sheen + 浅投影；圆角 10px；可选眉标（mono 大写）/ 标题 / 右侧操作区。表格类卡片用 `padded={false}` 让表格满铺。

### 布局规则
固定左侧 232px 侧栏 + 56px 顶栏（sticky，半透明 + 背景模糊）。内容区最大宽约 1320px 居中。透明 + 模糊**只**用于 sticky 顶栏和浮层 scrim，别处不用。

---

## 4. 图标（Iconography）

- **图标系统**：[Lucide](https://lucide.dev)（线性、1.7 stroke、24 网格、圆角端点）。与"克制的私人财富"气质一致——细、冷、精确。
- **接入方式**：UI Kit 通过 CDN 加载 `lucide@0.460.0` UMD，并用 `ui_kits/finbrain/icons.jsx` 的 `<Icon name="…">` 组件**读取 `lucide.icons[Pascal]` 节点数据、渲染为真实 React SVG**（不做 DOM 替换，避免 React 协调冲突）。组件内可调 `size` / `stroke` / `color`。
- **常用图标**：`layout-dashboard` `trending-up` `chart-spline` `git-compare-arrows` `table-2` `list-checks` `arrow-left-right` `coins` `repeat` `landmark` `target` `scale` `candlestick-chart` `settings` `sparkles`（自然语言）`refresh-cw` `bell` `clipboard-check` `triangle-alert` `check` `info`。
- ⚠️ **替代说明**：finbrain 无自有图标资产，故采用 Lucide 作为最接近"细线 / 精确"气质的开源集。若有品牌图标集，请提供，我会替换。
- **Emoji / Unicode**：界面**不用 emoji**。涨跌用 `▲ / ▼` 三角符号 + 颜色；其余一律走 Lucide。
- **品牌标记**：`assets/logo/finbrain-mark.svg`（三段上行价值阶 + 智识节点，鎏金渐变）与 `finbrain-wordmark.svg`（标记 + 字标，"brain" 描金）。这是仅有的自绘矢量品牌资产。

---

## 5. 文件索引（Manifest）

### 根
- `styles.css` —— 全局入口，仅 `@import`（消费方只链这一个文件）。
- `readme.md` —— 本文件（设计指南 + 清单）。
- `SKILL.md` —— Agent Skill 封装（可下载到 Claude Code 使用）。
- `_ds_bundle.js` / `_ds_manifest.json` / `_adherence.oxlintrc.json` —— **编译器自动生成，勿手改**。

### tokens/
`colors.css`（墨色层级 / 鎏金 / 涨跌双约定 / 语义色 / 可视化 8 色）· `typography.css`（三字族 / 字阶 / 数字工具）· `spacing.css`（4px 网格 / 圆角 / 控件高度 / 布局）· `effects.css`（投影 / sheen / 渐变 / 模糊）· `motion.css`（时长 / 缓动）· `base.css`（暗色画布元素默认）。

### components/
- `components.css` —— 组件 class 钩子（随 styles.css 下发）。
- `core/` —— **Button · IconButton · Badge · Tag · Input · Select · Segmented · Switch · Card**
- `finance/` —— **CurrencyValue · DeltaValue · StatCard · AllocationBar · Sparkline**
- 每个组件 = `Name.jsx` + `Name.d.ts` + `Name.prompt.md`；每目录一个 `*.card.html`（Design System 卡片，挂载 `window.Finbrain_9e1a03`）。

### guidelines/cards/
Design System 标签页的规格卡（Colors / Type / Spacing / Brand）：墨色层级、文本色、鎏金、状态色、可视化、涨跌、字阶、数字排印、间距、圆角、高度投影、品牌标识。

### ui_kits/finbrain/
finbrain Web 控制台高保真可点击复刻：`index.html`（壳 + 路由 + 自然语言浮层）· `Shell.jsx`（侧栏 + 顶栏）· `Dashboard.jsx` · `Holdings.jsx` · `ReviewWizard.jsx` · `TrendAnalysis.jsx` · `charts.jsx`（SVG 图表）· `icons.jsx`（Lucide 渲染）· `data.js`（模拟数据）。已实现仪表盘 / 持仓总览 / 趋势分析 / 月度盘点四个核心界面；其余 §7 视图保留为占位说明。

### assets/logo/
`finbrain-mark.svg` · `finbrain-wordmark.svg`。

---

## 6. 给消费方的用法
链接 `styles.css` 一个文件即得全部 token、字体、组件 class。React 组件经编译产物 `_ds_bundle.js` 暴露在 `window.Finbrain_9e1a03`（如 `const { Button, CurrencyValue } = window.Finbrain_9e1a03`）。涨跌色切换：在 `<html>` 上加 `data-market-convention="western"`。强调色重皮：`data-accent="platinum" | "jade"`。

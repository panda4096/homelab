package httpapi

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/llm"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

const maxAgentToolCalls = 3

type agentStep struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Status   string `json:"status"`
	Detail   string `json:"detail,omitempty"`
	Skill    string `json:"skill,omitempty"`
	RowCount int    `json:"row_count,omitempty"`
}

type agentAction struct {
	Action string         `json:"action"`
	Skill  string         `json:"skill"`
	Params map[string]any `json:"params"`
	Reply  string         `json:"reply"`
	UINote string         `json:"ui_note"`
}

type agentObservation struct {
	Skill    string         `json:"skill"`
	Params   map[string]any `json:"params,omitempty"`
	RowCount int            `json:"row_count"`
	Result   any            `json:"result"`
}

type agentChatMessage struct {
	Role string `json:"role"`
	Text string `json:"text"`
}

type agentSkillOutcome struct {
	Skill    Skill
	Params   map[string]any
	Result   any
	RowCount int
	Affected []string
}

type agentLoopResult struct {
	Outcome *agentSkillOutcome
	Reply   string
	Steps   []agentStep
	Usage   agentUsage
}

type agentUsage struct {
	Calls                 int     `json:"calls,omitempty"`
	PromptTokens          int     `json:"prompt_tokens,omitempty"`
	PromptCacheHitTokens  int     `json:"prompt_cache_hit_tokens,omitempty"`
	PromptCacheMissTokens int     `json:"prompt_cache_miss_tokens,omitempty"`
	CompletionTokens      int     `json:"completion_tokens,omitempty"`
	ReasoningTokens       int     `json:"reasoning_tokens,omitempty"`
	TotalTokens           int     `json:"total_tokens,omitempty"`
	CostUSD               float64 `json:"cost_usd,omitempty"`
}

func (u agentUsage) Empty() bool {
	return u.Calls == 0 && u.TotalTokens == 0
}

func (u *agentUsage) Add(part llm.Usage) {
	if part.Empty() {
		return
	}
	u.Calls++
	u.PromptTokens += part.PromptTokens
	u.PromptCacheHitTokens += part.PromptCacheHitTokens
	u.PromptCacheMissTokens += part.PromptCacheMissTokens
	u.CompletionTokens += part.CompletionTokens
	u.ReasoningTokens += part.ReasoningTokens
	u.TotalTokens += part.TotalTokens
	u.CostUSD += estimateDeepSeekCostUSD(part)
}

func estimateDeepSeekCostUSD(u llm.Usage) float64 {
	rates, ok := deepSeekRatesPerMTokens[strings.TrimSpace(u.Model)]
	if !ok {
		return 0
	}
	hit := u.PromptCacheHitTokens
	miss := u.PromptCacheMissTokens
	if hit == 0 && miss == 0 {
		miss = u.PromptTokens
	}
	return (float64(hit)*rates.inputCacheHit + float64(miss)*rates.inputCacheMiss + float64(u.CompletionTokens)*rates.output) / 1_000_000
}

func normalizeAgentLLMOptions(model string, thinking bool) (llm.Options, error) {
	model = strings.TrimSpace(model)
	switch model {
	case "":
		return llm.Options{Thinking: thinking}, nil
	case "flash":
		model = "deepseek-v4-flash"
	case "pro":
		model = "deepseek-v4-pro"
	}
	switch model {
	case "deepseek-v4-flash", "deepseek-v4-pro":
		return llm.Options{Model: model, Thinking: thinking}, nil
	default:
		return llm.Options{}, errSkillInput{"model 只支持 deepseek-v4-flash 或 deepseek-v4-pro"}
	}
}

type deepSeekPrice struct {
	inputCacheHit  float64
	inputCacheMiss float64
	output         float64
}

var deepSeekRatesPerMTokens = map[string]deepSeekPrice{
	"deepseek-v4-flash": {inputCacheHit: 0.0028, inputCacheMiss: 0.14, output: 0.28},
	"deepseek-v4-pro":   {inputCacheHit: 0.003625, inputCacheMiss: 0.435, output: 0.87},
}

func (s *Server) agentToolContext(ctx context.Context) ([]byte, string) {
	type tool struct {
		Name        string          `json:"name"`
		Type        string          `json:"type"`
		Description string          `json:"description"`
		InputSchema json.RawMessage `json:"input_schema"`
	}
	tools := make([]tool, 0)
	for _, sk := range s.catalog() {
		if sk.Type == "read" || sk.Type == "draft" {
			tools = append(tools, tool{sk.Name, sk.Type, sk.Description, sk.InputSchema})
		}
	}
	toolsJSON, _ := json.Marshal(tools)

	acctCtx := ""
	if accts, err := s.store.ListAccounts(ctx, userIDFromContext(ctx), s.today()); err == nil {
		type accountLite struct {
			ID          int64  `json:"id"`
			Name        string `json:"name"`
			Institution string `json:"institution"`
			Kind        string `json:"kind"`
			Currency    string `json:"currency"`
		}
		lite := make([]accountLite, 0, len(accts))
		for _, a := range accts {
			lite = append(lite, accountLite{a.ID, a.Name, a.Institution, a.Kind, a.Currency})
		}
		b, _ := json.Marshal(lite)
		acctCtx = "\n账户解析上下文(JSON):" + string(b)
	}
	return toolsJSON, acctCtx
}

func (s *Server) nextAgentAction(ctx context.Context, question string, history []agentChatMessage, toolsJSON []byte, acctCtx string, observations []agentObservation, opts llm.Options) (agentAction, error) {
	system := "你是 finbrain Copilot 的轻量 agent 控制器。你只能选择已注册 skill，严禁输出 SQL、表名、join 或任意数据库查询。\n" +
		"每轮严格只返回一个 JSON 对象，不要 Markdown，不要代码块。\n" +
		"可返回两类 action:\n" +
		"1) {\"action\":\"run_skill\",\"skill\":\"工具名\",\"params\":{...},\"ui_note\":\"给用户看的简短进度说明\"}\n" +
		"2) {\"action\":\"final\",\"reply\":\"基于已完成 observation 的自然中文回答\"}\n" +
		"规则:\n" +
		"- 用户问资产/亏损/持仓/对账/价格/汇率/目标配置时，必须先 run_skill，拿到 observation 后再 final。\n" +
		"- 用户是在追问、反驳或要求纠正上一轮回答时，必须结合会话上下文回应；不要装作不知道上下文。\n" +
		"- 如果用户指出上一轮数据结论/排序/逻辑有错，且上一轮问题涉及资产、持仓、亏损、排名或配置，必须先 run_skill 重新查询相关数据；不要回答“请先查询数据”。\n" +
		"- 用户要记账/录入时，只能选择 draft skill；写库必须等待用户确认。\n" +
		"- observation 已足够回答时直接 final；只有确实缺关键数据时才再 run_skill，最多会执行 3 次工具。\n" +
		"- ui_note 是产品界面展示用的短句，例如“先查询当前持仓和浮动盈亏”，不要写内部推理链。\n" +
		"- final 回答要说人话，给出关键数字和口径；数据不足就明确说明，不要编造。\n" +
		"可用工具(JSON):" + string(toolsJSON) + acctCtx
	user := "今天是 " + s.today() + "。\n最近会话(JSON):" + promptJSON(compactHistory(history), 6000) + "\n用户问题:" + question + "\n已完成 observation(JSON):" + promptJSON(observations, 24000) + "\n请输出下一步 action JSON。"

	plannerOpts := opts
	plannerOpts.Thinking = false
	raw, err := s.llm.CompleteWithOptions(ctx, system, user, true, plannerOpts)
	if err != nil {
		return agentAction{}, err
	}
	action, err := parseAgentAction(raw)
	if err != nil {
		raw, err = s.llm.CompleteWithOptions(ctx, system, user+"\n\n上次输出不是合法 JSON。请重新输出且只输出一个完整 JSON 对象。", true, plannerOpts)
		if err != nil {
			return agentAction{}, err
		}
		action, err = parseAgentAction(raw)
		if err != nil {
			return agentAction{}, errSkillInput{"Copilot 没能解析下一步动作，请换个问法或稍后重试"}
		}
	}
	return normalizeAgentAction(action), nil
}

func parseAgentAction(raw string) (agentAction, error) {
	var action agentAction
	if err := json.Unmarshal([]byte(stripCodeFence(raw)), &action); err != nil {
		if extracted := extractJSONObject(stripCodeFence(raw)); extracted != "" {
			if retryErr := json.Unmarshal([]byte(extracted), &action); retryErr == nil {
				return action, nil
			}
		}
		return agentAction{}, err
	}
	return action, nil
}

func normalizeAgentAction(action agentAction) agentAction {
	action.Action = strings.ToLower(strings.TrimSpace(action.Action))
	action.Skill = strings.TrimSpace(action.Skill)
	action.Reply = strings.TrimSpace(action.Reply)
	action.UINote = strings.TrimSpace(action.UINote)
	if action.Action == "" {
		if action.Skill != "" {
			action.Action = "run_skill"
		} else {
			action.Action = "final"
		}
	}
	if action.Params == nil {
		action.Params = map[string]any{}
	}
	return action
}

func (s *Server) finalAgentReply(ctx context.Context, question string, history []agentChatMessage, observations []agentObservation, opts llm.Options) (string, error) {
	system, user := s.finalAgentPrompt(question, history, observations)
	raw, err := s.llm.CompleteWithOptions(ctx, system, user, false, opts)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(stripCodeFence(raw)), nil
}

func (s *Server) finalAgentReplyStream(ctx context.Context, question string, history []agentChatMessage, observations []agentObservation, opts llm.Options, emit func(string)) (string, error) {
	system, user := s.finalAgentPrompt(question, history, observations)
	raw, err := s.llm.StreamWithOptions(ctx, system, user, opts, func(delta llm.StreamDelta) error {
		if delta.Content != "" && emit != nil {
			emit(delta.Content)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(stripCodeFence(raw)), nil
}

func (s *Server) finalAgentPrompt(question string, history []agentChatMessage, observations []agentObservation) (string, string) {
	system := "你是 finbrain Copilot 的最终回答器。你已经拿到了后端 skill 查询结果，只能基于 observation 回答用户。\n" +
		"要求:中文、自然、简洁；优先回答用户真正问的问题；保留关键数字、币种和日期口径；不要提 JSON、字段名或内部实现；不要编造 observation 没有的数据。\n" +
		"纠错:如果用户指出上一轮逻辑不对，要先承认并明确修正；不要说“我不清楚你指什么”这种逃避上下文的话。\n" +
		"投资表述:不要把单期浮盈、收益率或当前盈利直接称为“稳健”“值得加仓”“优质”。稳健需要波动、回撤、估值、基本面、持有周期等证据支撑。\n" +
		"亏损问题:用户问“亏得最多/亏损最大”时，按最负的浮动盈亏金额回答，优先使用 top_losses；不要拿正收益率或 top_gains 当答案。\n" +
		"排版:输出 Markdown，但不要输出 HTML。避免整段糊成一段；用 2-4 个短段落、项目符号或小表格组织信息。\n" +
		"当问题涉及排名、对比、构成、盈亏、账户分布时，优先使用 Markdown 表格，通常不超过 6 行；必要时可用简短文本条形图辅助表达百分比。"
	user := "今天是 " + s.today() + "。\n最近会话(JSON):" + promptJSON(compactHistory(history), 6000) + "\n用户问题:" + question + "\nobservation(JSON):" + promptJSON(observations, 30000) + "\n请给出最终 Markdown 回答。"
	return system, user
}

func (o agentSkillOutcome) observation() agentObservation {
	return agentObservation{
		Skill:    o.Skill.Name,
		Params:   o.Params,
		RowCount: o.RowCount,
		Result:   compactAgentResult(o.Result),
	}
}

func compactAgentResult(result any) any {
	switch v := result.(type) {
	case store.Valuation:
		positions := v.PositionGroups
		if len(positions) == 0 {
			positions = v.Positions
		}
		return map[string]any{
			"as_of":             v.AsOf,
			"display_currency":  v.DisplayCurrency,
			"fx_mode":           v.FxMode,
			"net_worth":         v.NetWorth,
			"total_assets":      v.TotalAssets,
			"total_liabilities": v.TotalLiabilities,
			"cash_value":        v.CashValue,
			"position_value":    v.PositionValue,
			"position_cost":     v.PositionCost,
			"position_net_cost": v.PositionNetCost,
			"unrealized_pl":     v.UnrealizedPL,
			"unrealized_pl_pct": v.UnrealizedPLPct,
			"realized_pl_ytd":   v.RealizedPLYtd,
			"income_ytd":        v.IncomeYtd,
			"top_positions":     compactPositionsBy(positions, "weight", 8),
			"top_losses":        compactPositionsBy(positions, "loss", 8),
			"top_gains":         compactPositionsBy(positions, "gain", 5),
			"allocations":       v.Allocations,
			"warnings":          v.Warnings,
		}
	case []store.ValuationPosition:
		return map[string]any{
			"count":         len(v),
			"top_positions": compactPositionsBy(v, "weight", 10),
			"top_losses":    compactPositionsBy(v, "loss", 10),
			"top_gains":     compactPositionsBy(v, "gain", 6),
			"missing_price": compactMissingPricePositions(v, 10),
		}
	case store.PriceList:
		return compactPriceList(v)
	case store.FxRateList:
		return compactFxRateList(v)
	default:
		return result
	}
}

func compactPositionsBy(rows []store.ValuationPosition, mode string, limit int) []map[string]any {
	items := append([]store.ValuationPosition(nil), rows...)
	sort.SliceStable(items, func(i, j int) bool {
		switch mode {
		case "loss":
			return decimalValue(ptrString(items[i].UnrealizedPLDisplay)) < decimalValue(ptrString(items[j].UnrealizedPLDisplay))
		case "gain":
			return decimalValue(ptrString(items[i].UnrealizedPLDisplay)) > decimalValue(ptrString(items[j].UnrealizedPLDisplay))
		default:
			return decimalValue(ptrString(items[i].Weight)) > decimalValue(ptrString(items[j].Weight))
		}
	})
	out := make([]map[string]any, 0, minInt(limit, len(items)))
	for _, p := range items {
		if len(out) >= limit {
			break
		}
		if mode == "loss" && decimalValue(ptrString(p.UnrealizedPLDisplay)) >= 0 {
			continue
		}
		if mode == "gain" && decimalValue(ptrString(p.UnrealizedPLDisplay)) <= 0 {
			continue
		}
		out = append(out, compactPosition(p))
	}
	return out
}

func compactMissingPricePositions(rows []store.ValuationPosition, limit int) []map[string]any {
	out := make([]map[string]any, 0)
	for _, p := range rows {
		if len(out) >= limit {
			break
		}
		if p.MissingPrice {
			out = append(out, compactPosition(p))
		}
	}
	return out
}

func compactPosition(p store.ValuationPosition) map[string]any {
	return map[string]any{
		"symbol":                 p.Symbol,
		"display_name":           ptrString(p.DisplayName),
		"institution":            p.Institution,
		"account_name":           p.AccountName,
		"quantity":               trimDecimal(p.Quantity),
		"market_value_display":   ptrString(p.MarketValueDisplay),
		"cost_value_display":     ptrString(p.CostValueDisplay),
		"net_cost_value_display": ptrString(p.NetCostValueDisplay),
		"unrealized_pl_display":  ptrString(p.UnrealizedPLDisplay),
		"unrealized_pl_pct":      ptrString(p.UnrealizedPLPct),
		"realized_pl_display":    ptrString(p.RealizedPLDisplay),
		"weight":                 ptrString(p.Weight),
		"missing_price":          p.MissingPrice,
		"fx_fallback":            p.FxFallback,
	}
}

func compactPriceList(list store.PriceList) any {
	items := append([]store.Price(nil), list.Items...)
	sort.SliceStable(items, func(i, j int) bool { return items[i].PriceDate < items[j].PriceDate })
	if len(items) > 20 {
		items = append(items[:10], items[len(items)-10:]...)
	}
	return map[string]any{"count": len(list.Items), "truncated": list.Truncated, "items": items}
}

func compactFxRateList(list store.FxRateList) any {
	items := append([]store.FxRate(nil), list.Items...)
	sort.SliceStable(items, func(i, j int) bool { return items[i].RateDate < items[j].RateDate })
	if len(items) > 20 {
		items = append(items[:10], items[len(items)-10:]...)
	}
	return map[string]any{"count": len(list.Items), "truncated": list.Truncated, "items": items}
}

func promptJSON(v any, maxBytes int) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "null"
	}
	if len(b) <= maxBytes {
		return string(b)
	}
	return string(b[:maxBytes]) + `"...TRUNCATED"}`
}

func sanitizeAgentHistory(history []agentChatMessage) []agentChatMessage {
	if len(history) > 8 {
		history = history[len(history)-8:]
	}
	out := make([]agentChatMessage, 0, len(history))
	for _, m := range history {
		role := strings.TrimSpace(strings.ToLower(m.Role))
		if role != "user" && role != "assistant" {
			continue
		}
		text := strings.TrimSpace(m.Text)
		if text == "" {
			continue
		}
		out = append(out, agentChatMessage{Role: role, Text: shortText(text, 900)})
	}
	return out
}

func compactHistory(history []agentChatMessage) []agentChatMessage {
	return sanitizeAgentHistory(history)
}

func extractJSONObject(raw string) string {
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start < 0 || end <= start {
		return ""
	}
	return raw[start : end+1]
}

func shouldRefreshHoldingsForCorrection(question string, history []agentChatMessage) bool {
	q := strings.ToLower(strings.TrimSpace(question))
	if q == "" || !containsAny(q, []string{"不对", "错", "错误", "答非所问", "逻辑", "不是", "看错", "纠正"}) {
		return false
	}
	context := q
	for _, m := range history {
		context += "\n" + strings.ToLower(m.Text)
	}
	return containsAny(context, []string{
		"持仓", "亏", "亏损", "浮亏", "浮盈", "盈利", "收益", "权重", "加仓", "减仓", "资产", "配置", "排名", "最多", "最大",
	})
}

func containsAny(s string, needles []string) bool {
	for _, needle := range needles {
		if strings.Contains(s, needle) {
			return true
		}
	}
	return false
}

func shortText(s string, max int) string {
	s = strings.TrimSpace(s)
	if len([]rune(s)) <= max {
		return s
	}
	r := []rune(s)
	return string(r[:max]) + "..."
}

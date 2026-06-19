package httpapi

import (
	"context"
	"encoding/json"
	"sort"
	"strconv"
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
	case "flash":
		model = "deepseek-v4-flash"
	case "pro":
		model = "deepseek-v4-pro"
	}
	if len([]rune(model)) > 100 {
		return llm.Options{}, errSkillInput{"model 名称过长"}
	}
	// Empty model → the active provider's configured default (the llm client falls back to
	// c.model). Any non-empty model is passed through unchecked: with per-user multi-provider
	// configs the upstream provider — not this gate — decides which models it serves. (thinking is
	// DeepSeek-only and ignored by the client for other models/providers.)
	return llm.Options{Model: model, Thinking: thinking}, nil
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

func (s *Server) agentNativeToolContext() ([]llm.Tool, map[string]string) {
	tools := make([]llm.Tool, 0)
	wireToSkill := map[string]string{}
	for _, sk := range s.catalog() {
		if sk.Type != "read" && sk.Type != "draft" {
			continue
		}
		wireName := agentToolWireName(sk.Name)
		// Guard against sanitiser collisions (e.g. "a.b" and "a-b" both -> "a_b"): keep wire
		// names unique so every tool stays callable and maps back to exactly one skill.
		if _, taken := wireToSkill[wireName]; taken {
			base := wireName
			for i := 2; ; i++ {
				wireName = base + "_" + strconv.Itoa(i)
				if _, taken := wireToSkill[wireName]; !taken {
					break
				}
			}
		}
		tools = append(tools, llm.Tool{Name: wireName, Description: sk.Description, InputSchema: sk.InputSchema})
		wireToSkill[wireName] = sk.Name
	}
	return tools, wireToSkill
}

func agentToolWireName(name string) string {
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_', r == '-':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	if b.Len() == 0 {
		return "tool"
	}
	return b.String()
}

func (s *Server) agentAccountContext(ctx context.Context) string {
	acctCtx := ""
	if accts, err := s.store.ListAccounts(ctx, userIDFromContext(ctx), s.today(ctx)); err == nil {
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
	return acctCtx
}

func (s *Server) agentSystemPrompt(ctx context.Context) string {
	return "你是 finbrain Copilot。你用自然中文帮助用户理解个人资产、持仓、对账、行情和记账草稿。\n" +
		"硬约束:\n" +
		"- 需要数据时必须调用已注册的后端工具，不能编造数字，不能输出 SQL、表名、join 或任意数据库查询。\n" +
		"- 用户要记账/录入时只能生成草稿；真正写入必须等待用户确认。\n" +
		"- 工具结果可能是 JSON；回答用户时不要暴露工具名、字段名、tool call、skill 等内部实现。\n" +
		"- 如果用户是在追问、反驳或纠正上一轮回答，必须结合会话上下文；涉及资产、持仓、亏损、排名、配置时优先重新查询数据。\n" +
		"- 用户问“亏得最多/亏损最大”时，按最负的浮动盈亏金额回答，不要把正收益率或 top_gains 当亏损答案。\n" +
		"- 不要把单期浮盈、收益率或当前盈利直接称为“稳健”“值得加仓”“优质”；这类判断需要波动、回撤、估值、基本面和周期证据。\n" +
		"回答风格:\n" +
		"- 中文、自然、简洁，优先回答用户真正问的问题。\n" +
		"- 保留关键数字、币种、日期口径；数据不足要明确说明。\n" +
		"- 输出 Markdown，不输出 HTML；避免整段糊成一段，用短段落、项目符号或小表格组织。\n" +
		"- 涉及排名、对比、构成、盈亏、账户分布时优先用 Markdown 表格，通常不超过 6 行。\n" +
		s.agentAccountContext(ctx)
}

func (s *Server) agentInitialMessages(ctx context.Context, question string, history []agentChatMessage) []llm.Message {
	messages := make([]llm.Message, 0, len(history)+1)
	for _, h := range compactHistory(history) {
		role := strings.ToLower(strings.TrimSpace(h.Role))
		if role != "assistant" {
			role = "user"
		}
		messages = append(messages, llm.Message{Role: role, Content: h.Text})
	}
	messages = append(messages, llm.Message{
		Role:    "user",
		Content: "今天是 " + s.today(ctx) + "。\n请回答这个问题；如果需要数据，先查询再回答。\n用户问题:" + question,
	})
	return messages
}

func parseToolCallArgs(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var params map[string]any
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, errSkillInput{"Copilot 生成的工具参数不是合法 JSON，请换个问法或稍后重试"}
	}
	if params == nil {
		params = map[string]any{}
	}
	return params, nil
}

func toolObservationMessage(callID string, observation agentObservation) llm.Message {
	return llm.Message{Role: "tool", ToolCallID: callID, Content: promptJSON(observation, 24000)}
}

func finalInstructionMessage() llm.Message {
	return llm.Message{Role: "user", Content: "请停止继续查询，基于以上上下文和已返回的数据，直接给出最终 Markdown 回答。"}
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

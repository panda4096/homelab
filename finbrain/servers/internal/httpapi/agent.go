package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	llmpkg "github.com/panda4096/homelab/finbrain/servers/internal/llm"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

// Skill is one registered capability. Agents/LLMs may ONLY pick a skill name and
// fill params against InputSchema — never SQL, table names, joins, or where
// clauses. The backend owns the DB connection, business 口径, decimal/date/ccy
// handling, row caps, and audit. (PRD §8 agent contract.)
type Skill struct {
	Name                 string          `json:"name"`
	Type                 string          `json:"type"` // read | draft | write
	Description          string          `json:"description"`
	InputSchema          json.RawMessage `json:"input_schema"`
	Permission           string          `json:"permission"`
	RequiresConfirmation bool            `json:"requires_confirmation"`
	MaxRows              int             `json:"max_rows,omitempty"`
	AuditEnabled         bool            `json:"audit_enabled"`
	// run executes the skill. result is JSON-serialisable; rowCount feeds the
	// audit; affected lists written entity refs (write skills only).
	run func(s *Server, ctx context.Context, a skillArgs) (result any, rowCount int, affected []string, err error) `json:"-"`
}

type skillArgs map[string]any

func argStr(a skillArgs, k string) string {
	if v, ok := a[k]; ok {
		if s, ok := v.(string); ok {
			return strings.TrimSpace(s)
		}
	}
	return ""
}
func argInt(a skillArgs, k string) int64 {
	switch n := a[k].(type) {
	case float64:
		return int64(n)
	case string:
		x, _ := strconv.ParseInt(strings.TrimSpace(n), 10, 64)
		return x
	}
	return 0
}
func argBool(a skillArgs, k string) bool { v, _ := a[k].(bool); return v }

// errSkillInput is a caller (422) error from a skill — bad params / business rule.
type errSkillInput struct{ msg string }

func (e errSkillInput) Error() string { return e.msg }

func (s *Server) resolveDisplay(ctx context.Context, a skillArgs) (string, string) {
	disp := strings.ToUpper(argStr(a, "display_currency"))
	fxMode := argStr(a, "fx_mode")
	if disp == "" || fxMode == "" {
		if prefs, err := s.store.GetPreferences(ctx, userIDFromContext(ctx)); err == nil {
			if disp == "" {
				disp = prefs.DisplayCurrency
			}
			if fxMode == "" {
				fxMode = prefs.FxMode
			}
		}
	}
	if disp == "" {
		disp = "CNY"
	}
	if fxMode == "" {
		fxMode = "current"
	}
	return disp, fxMode
}

func (s *Server) asOf(ctx context.Context, a skillArgs) (string, error) {
	d := argStr(a, "as_of")
	if d == "" {
		return s.today(ctx), nil
	}
	if _, err := domain.ParseDate(d, s.location(ctx)); err != nil {
		return "", errSkillInput{"as_of must be YYYY-MM-DD"}
	}
	return d, nil
}

// catalog is built once per Server (skills are stateless; handlers close over s).
func (s *Server) catalog() []Skill { return append(readSkills(), writeSkills()...) }

func (s *Server) findSkill(name string) (Skill, bool) {
	for _, sk := range s.catalog() {
		if sk.Name == name {
			return sk, true
		}
	}
	return Skill{}, false
}

func sch(s string) json.RawMessage { return json.RawMessage(s) }

const noArgs = `{"type":"object","properties":{},"additionalProperties":false}`

func readSkills() []Skill {
	disp := `"display_currency":{"type":"string","enum":["CNY","HKD","USD"]},"fx_mode":{"type":"string","enum":["current","historical"]},"as_of":{"type":"string","description":"YYYY-MM-DD, default today"}`
	return []Skill{
		{
			Name: "portfolio.getSnapshot", Type: "read", Permission: "read", AuditEnabled: true, MaxRows: 5000,
			Description: "净资产快照:总资产/负债/净值、现金与持仓总值、多维配置占比(按用途/币种/真实计价币种/机构)。",
			InputSchema: sch(`{"type":"object","properties":{` + disp + `},"additionalProperties":false}`),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				onDate, err := s.asOf(ctx, a)
				if err != nil {
					return nil, 0, nil, err
				}
				d, fx := s.resolveDisplay(ctx, a)
				v, err := s.store.GetValuation(ctx, userIDFromContext(ctx), onDate, d, fx, s.today(ctx))
				if err != nil {
					return nil, 0, nil, err
				}
				return v, len(v.Positions), nil, nil
			},
		},
		{
			Name: "holdings.listCurrent", Type: "read", Permission: "read", AuditEnabled: true, MaxRows: 5000,
			Description: "当前全部持仓(按标的跨账户合并),含市值、浮动盈亏、权重;无价格的标的单列。",
			InputSchema: sch(`{"type":"object","properties":{` + disp + `},"additionalProperties":false}`),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				onDate, err := s.asOf(ctx, a)
				if err != nil {
					return nil, 0, nil, err
				}
				d, fx := s.resolveDisplay(ctx, a)
				v, err := s.store.GetValuation(ctx, userIDFromContext(ctx), onDate, d, fx, s.today(ctx))
				if err != nil {
					return nil, 0, nil, err
				}
				return v.PositionGroups, len(v.PositionGroups), nil, nil
			},
		},
		{
			Name: "holdings.getAccountPositions", Type: "read", Permission: "read", AuditEnabled: true, MaxRows: 5000,
			Description: "某账户在某日(默认今天)的持仓快照清单(取最近一条)。",
			InputSchema: sch(`{"type":"object","properties":{"account_id":{"type":"integer"},"as_of":{"type":"string"}},"required":["account_id"],"additionalProperties":false}`),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				onDate, err := s.asOf(ctx, a)
				if err != nil {
					return nil, 0, nil, err
				}
				id := argInt(a, "account_id")
				if id == 0 {
					return nil, 0, nil, errSkillInput{"account_id is required"}
				}
				rows, err := s.store.ListAccountPositions(ctx, userIDFromContext(ctx), id, onDate)
				if err != nil {
					return nil, 0, nil, err
				}
				return rows, len(rows), nil, nil
			},
		},
		{
			Name: "accounts.list", Type: "read", Permission: "read", AuditEnabled: true, MaxRows: 5000,
			Description: "全部账户(含机构名、币种、类型、当前余额)。",
			InputSchema: sch(noArgs),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				rows, err := s.store.ListAccounts(ctx, userIDFromContext(ctx), s.today(ctx))
				return rows, len(rows), nil, err
			},
		},
		{
			Name: "accounts.getDetail", Type: "read", Permission: "read", AuditEnabled: true,
			Description: "单个账户详情。",
			InputSchema: sch(`{"type":"object","properties":{"account_id":{"type":"integer"}},"required":["account_id"],"additionalProperties":false}`),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				id := argInt(a, "account_id")
				if id == 0 {
					return nil, 0, nil, errSkillInput{"account_id is required"}
				}
				acct, err := s.store.GetAccount(ctx, userIDFromContext(ctx), id, s.today(ctx))
				if errors.Is(err, store.ErrNotFound) {
					return nil, 0, nil, errSkillInput{"account not found"}
				}
				return acct, 1, nil, err
			},
		},
		{
			Name: "institutions.list", Type: "read", Permission: "read", AuditEnabled: true, MaxRows: 5000,
			Description: "全部机构(含账户数)。",
			InputSchema: sch(noArgs),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				rows, err := s.store.ListInstitutions(ctx, userIDFromContext(ctx))
				return rows, len(rows), nil, err
			},
		},
		{
			Name: "marketData.getInstrumentHistory", Type: "read", Permission: "read", AuditEnabled: true, MaxRows: 5000,
			Description: "某标的的历史价格序列(可按日期范围)。",
			InputSchema: sch(`{"type":"object","properties":{"symbol":{"type":"string"},"date_from":{"type":"string"},"date_to":{"type":"string"}},"required":["symbol"],"additionalProperties":false}`),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				sym := strings.ToUpper(argStr(a, "symbol"))
				if sym == "" {
					return nil, 0, nil, errSkillInput{"symbol is required"}
				}
				list, err := s.store.ListPrices(ctx, store.PriceFilter{Symbol: sym, DateFrom: argStr(a, "date_from"), DateTo: argStr(a, "date_to"), Sort: "date_asc"})
				if err != nil {
					return nil, 0, nil, err
				}
				return list, len(list.Items), nil, nil
			},
		},
		{
			Name: "fx.getRateHistory", Type: "read", Permission: "read", AuditEnabled: true, MaxRows: 5000,
			Description: "某币种对的历史汇率序列。",
			InputSchema: sch(`{"type":"object","properties":{"base":{"type":"string"},"quote":{"type":"string"},"date_from":{"type":"string"},"date_to":{"type":"string"}},"required":["base","quote"],"additionalProperties":false}`),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				base, quote := strings.ToUpper(argStr(a, "base")), strings.ToUpper(argStr(a, "quote"))
				if base == "" || quote == "" {
					return nil, 0, nil, errSkillInput{"base and quote are required"}
				}
				list, err := s.store.ListFxRates(ctx, store.FxRateFilter{BaseCurrency: base, QuoteCurrency: quote, DateFrom: argStr(a, "date_from"), DateTo: argStr(a, "date_to"), Sort: "date_asc"})
				if err != nil {
					return nil, 0, nil, err
				}
				return list, len(list.Items), nil, nil
			},
		},
		{
			Name: "recon.getAccountDiff", Type: "read", Permission: "read", AuditEnabled: true,
			Description: "某账户的现金对账:预期余额、最新快照、差额、事件流、持仓回放差额(§6.19/6.20)。",
			InputSchema: sch(`{"type":"object","properties":{"account_id":{"type":"integer"},"as_of":{"type":"string"},"settled_only":{"type":"boolean"}},"required":["account_id"],"additionalProperties":false}`),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				onDate, err := s.asOf(ctx, a)
				if err != nil {
					return nil, 0, nil, err
				}
				id := argInt(a, "account_id")
				if id == 0 {
					return nil, 0, nil, errSkillInput{"account_id is required"}
				}
				res, err := s.store.ReconcileAccount(ctx, userIDFromContext(ctx), id, onDate, argBool(a, "settled_only"))
				if errors.Is(err, store.ErrNotFound) {
					return nil, 0, nil, errSkillInput{"account not found"}
				}
				return res, len(res.Events), nil, err
			},
		},
		{
			Name: "compare.getPeriodAttribution", Type: "read", Permission: "read", AuditEnabled: true,
			Description: "两个日期之间净资产变化的四桶归因(价格/数量/收益/汇率)。",
			InputSchema: sch(`{"type":"object","properties":{"from":{"type":"string"},"to":{"type":"string"},` + disp + `},"required":["from","to"],"additionalProperties":false}`),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				from, to := argStr(a, "from"), argStr(a, "to")
				if _, err := domain.ParseDate(from, s.location(ctx)); err != nil {
					return nil, 0, nil, errSkillInput{"from must be YYYY-MM-DD"}
				}
				if _, err := domain.ParseDate(to, s.location(ctx)); err != nil {
					return nil, 0, nil, errSkillInput{"to must be YYYY-MM-DD"}
				}
				d, fx := s.resolveDisplay(ctx, a)
				res, err := s.store.PeriodAttribution(ctx, userIDFromContext(ctx), from, to, d, fx)
				return res, 1, nil, err
			},
		},
		{
			Name: "targets.getDrift", Type: "read", Permission: "read", AuditEnabled: true,
			Description: "目标配置漂移与再平衡建议;不传 set_id 则返回全部目标集。",
			InputSchema: sch(`{"type":"object","properties":{"set_id":{"type":"integer"},"as_of":{"type":"string"},` + disp + `},"additionalProperties":false}`),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				onDate, err := s.asOf(ctx, a)
				if err != nil {
					return nil, 0, nil, err
				}
				d, fx := s.resolveDisplay(ctx, a)
				if id := argInt(a, "set_id"); id != 0 {
					set, err := s.store.EvaluateDrift(ctx, userIDFromContext(ctx), id, onDate, d, fx)
					if errors.Is(err, store.ErrNotFound) {
						return nil, 0, nil, errSkillInput{"target set not found"}
					}
					return set, 1, nil, err
				}
				sets, err := s.store.ListAllocationTargetSets(ctx, userIDFromContext(ctx))
				if err != nil {
					return nil, 0, nil, err
				}
				out := make([]any, 0, len(sets))
				for _, set := range sets {
					ev, err := s.store.EvaluateDrift(ctx, userIDFromContext(ctx), set.ID, onDate, d, fx)
					if err != nil {
						return nil, 0, nil, err
					}
					out = append(out, ev)
				}
				return out, len(out), nil, nil
			},
		},
	}
}

// ---- HTTP: /agent/skills, /agent/run, /agent/apply ----

func (s *Server) listAgentSkills(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"skills": s.catalog()})
}

type agentRunBody struct {
	Skill    string         `json:"skill"`
	Params   map[string]any `json:"params"`
	Confirm  bool           `json:"confirm"`
	NLSource string         `json:"nl_source"`
}

func (s *Server) runAgentSkill(w http.ResponseWriter, r *http.Request)   { s.execSkill(w, r, false) }
func (s *Server) applyAgentSkill(w http.ResponseWriter, r *http.Request) { s.execSkill(w, r, true) }

func (s *Server) execSkill(w http.ResponseWriter, r *http.Request, apply bool) {
	var body agentRunBody
	if !decodeJSON(w, r, &body) {
		return
	}
	body.Skill = strings.TrimSpace(body.Skill)
	sk, ok := s.findSkill(body.Skill)
	if !ok {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "未知 skill: "+body.Skill)
		return
	}
	// route guard: write skills only via /agent/apply; read/draft only via /agent/run
	if apply && sk.Type != "write" {
		writeError(w, http.StatusBadRequest, "validation_failed", "该 skill 不是写操作,请用 /agent/run")
		return
	}
	if !apply && sk.Type == "write" {
		writeError(w, http.StatusBadRequest, "validation_failed", "写操作必须经 /agent/apply 确认")
		return
	}
	if sk.Type == "write" && sk.RequiresConfirmation && !body.Confirm {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "该写操作需 confirm=true")
		return
	}
	if sk.Type == "write" && callerScopes(r) != "read_write" {
		writeError(w, http.StatusForbidden, "unauthorized", "该 API Key 无写权限(scopes=read)")
		return
	}
	if body.Params == nil {
		body.Params = map[string]any{}
	}
	result, rowCount, affected, err := s.runAndAudit(r, sk, body.Params, body.Confirm, body.NLSource)
	if err != nil {
		var bad errSkillInput
		if errors.As(err, &bad) {
			writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", bad.Error())
			return
		}
		writeStorageError(w, r, err)
		return
	}
	out := map[string]any{"skill": sk.Name, "type": sk.Type, "result": result, "row_count": rowCount}
	if reply := narrateSkillResult(sk, body.Params, result, rowCount); reply != "" {
		out["reply"] = reply
	}
	if len(affected) > 0 {
		out["affected_entities"] = affected
	}
	writeJSON(w, http.StatusOK, out)
}

// runAndAudit executes a skill and records the audit row (shared by /run, /apply, /plan).
func (s *Server) runAndAudit(r *http.Request, sk Skill, params skillArgs, confirm bool, nl string) (any, int, []string, error) {
	result, rowCount, affected, err := sk.run(s, r.Context(), params)
	s.recordSkillAudit(r, sk, agentRunBody{Skill: sk.Name, Params: params, Confirm: confirm, NLSource: nl}, rowCount, affected, err)
	return result, rowCount, affected, err
}

// planAgent runs a bounded skill-based agent loop. The model can only choose
// registered read/draft skills; the backend executes them and feeds observations
// back to the model for the final answer. Write/apply is never auto-run: a draft
// result carries requires_confirmation, and the UI confirms via /agent/apply.
func (s *Server) planAgent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text     string             `json:"text"`
		Model    string             `json:"model"`
		Thinking bool               `json:"thinking"`
		History  []agentChatMessage `json:"history"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	body.Text = strings.TrimSpace(body.Text)
	if body.Text == "" {
		writeError(w, http.StatusBadRequest, "validation_failed", "text is required")
		return
	}
	if !s.llm.Configured() {
		writeError(w, http.StatusServiceUnavailable, "llm_unavailable", "未配置 LLM，Copilot 不可用")
		return
	}
	llmOpts, err := normalizeAgentLLMOptions(body.Model, body.Thinking)
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", err.Error())
		return
	}
	result, err := s.runAgentLoop(r, body.Text, sanitizeAgentHistory(body.History), llmOpts, nil, nil)
	if err != nil {
		s.writeAgentError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, result.response())
}

func (s *Server) streamAgent(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text     string             `json:"text"`
		Model    string             `json:"model"`
		Thinking bool               `json:"thinking"`
		History  []agentChatMessage `json:"history"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	body.Text = strings.TrimSpace(body.Text)
	if body.Text == "" {
		writeError(w, http.StatusBadRequest, "validation_failed", "text is required")
		return
	}
	if !s.llm.Configured() {
		writeError(w, http.StatusServiceUnavailable, "llm_unavailable", "未配置 LLM，Copilot 不可用")
		return
	}
	llmOpts, err := normalizeAgentLLMOptions(body.Model, body.Thinking)
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", err.Error())
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "internal", "当前 HTTP 连接不支持 SSE")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	result, err := s.runAgentLoop(
		r,
		body.Text,
		sanitizeAgentHistory(body.History),
		llmOpts,
		func(step agentStep) {
			writeSSE(w, flusher, "phase", step)
		},
		func(text string) {
			if text != "" {
				writeSSE(w, flusher, "answer_delta", map[string]string{"text": text})
			}
		},
	)
	if err != nil {
		writeSSE(w, flusher, "error", map[string]any{"message": agentErrorMessage(err), "code": agentErrorCode(err)})
		return
	}
	writeSSE(w, flusher, "final", result.response())
	writeSSE(w, flusher, "done", map[string]bool{"ok": true})
}

func (s *Server) runAgentLoop(r *http.Request, question string, history []agentChatMessage, llmOpts llmpkg.Options, emit func(agentStep), emitAnswer func(string)) (agentLoopResult, error) {
	toolsJSON, acctCtx := s.agentToolContext(r.Context())
	steps := []agentStep{{Key: "understand", Label: "理解问题", Status: "done", Detail: shortText(question, 42)}}
	emitAgentStep(emit, steps[0])
	observations := []agentObservation{}
	var last *agentSkillOutcome
	usage := agentUsage{}
	prevOnUsage := llmOpts.OnUsage
	llmOpts.OnUsage = func(part llmpkg.Usage) {
		usage.Add(part)
		if prevOnUsage != nil {
			prevOnUsage(part)
		}
	}
	finish := func(result agentLoopResult) agentLoopResult {
		result.Usage = usage
		return result
	}

	for turn := 0; turn <= maxAgentToolCalls; turn++ {
		planKey := "plan_" + strconv.Itoa(turn+1)
		planIdx := len(steps)
		step := agentStep{Key: planKey, Label: "规划下一步", Status: "pending", Detail: "正在判断需要查询哪些数据"}
		steps = append(steps, step)
		emitAgentStep(emit, step)

		if turn == 0 && shouldRefreshHoldingsForCorrection(question, history) {
			action := agentAction{
				Action: "run_skill",
				Skill:  "holdings.listCurrent",
				Params: map[string]any{},
				UINote: "重新查询当前持仓和浮动盈亏，核实数据",
			}
			steps[planIdx] = agentStep{Key: planKey, Label: "规划下一步", Status: "done", Detail: action.UINote, Skill: action.Skill}
			emitAgentStep(emit, steps[planIdx])

			toolKey := "tool_" + strconv.Itoa(turn+1)
			step = agentStep{Key: toolKey, Label: "查询数据", Status: "pending", Detail: "正在执行" + skillDisplayName(action.Skill), Skill: action.Skill}
			steps = append(steps, step)
			emitAgentStep(emit, step)
			outcome, err := s.executeAgentSkillPlan(r, question, action.Skill, action.Params)
			if err != nil {
				return agentLoopResult{}, err
			}
			lastOutcome := outcome
			last = &lastOutcome
			observations = append(observations, outcome.observation())
			steps[len(steps)-1] = agentStep{
				Key:      toolKey,
				Label:    agentToolStepLabel(outcome.Skill.Type),
				Status:   "done",
				Detail:   fmt.Sprintf("已完成%s，返回 %d 条结果", skillDisplayName(outcome.Skill.Name), outcome.RowCount),
				Skill:    outcome.Skill.Name,
				RowCount: outcome.RowCount,
			}
			emitAgentStep(emit, steps[len(steps)-1])
			continue
		}

		action, err := s.nextAgentAction(r.Context(), question, history, toolsJSON, acctCtx, observations, llmOpts)
		if err != nil {
			if isLLMServiceError(err) {
				s.setLLMProbeCache(false, llmUserMessage(err))
			}
			return agentLoopResult{}, err
		}
		s.setLLMProbeCache(true, "")

		switch action.Action {
		case "final":
			steps[planIdx] = agentStep{Key: planKey, Label: "规划下一步", Status: "done", Detail: "已判断当前信息足够回答"}
			emitAgentStep(emit, steps[planIdx])
			reply := strings.TrimSpace(action.Reply)
			if len(observations) > 0 {
				step := agentStep{Key: "answer", Label: "总结回答", Status: "pending", Detail: "正在生成回答"}
				steps = append(steps, step)
				emitAgentStep(emit, step)

				if emitAnswer != nil {
					reply, err = s.finalAgentReplyStream(r.Context(), question, history, observations, llmOpts, emitAnswer)
					if err != nil {
						if isLLMServiceError(err) {
							s.setLLMProbeCache(false, llmUserMessage(err))
						}
						return agentLoopResult{}, err
					}
				} else if reply == "" {
					reply, err = s.finalAgentReply(r.Context(), question, history, observations, llmOpts)
					if err != nil {
						if isLLMServiceError(err) {
							s.setLLMProbeCache(false, llmUserMessage(err))
						}
						return agentLoopResult{}, err
					}
				}
				s.setLLMProbeCache(true, "")
				if reply == "" && last != nil {
					reply = narrateSkillResult(last.Skill, skillArgs(last.Params), last.Result, last.RowCount)
					if emitAnswer != nil {
						emitAnswer(reply)
					}
				}
				steps[len(steps)-1] = agentStep{Key: "answer", Label: "总结回答", Status: "done", Detail: "已基于查询结果生成回答"}
				emitAgentStep(emit, steps[len(steps)-1])
			} else if emitAnswer != nil && reply != "" {
				step := agentStep{Key: "answer", Label: "总结回答", Status: "done", Detail: "已生成回答"}
				steps = append(steps, step)
				emitAgentStep(emit, step)
				emitAnswer(reply)
			} else {
				step := agentStep{Key: "answer", Label: "总结回答", Status: "done", Detail: "已生成回答"}
				steps = append(steps, step)
				emitAgentStep(emit, step)
			}
			if reply == "" {
				if last != nil {
					reply = narrateSkillResult(last.Skill, skillArgs(last.Params), last.Result, last.RowCount)
				} else {
					reply = "我可以帮你查资产、持仓、对账，也可以先整理一条待确认的记账草稿。"
				}
			}
			if last == nil {
				return finish(agentLoopResult{Reply: reply, Steps: steps}), nil
			}
			return finish(agentLoopResult{Outcome: last, Reply: reply, Steps: steps}), nil

		case "run_skill":
			if action.Skill == "" {
				return agentLoopResult{}, errSkillInput{"agent 未选择 skill"}
			}
			note := action.UINote
			if note == "" {
				note = "准备查询" + skillDisplayName(action.Skill)
			}
			steps[planIdx] = agentStep{Key: planKey, Label: "规划下一步", Status: "done", Detail: note, Skill: action.Skill}
			emitAgentStep(emit, steps[planIdx])

			toolKey := "tool_" + strconv.Itoa(turn+1)
			toolLabel := "查询数据"
			if sk, ok := s.findSkill(action.Skill); ok {
				toolLabel = agentToolStepLabel(sk.Type)
			}
			step = agentStep{Key: toolKey, Label: toolLabel, Status: "pending", Detail: "正在执行" + skillDisplayName(action.Skill), Skill: action.Skill}
			steps = append(steps, step)
			emitAgentStep(emit, step)
			outcome, err := s.executeAgentSkillPlan(r, question, action.Skill, action.Params)
			if err != nil {
				return agentLoopResult{}, err
			}
			lastOutcome := outcome
			last = &lastOutcome
			observations = append(observations, outcome.observation())
			steps[len(steps)-1] = agentStep{
				Key:      toolKey,
				Label:    agentToolStepLabel(outcome.Skill.Type),
				Status:   "done",
				Detail:   fmt.Sprintf("已完成%s，返回 %d 条结果", skillDisplayName(outcome.Skill.Name), outcome.RowCount),
				Skill:    outcome.Skill.Name,
				RowCount: outcome.RowCount,
			}
			emitAgentStep(emit, steps[len(steps)-1])
			if outcome.Skill.Type == "draft" {
				step = agentStep{Key: "confirm", Label: "等待确认", Status: "pending", Detail: "写入前需要你确认草稿"}
				steps = append(steps, step)
				emitAgentStep(emit, step)
				return finish(agentLoopResult{Outcome: &outcome, Reply: narrateSkillResult(outcome.Skill, skillArgs(outcome.Params), outcome.Result, outcome.RowCount), Steps: steps}), nil
			}
			if turn == maxAgentToolCalls-1 {
				step = agentStep{Key: "answer", Label: "总结回答", Status: "done", Detail: "已达到工具调用上限，使用当前查询结果总结"}
				steps = append(steps, step)
				emitAgentStep(emit, step)
				return finish(agentLoopResult{Outcome: &outcome, Reply: narrateSkillResult(outcome.Skill, skillArgs(outcome.Params), outcome.Result, outcome.RowCount), Steps: steps}), nil
			}

		default:
			return agentLoopResult{}, errSkillInput{"Copilot 没能识别下一步动作，请换个问法或稍后重试"}
		}
	}
	return agentLoopResult{}, errSkillInput{"agent 未生成回答"}
}

func emitAgentStep(emit func(agentStep), step agentStep) {
	if emit != nil {
		emit(step)
	}
}

func (r agentLoopResult) response() map[string]any {
	var out map[string]any
	if r.Outcome == nil {
		out = map[string]any{"type": "chat", "reply": r.Reply, "steps": r.Steps}
	} else {
		out = agentResponse(*r.Outcome, r.Reply, r.Steps)
	}
	if !r.Usage.Empty() {
		out["usage"] = r.Usage
	}
	return out
}

func (s *Server) writeAgentError(w http.ResponseWriter, r *http.Request, err error) {
	var bad errSkillInput
	if errors.As(err, &bad) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", bad.Error())
		return
	}
	if isLLMServiceError(err) {
		reason := llmUserMessage(err)
		writeError(w, http.StatusServiceUnavailable, "llm_unavailable", reason+"，Copilot 已停用")
		return
	}
	writeStorageError(w, r, err)
}

func writeSSE(w http.ResponseWriter, flusher http.Flusher, event string, data any) {
	b, _ := json.Marshal(data)
	_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
	flusher.Flush()
}

func agentErrorCode(err error) string {
	var bad errSkillInput
	if errors.As(err, &bad) {
		return "business_rule_violated"
	}
	if isLLMServiceError(err) {
		return "llm_unavailable"
	}
	return "internal"
}

func agentErrorMessage(err error) string {
	var bad errSkillInput
	if errors.As(err, &bad) {
		return bad.Error()
	}
	if isLLMServiceError(err) {
		return llmUserMessage(err) + "，Copilot 已停用"
	}
	return "请求失败"
}

func (s *Server) writeAgentPlanResult(w http.ResponseWriter, r *http.Request, nlSource, skillName string, params map[string]any) {
	outcome, err := s.executeAgentSkillPlan(r, nlSource, skillName, params)
	if err != nil {
		var bad errSkillInput
		if errors.As(err, &bad) {
			writeErrorDetails(w, http.StatusUnprocessableEntity, "business_rule_violated", bad.Error(), map[string]any{"skill": skillName, "params": params})
			return
		}
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, agentResponse(outcome, narrateSkillResult(outcome.Skill, skillArgs(outcome.Params), outcome.Result, outcome.RowCount), nil))
}

func (s *Server) executeAgentSkillPlan(r *http.Request, nlSource, skillName string, params map[string]any) (agentSkillOutcome, error) {
	sk, ok := s.findSkill(strings.TrimSpace(skillName))
	if !ok || (sk.Type != "read" && sk.Type != "draft") {
		return agentSkillOutcome{}, errSkillInput{"规划选择了无效或不可直接执行的 skill"}
	}
	if params == nil {
		params = map[string]any{}
	}
	result, rowCount, affected, err := s.runAndAudit(r, sk, skillArgs(params), false, nlSource)
	if err != nil {
		return agentSkillOutcome{}, err
	}
	return agentSkillOutcome{Skill: sk, Params: params, Result: result, RowCount: rowCount, Affected: affected}, nil
}

func agentResponse(outcome agentSkillOutcome, reply string, steps []agentStep) map[string]any {
	out := map[string]any{
		"plan":                  map[string]any{"skill": outcome.Skill.Name, "params": outcome.Params},
		"type":                  outcome.Skill.Type,
		"requires_confirmation": outcome.Skill.Type == "draft",
		"result":                outcome.Result,
		"row_count":             outcome.RowCount,
		"affected_entities":     outcome.Affected,
		"reply":                 reply,
	}
	if len(steps) > 0 {
		out["steps"] = steps
	}
	return out
}

func agentToolStepLabel(skillType string) string {
	if skillType == "draft" {
		return "生成草稿"
	}
	return "查询数据"
}

func skillDisplayName(name string) string {
	if label, ok := skillDisplayNames[name]; ok {
		return label
	}
	return "数据"
}

var skillDisplayNames = map[string]string{
	"portfolio.getSnapshot":             "资产快照",
	"holdings.listCurrent":              "当前持仓",
	"holdings.getAccountPositions":      "账户持仓",
	"accounts.list":                     "账户列表",
	"accounts.getDetail":                "账户详情",
	"institutions.list":                 "机构列表",
	"marketData.getInstrumentHistory":   "历史价格",
	"fx.getRateHistory":                 "历史汇率",
	"recon.getAccountDiff":              "现金对账",
	"compare.getPeriodAttribution":      "期间归因",
	"targets.getDrift":                  "目标配置漂移",
	"entry.draftBalanceSnapshot":        "余额快照草稿",
	"entry.draftTransaction":            "持仓交易草稿",
	"entry.draftCreditCardBill":         "信用卡账单草稿",
	"entry.draftPositionSnapshot":       "持仓快照草稿",
	"entry.draftTransfer":               "账户转账草稿",
	"entry.draftIncomeEvent":            "收益事件草稿",
	"entry.draftCorporateAction":        "公司动作草稿",
	"marketData.draftPrice":             "价格记录草稿",
	"marketData.draftFxRate":            "汇率记录草稿",
	"planning.draftAllocationTargetSet": "配置目标草稿",
	"timeline.draftAnnotation":          "时间线标注草稿",
}

func (s *Server) recordSkillAudit(r *http.Request, sk Skill, body agentRunBody, rowCount int, affected []string, runErr error) {
	if !sk.AuditEnabled {
		return
	}
	input, _ := json.Marshal(body.Params)
	var affJSON json.RawMessage
	if len(affected) > 0 {
		b, _ := json.Marshal(affected)
		affJSON = b
	}
	status, errCode := "ok", (*string)(nil)
	if runErr != nil {
		status = "error"
		c := "internal"
		var bad errSkillInput
		if errors.As(runErr, &bad) {
			c = "business_rule_violated"
		}
		errCode = &c
	}
	rc := rowCount
	var nl *string
	if body.NLSource != "" {
		nl = &body.NLSource
	}
	skillName, skillType := sk.Name, sk.Type
	_ = s.store.InsertAuditEvent(r.Context(), userOf(r), store.AuditEvent{
		RequestID: requestID(r), Actor: actorOf(r), Source: sourceOf(r),
		SkillName: &skillName, SkillType: &skillType, InputJSON: input,
		OutputRowCount: &rc, AffectedEntities: affJSON, NLSource: nl,
		ConfirmedByUser: body.Confirm, Status: status, ErrorCode: errCode,
	})
}

// requestID returns the chi RequestID (set by middleware) or a random fallback.
func requestID(r *http.Request) string {
	if v := r.Header.Get("X-Request-Id"); v != "" {
		return v
	}
	if v, ok := r.Context().Value(ctxRequestID).(string); ok && v != "" {
		return v
	}
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

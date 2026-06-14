package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
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
		if prefs, err := s.store.GetPreferences(ctx); err == nil {
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

func (s *Server) asOf(a skillArgs) (string, error) {
	d := argStr(a, "as_of")
	if d == "" {
		return s.today(), nil
	}
	if _, err := domain.ParseDate(d, s.cfg.Location); err != nil {
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
				onDate, err := s.asOf(a)
				if err != nil {
					return nil, 0, nil, err
				}
				d, fx := s.resolveDisplay(ctx, a)
				v, err := s.store.GetValuation(ctx, onDate, d, fx, s.today())
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
				onDate, err := s.asOf(a)
				if err != nil {
					return nil, 0, nil, err
				}
				d, fx := s.resolveDisplay(ctx, a)
				v, err := s.store.GetValuation(ctx, onDate, d, fx, s.today())
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
				onDate, err := s.asOf(a)
				if err != nil {
					return nil, 0, nil, err
				}
				id := argInt(a, "account_id")
				if id == 0 {
					return nil, 0, nil, errSkillInput{"account_id is required"}
				}
				rows, err := s.store.ListAccountPositions(ctx, id, onDate)
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
				rows, err := s.store.ListAccounts(ctx, s.today())
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
				acct, err := s.store.GetAccount(ctx, id, s.today())
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
				rows, err := s.store.ListInstitutions(ctx)
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
				onDate, err := s.asOf(a)
				if err != nil {
					return nil, 0, nil, err
				}
				id := argInt(a, "account_id")
				if id == 0 {
					return nil, 0, nil, errSkillInput{"account_id is required"}
				}
				res, err := s.store.ReconcileAccount(ctx, id, onDate, argBool(a, "settled_only"))
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
				if _, err := domain.ParseDate(from, s.cfg.Location); err != nil {
					return nil, 0, nil, errSkillInput{"from must be YYYY-MM-DD"}
				}
				if _, err := domain.ParseDate(to, s.cfg.Location); err != nil {
					return nil, 0, nil, errSkillInput{"to must be YYYY-MM-DD"}
				}
				d, fx := s.resolveDisplay(ctx, a)
				res, err := s.store.PeriodAttribution(ctx, from, to, d, fx)
				return res, 1, nil, err
			},
		},
		{
			Name: "targets.getDrift", Type: "read", Permission: "read", AuditEnabled: true,
			Description: "目标配置漂移与再平衡建议;不传 set_id 则返回全部目标集。",
			InputSchema: sch(`{"type":"object","properties":{"set_id":{"type":"integer"},"as_of":{"type":"string"},` + disp + `},"additionalProperties":false}`),
			run: func(s *Server, ctx context.Context, a skillArgs) (any, int, []string, error) {
				onDate, err := s.asOf(a)
				if err != nil {
					return nil, 0, nil, err
				}
				d, fx := s.resolveDisplay(ctx, a)
				if id := argInt(a, "set_id"); id != 0 {
					set, err := s.store.EvaluateDrift(ctx, id, onDate, d, fx)
					if errors.Is(err, store.ErrNotFound) {
						return nil, 0, nil, errSkillInput{"target set not found"}
					}
					return set, 1, nil, err
				}
				sets, err := s.store.ListAllocationTargetSets(ctx)
				if err != nil {
					return nil, 0, nil, err
				}
				out := make([]any, 0, len(sets))
				for _, set := range sets {
					ev, err := s.store.EvaluateDrift(ctx, set.ID, onDate, d, fx)
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

func (s *Server) runAgentSkill(w http.ResponseWriter, r *http.Request) { s.execSkill(w, r, false) }
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
	if body.Params == nil {
		body.Params = map[string]any{}
	}
	result, rowCount, affected, err := sk.run(s, r.Context(), body.Params)
	s.recordSkillAudit(r, sk, body, rowCount, affected, err)
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
	if len(affected) > 0 {
		out["affected_entities"] = affected
	}
	writeJSON(w, http.StatusOK, out)
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
	_ = s.store.InsertAuditEvent(r.Context(), store.AuditEvent{
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

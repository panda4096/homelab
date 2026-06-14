package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/llm"
)

func (s *Server) getLLMStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": s.llm.Configured(),
		"provider":   s.llm.Provider(),
		"model":      s.llm.Model(),
	})
}

// llmSchemaWhitelist is the read-only schema exposed to NL→SQL (§8.2). Only these
// tables/columns are described to the model; the read-only tx is the hard guard.
const llmSchemaWhitelist = `只读查询可用的表与主要列(PostgreSQL):
institutions(id, name, kind)
accounts(id, name, institution_id, currency, kind, is_archived)  -- kind: cash/time_deposit/wealth_product/fund/brokerage/credit_card/crypto_wallet
instruments(symbol, display_name, market, quote_currency, asset_kind, is_benchmark)
balance_snapshots(id, account_id, snapshot_date, balance)
position_snapshots(id, account_id, symbol, quantity, avg_cost, cost_currency, snapshot_date)
prices(symbol, price_date, price, currency)
fx_rates(base_currency, quote_currency, rate_date, rate)
credit_card_bills(id, account_id, statement_date, amount_total, currency, paid_at)
transactions(id, account_id, symbol, action, trade_date, quantity, price, currency, fee, is_settled)  -- action: buy/sell
transfers(id, from_account_id, to_account_id, from_amount, to_amount, transfer_date)
income_events(id, event_kind, event_date, account_id, symbol, amount, currency)  -- event_kind: dividend/interest/rebate/other
corporate_actions(id, symbol, action, event_date, ratio_numerator, ratio_denominator)`

func (s *Server) llmQuery(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text string `json:"text"`
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
		writeError(w, http.StatusServiceUnavailable, "llm_unavailable", "未配置 LLM API Key，自然语言查询不可用")
		return
	}
	system := "你是 finbrain 的只读数据分析助手。把业主的中文问题翻译成 **单条只读 PostgreSQL SELECT 查询**。\n" +
		llmSchemaWhitelist +
		"\n规则:只输出一条 SQL,不要解释;必须是 SELECT(可用 WITH 开头的 CTE);禁止任何写操作(insert/update/delete/drop/alter/create/truncate 等);务必带合理 LIMIT(<=500);金额列是 numeric;日期是 date。只返回 SQL 文本。"
	raw, err := s.llm.Complete(r.Context(), system, body.Text, false)
	if errors.Is(err, llm.ErrNotConfigured) {
		writeError(w, http.StatusServiceUnavailable, "llm_unavailable", "LLM 不可用")
		return
	}
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "llm_unavailable", "LLM 调用失败")
		return
	}
	sql := extractSQL(raw)
	if msg := validateReadOnlySQL(sql); msg != "" {
		writeErrorDetails(w, http.StatusUnprocessableEntity, "business_rule_violated", "生成的查询未通过只读校验: "+msg, map[string]string{"sql": sql})
		return
	}
	result, err := s.store.RunReadOnlyQuery(r.Context(), sql, 500)
	if err != nil {
		writeErrorDetails(w, http.StatusUnprocessableEntity, "business_rule_violated", "查询执行失败: "+err.Error(), map[string]string{"sql": sql})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"sql": sql, "result": result})
}

func (s *Server) llmParse(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text string `json:"text"`
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
		writeError(w, http.StatusServiceUnavailable, "llm_unavailable", "未配置 LLM API Key，自然语言录入不可用")
		return
	}
	accounts, err := s.store.ListAccounts(r.Context(), s.today())
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	type acctLite struct {
		ID          int64  `json:"id"`
		Name        string `json:"name"`
		Institution string `json:"institution"`
		Kind        string `json:"kind"`
		Currency    string `json:"currency"`
	}
	lite := make([]acctLite, 0, len(accounts))
	for _, a := range accounts {
		lite = append(lite, acctLite{a.ID, a.Name, a.Institution, a.Kind, a.Currency})
	}
	acctJSON, _ := json.Marshal(lite)

	system := "你是 finbrain 的录入解析助手。把业主的中文自由文本解析成结构化草稿,供业主确认后写库。\n" +
		"识别意图 intent ∈ {balance_snapshot, position_snapshot, credit_card_bill, income_event, transaction, transfer, corporate_action, price, fx_rate, unknown}。\n" +
		"把提到的账户模糊匹配到下方账户列表,返回 account_id(取最可能的一个)与 account_candidates(最多 3 个 id)。\n" +
		"金额/数量/价格用字符串;日期用 YYYY-MM-DD,缺省用今天。\n" +
		"严格只返回一个 JSON 对象:{intent, account_id, account_candidates:[id], fields:{...该意图所需字段...}, confidence, note}。\n" +
		"账户列表(JSON):" + string(acctJSON)
	raw, err := s.llm.Complete(r.Context(), system, "今天是 "+s.today()+"。文本:"+body.Text, true)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "llm_unavailable", "LLM 调用失败")
		return
	}
	var draft any
	if err := json.Unmarshal([]byte(stripCodeFence(raw)), &draft); err != nil {
		writeErrorDetails(w, http.StatusUnprocessableEntity, "business_rule_violated", "解析结果不是有效 JSON", map[string]string{"raw": raw})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"draft": draft})
}

var sqlForbidden = regexp.MustCompile(`(?i)\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|merge|call|comment|reindex)\b`)

func validateReadOnlySQL(sql string) string {
	sql = strings.TrimSpace(sql)
	if sql == "" {
		return "空查询"
	}
	trimmed := strings.TrimRight(sql, "; \n\t")
	if strings.Contains(trimmed, ";") {
		return "只允许单条语句"
	}
	low := strings.ToLower(trimmed)
	if !strings.HasPrefix(low, "select") && !strings.HasPrefix(low, "with") {
		return "只允许 SELECT 查询"
	}
	if sqlForbidden.MatchString(trimmed) {
		return "包含被禁止的关键字"
	}
	return ""
}

func extractSQL(raw string) string {
	s := stripCodeFence(raw)
	return strings.TrimSpace(s)
}

func stripCodeFence(raw string) string {
	s := strings.TrimSpace(raw)
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
		// drop an optional language tag on the first line
		if i := strings.IndexByte(s, '\n'); i >= 0 {
			first := strings.TrimSpace(s[:i])
			if first == "" || (!strings.ContainsAny(first, " {}()") && len(first) < 12) {
				s = s[i+1:]
			}
		}
		if i := strings.LastIndex(s, "```"); i >= 0 {
			s = s[:i]
		}
	}
	return strings.TrimSpace(s)
}

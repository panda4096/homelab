package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

var summaryPeriodKinds = map[string]bool{"month": true, "quarter": true, "year": true}

func (s *Server) listSummaries(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListSummaries(r.Context(), userOf(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) getSummary(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	sm, err := s.store.GetSummary(r.Context(), userOf(r), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "总结不存在")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sm)
}

func (s *Server) deleteSummary(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteSummary(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "总结不存在")
		return
	} else if err != nil {
		writeInternal(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) generateSummary(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PeriodKind      string `json:"period_kind"`
		PeriodStart     string `json:"period_start"`
		PeriodEnd       string `json:"period_end"`
		DisplayCurrency string `json:"display_currency"`
		FxMode          string `json:"fx_mode"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	body.PeriodKind = strings.ToLower(strings.TrimSpace(body.PeriodKind))
	if !summaryPeriodKinds[body.PeriodKind] {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "period_kind must be month / quarter / year")
		return
	}
	if _, err := domain.ParseDate(body.PeriodStart, s.location(r.Context())); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "period_start must be YYYY-MM-DD")
		return
	}
	if _, err := domain.ParseDate(body.PeriodEnd, s.location(r.Context())); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "period_end must be YYYY-MM-DD")
		return
	}
	if !s.llm.Configured() {
		writeError(w, http.StatusServiceUnavailable, "llm_unavailable", "未配置 LLM API Key，无法生成总结")
		return
	}

	prefs, err := s.store.GetPreferences(r.Context(), userOf(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	ccy := strings.ToUpper(strings.TrimSpace(body.DisplayCurrency))
	if ccy == "" {
		ccy = prefs.DisplayCurrency
	}
	if !currencyRe.MatchString(ccy) {
		writeError(w, http.StatusBadRequest, "validation_failed", "display_currency must be a 3-letter ISO code")
		return
	}
	fxMode := strings.TrimSpace(body.FxMode)
	if fxMode == "" {
		fxMode = prefs.FxMode
	}
	if fxMode != "current" && fxMode != "historical" {
		fxMode = "current"
	}

	data, err := s.store.GatherSummaryData(r.Context(), userOf(r), body.PeriodStart, body.PeriodEnd, ccy, fxMode)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	dataJSON, _ := json.Marshal(data)

	system := "你是 finbrain 的私人财富分析师。根据给定的期初/期末净资产截面与配置数据,写一段简洁、客观、可读的中文阶段总结(Markdown,150-300 字)。\n" +
		"涵盖:净资产变化(金额+比例)、资产结构变化要点、已实现盈亏与收益事件、需关注的风险或建议。不要编造数据,只用给定数字;金额带币种 " + ccy + "。"
	content, err := s.llm.Complete(r.Context(), system, "期间 "+body.PeriodStart+" 至 "+body.PeriodEnd+"("+body.PeriodKind+")。数据(JSON):"+string(dataJSON), false)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "llm_unavailable", "LLM 调用失败")
		return
	}

	out, err := s.store.CreateSummary(r.Context(), userOf(r), store.Summary{
		PeriodKind: body.PeriodKind, PeriodStart: body.PeriodStart, PeriodEnd: body.PeriodEnd,
		DisplayCurrency: ccy, Content: strings.TrimSpace(content), Meta: dataJSON,
	})
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

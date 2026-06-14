package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

var corporateActionKinds = map[string]bool{"split": true, "merge": true, "rights": true}

func (s *Server) listCorporateActions(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
	items, truncated, err := s.store.ListCorporateActions(r.Context(), symbol, queryLimit(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, listResponse(items, truncated, queryLimit(r)))
}

func (s *Server) createCorporateAction(w http.ResponseWriter, r *http.Request) {
	var c store.CorporateAction
	if !decodeJSON(w, r, &c) {
		return
	}
	if msg := s.normalizeAndValidateCorporateAction(r.Context(), &c); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.CreateCorporateAction(r.Context(), c)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该标的当日同类公司动作已存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) patchCorporateAction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	current, err := s.store.GetCorporateAction(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "公司动作不存在")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	var c store.CorporateAction
	if !decodeJSON(w, r, &c) {
		return
	}
	c.Symbol = current.Symbol // symbol immutable on edit
	if msg := s.normalizeAndValidateCorporateAction(r.Context(), &c); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpdateCorporateAction(r.Context(), id, c)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "公司动作不存在")
		return
	}
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该标的当日同类公司动作已存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteCorporateAction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteCorporateAction(r.Context(), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "公司动作不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) normalizeAndValidateCorporateAction(ctx context.Context, c *store.CorporateAction) string {
	c.Symbol = strings.ToUpper(strings.TrimSpace(c.Symbol))
	c.Action = strings.ToLower(strings.TrimSpace(c.Action))
	c.EventDate = strings.TrimSpace(c.EventDate)
	c.RatioNumerator = strings.TrimSpace(c.RatioNumerator)
	c.RatioDenominator = strings.TrimSpace(c.RatioDenominator)
	if c.Symbol == "" {
		return "symbol is required"
	}
	if msg := validateTextLen("symbol", c.Symbol, maxSymbolLen); msg != "" {
		return msg
	}
	if !corporateActionKinds[c.Action] {
		return "action must be split / merge / rights"
	}
	if !validDecimal(c.RatioNumerator) || !positiveDecimal(c.RatioNumerator) {
		return "ratio_numerator must be > 0"
	}
	if !validDecimal(c.RatioDenominator) || !positiveDecimal(c.RatioDenominator) {
		return "ratio_denominator must be > 0"
	}
	if _, err := domain.ParseDate(c.EventDate, s.location(ctx)); err != nil {
		return "event_date must be YYYY-MM-DD"
	}
	if msg := validateOptionalTextLen("notes", c.Notes, maxNoteLen); msg != "" {
		return msg
	}
	return ""
}

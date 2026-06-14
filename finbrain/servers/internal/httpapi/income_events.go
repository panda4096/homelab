package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

var incomeKinds = map[string]bool{"dividend": true, "interest": true, "rebate": true, "other": true}

func (s *Server) listIncomeEvents(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
	kind := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("event_kind")))
	items, truncated, err := s.store.ListIncomeEvents(r.Context(), userOf(r), queryInt64(r, "account_id"), symbol, kind, queryLimit(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, listResponse(items, truncated, queryLimit(r)))
}

func (s *Server) createIncomeEvent(w http.ResponseWriter, r *http.Request) {
	var e store.IncomeEvent
	if !decodeJSON(w, r, &e) {
		return
	}
	if msg := s.normalizeAndValidateIncomeEvent(r, &e); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.CreateIncomeEvent(r.Context(), userOf(r), e)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) patchIncomeEvent(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if _, err := s.store.GetIncomeEvent(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "收益事件不存在")
		return
	} else if err != nil {
		writeInternal(w, r, err)
		return
	}
	var e store.IncomeEvent
	if !decodeJSON(w, r, &e) {
		return
	}
	if msg := s.normalizeAndValidateIncomeEvent(r, &e); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpdateIncomeEvent(r.Context(), userOf(r), id, e)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "收益事件不存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteIncomeEvent(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteIncomeEvent(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "收益事件不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) normalizeAndValidateIncomeEvent(r *http.Request, e *store.IncomeEvent) string {
	e.EventKind = strings.ToLower(strings.TrimSpace(e.EventKind))
	e.EventDate = strings.TrimSpace(e.EventDate)
	e.Currency = strings.ToUpper(strings.TrimSpace(e.Currency))
	e.Amount = strings.TrimSpace(e.Amount)
	if e.PaymentAccountID != nil && *e.PaymentAccountID == 0 {
		e.PaymentAccountID = nil
	}
	if e.Symbol != nil {
		sym := strings.ToUpper(strings.TrimSpace(*e.Symbol))
		if sym == "" {
			e.Symbol = nil
		} else {
			e.Symbol = &sym
		}
	}
	if !incomeKinds[e.EventKind] {
		return "event_kind must be dividend / interest / rebate / other"
	}
	if e.AccountID == 0 {
		return "account_id is required"
	}
	if e.EventKind == "dividend" && e.Symbol == nil {
		return "分红事件必须关联标的"
	}
	if e.Symbol != nil {
		if msg := validateTextLen("symbol", *e.Symbol, maxSymbolLen); msg != "" {
			return msg
		}
	}
	if !validMoneyDecimal(e.Amount) || !positiveDecimal(e.Amount) {
		return "amount must be > 0 with up to 2 decimal places"
	}
	if e.TaxWithheld != nil {
		tax := strings.TrimSpace(*e.TaxWithheld)
		if tax == "" {
			e.TaxWithheld = nil
		} else {
			e.TaxWithheld = &tax
			if !validMoneyDecimal(tax) || isNegativeDecimal(tax) {
				return "tax_withheld must be >= 0 with up to 2 decimal places"
			}
		}
	}
	if !currencyRe.MatchString(e.Currency) {
		return "currency must be a 3-letter ISO code"
	}
	if _, err := domain.ParseDate(e.EventDate, s.cfg.Location); err != nil {
		return "event_date must be YYYY-MM-DD"
	}
	if msg := validateOptionalTextLen("note", e.Note, maxNoteLen); msg != "" {
		return msg
	}
	if _, err := s.store.GetAccount(r.Context(), userOf(r), e.AccountID, s.today()); errors.Is(err, store.ErrNotFound) {
		return "account not found"
	} else if err != nil {
		return "account lookup failed"
	}
	if e.PaymentAccountID != nil {
		if _, err := s.store.GetAccount(r.Context(), userOf(r), *e.PaymentAccountID, s.today()); errors.Is(err, store.ErrNotFound) {
			return "payment_account_id 不存在"
		} else if err != nil {
			return "payment account lookup failed"
		}
	}
	return ""
}

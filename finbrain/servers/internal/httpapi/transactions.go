package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) listTransactions(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
	items, truncated, err := s.store.ListTransactions(r.Context(), userOf(r), queryInt64(r, "account_id"), symbol, queryLimit(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, listResponse(items, truncated, queryLimit(r)))
}

func (s *Server) createTransaction(w http.ResponseWriter, r *http.Request) {
	var t store.Transaction
	if !decodeJSON(w, r, &t) {
		return
	}
	if msg := s.normalizeAndValidateTransaction(r, &t); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.CreateTransaction(r.Context(), userOf(r), t)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) patchTransaction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	current, err := s.store.GetTransaction(r.Context(), userOf(r), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "交易不存在")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	var t store.Transaction
	if !decodeJSON(w, r, &t) {
		return
	}
	// account & symbol are immutable on edit (re-keying a trade = delete + create).
	t.AccountID = current.AccountID
	t.Symbol = current.Symbol
	if msg := s.normalizeAndValidateTransaction(r, &t); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpdateTransaction(r.Context(), userOf(r), id, t)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "交易不存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteTransaction(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteTransaction(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "交易不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) normalizeAndValidateTransaction(r *http.Request, t *store.Transaction) string {
	t.Symbol = strings.ToUpper(strings.TrimSpace(t.Symbol))
	t.Action = strings.ToLower(strings.TrimSpace(t.Action))
	t.Currency = strings.ToUpper(strings.TrimSpace(t.Currency))
	t.TradeDate = strings.TrimSpace(t.TradeDate)
	t.Quantity = strings.TrimSpace(t.Quantity)
	t.Price = strings.TrimSpace(t.Price)
	if t.AccountID == 0 || t.Symbol == "" {
		return "account_id and symbol are required"
	}
	if msg := validateTextLen("symbol", t.Symbol, maxSymbolLen); msg != "" {
		return msg
	}
	if t.Action != "buy" && t.Action != "sell" {
		return "action must be buy or sell"
	}
	if !validDecimal(t.Quantity) || !positiveDecimal(t.Quantity) {
		return "quantity must be > 0"
	}
	if !validDecimal(t.Price) || isNegativeDecimal(t.Price) {
		return "price must be >= 0"
	}
	if t.Fee != nil {
		fee := strings.TrimSpace(*t.Fee)
		if fee == "" {
			t.Fee = nil
		} else {
			t.Fee = &fee
			if !validDecimal(fee) || isNegativeDecimal(fee) {
				return "fee must be >= 0"
			}
		}
	}
	if !currencyRe.MatchString(t.Currency) {
		return "currency must be a 3-letter ISO code"
	}
	if _, err := domain.ParseDate(t.TradeDate, s.cfg.Location); err != nil {
		return "trade_date must be YYYY-MM-DD"
	}
	if t.SettleDate != nil {
		sd := strings.TrimSpace(*t.SettleDate)
		if sd == "" {
			t.SettleDate = nil
		} else {
			t.SettleDate = &sd
			if _, err := domain.ParseDate(sd, s.cfg.Location); err != nil {
				return "settle_date must be YYYY-MM-DD"
			}
		}
	}
	if msg := validateOptionalTextLen("notes", t.Notes, maxNoteLen); msg != "" {
		return msg
	}
	acct, err := s.store.GetAccount(r.Context(), userOf(r), t.AccountID, s.today())
	if errors.Is(err, store.ErrNotFound) {
		return "account not found"
	}
	if err != nil {
		return "account lookup failed"
	}
	if !supportsPositionSnapshots(acct.Kind) {
		return "该账户类型不支持持仓交易"
	}
	return ""
}

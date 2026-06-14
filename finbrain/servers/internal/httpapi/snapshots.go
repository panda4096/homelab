package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func validDecimal(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	if strings.HasPrefix(s, "-") {
		s = strings.TrimPrefix(s, "-")
		if s == "" {
			return false
		}
	}
	parts := strings.Split(s, ".")
	if len(parts) > 2 || parts[0] == "" {
		return false
	}
	if !allDecimalDigits(parts[0]) {
		return false
	}
	if len(parts) == 2 {
		if len(parts[1]) == 0 || len(parts[1]) > 8 {
			return false
		}
		if !allDecimalDigits(parts[1]) {
			return false
		}
	}
	return true
}

func allDecimalDigits(s string) bool {
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	return true
}

func isNegativeDecimal(s string) bool {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "-") {
		return false
	}
	for _, ch := range strings.TrimPrefix(s, "-") {
		if ch == '.' || ch == '0' {
			continue
		}
		return ch >= '1' && ch <= '9'
	}
	return false
}

func validMoneyDecimal(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	if strings.HasPrefix(s, "-") {
		s = strings.TrimPrefix(s, "-")
	}
	parts := strings.Split(s, ".")
	if len(parts) > 2 || parts[0] == "" {
		return false
	}
	for _, ch := range parts[0] {
		if ch < '0' || ch > '9' {
			return false
		}
	}
	if len(parts) == 2 {
		if len(parts[1]) == 0 || len(parts[1]) > 2 {
			return false
		}
		for _, ch := range parts[1] {
			if ch < '0' || ch > '9' {
				return false
			}
		}
	}
	return true
}

func supportsBalanceSnapshots(kind string) bool {
	switch kind {
	case "cash", "time_deposit", "wealth_product":
		return true
	default:
		return false
	}
}

func supportsPositionSnapshots(kind string) bool {
	switch kind {
	case "brokerage", "fund", "crypto_wallet":
		return true
	default:
		return false
	}
}

// --- balance snapshots ---

func (s *Server) upsertBalanceSnapshot(w http.ResponseWriter, r *http.Request) {
	var b store.BalanceSnapshot
	if !decodeJSON(w, r, &b) {
		return
	}
	if b.AccountID == 0 || !validMoneyDecimal(b.Balance) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "account_id and balance with up to 2 decimal places are required")
		return
	}
	if msg := validateOptionalTextLen("note", b.Note, maxNoteLen); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	if err := domain.ValidateSnapshotDate(b.SnapshotDate, s.cfg.Location); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", err.Error())
		return
	}
	acct, err := s.store.GetAccount(r.Context(), userOf(r), b.AccountID, s.today())
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "account not found")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	if !supportsBalanceSnapshots(acct.Kind) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "该账户类型不支持录入余额")
		return
	}
	out, err := s.store.UpsertBalanceSnapshot(r.Context(), userOf(r), b)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteBalanceSnapshot(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteBalanceSnapshot(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "snapshot not found")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) patchBalanceSnapshot(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	var b store.BalanceSnapshot
	if !decodeJSON(w, r, &b) {
		return
	}
	if !validMoneyDecimal(b.Balance) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "balance with up to 2 decimal places is required")
		return
	}
	if msg := validateOptionalTextLen("note", b.Note, maxNoteLen); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	if err := domain.ValidateSnapshotDate(b.SnapshotDate, s.cfg.Location); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", err.Error())
		return
	}
	out, err := s.store.UpdateBalanceSnapshot(r.Context(), userOf(r), id, b)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "snapshot not found")
		return
	}
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该日期已存在余额记录")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// --- position snapshots ---

func (s *Server) upsertPositionSnapshot(w http.ResponseWriter, r *http.Request) {
	var p store.PositionSnapshot
	if !decodeJSON(w, r, &p) {
		return
	}
	p.Symbol = strings.ToUpper(strings.TrimSpace(p.Symbol))
	if p.AccountID == 0 || p.Symbol == "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "account_id and symbol are required")
		return
	}
	if msg := validateTextLen("symbol", p.Symbol, maxSymbolLen); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	if msg := validateOptionalTextLen("note", p.Note, maxNoteLen); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	if !validDecimal(p.Quantity) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "quantity must be numeric")
		return
	}
	if isNegativeDecimal(p.Quantity) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "quantity must be >= 0 (0 = 清仓)")
		return
	}
	if p.AvgCost != nil && !validDecimal(*p.AvgCost) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "avg_cost must be numeric")
		return
	}
	if err := domain.ValidateSnapshotDate(p.SnapshotDate, s.cfg.Location); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", err.Error())
		return
	}
	acct, err := s.store.GetAccount(r.Context(), userOf(r), p.AccountID, s.today())
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "account not found")
		return
	} else if err != nil {
		writeInternal(w, r, err)
		return
	}
	if !supportsPositionSnapshots(acct.Kind) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "该账户类型不支持录入持仓")
		return
	}
	out, err := s.store.UpsertPositionSnapshot(r.Context(), userOf(r), p)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deletePositionSnapshot(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeletePositionSnapshot(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "snapshot not found")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) patchPositionSnapshot(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	var p store.PositionSnapshot
	if !decodeJSON(w, r, &p) {
		return
	}
	if msg := validateOptionalTextLen("note", p.Note, maxNoteLen); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	if !validDecimal(p.Quantity) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "quantity must be numeric")
		return
	}
	if isNegativeDecimal(p.Quantity) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "quantity must be >= 0 (0 = 清仓)")
		return
	}
	if p.AvgCost != nil && !validDecimal(*p.AvgCost) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "avg_cost must be numeric")
		return
	}
	if err := domain.ValidateSnapshotDate(p.SnapshotDate, s.cfg.Location); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", err.Error())
		return
	}
	out, err := s.store.UpdatePositionSnapshot(r.Context(), userOf(r), id, p)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "snapshot not found")
		return
	}
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该日期已存在该标的持仓记录")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

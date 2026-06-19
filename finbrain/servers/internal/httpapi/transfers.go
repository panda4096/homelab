package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) listTransfers(w http.ResponseWriter, r *http.Request) {
	items, truncated, err := s.store.ListTransfers(r.Context(), userOf(r), queryInt64(r, "account_id"), queryLimit(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, listResponse(items, truncated, queryLimit(r)))
}

func (s *Server) createTransfer(w http.ResponseWriter, r *http.Request) {
	var t store.Transfer
	if !decodeJSON(w, r, &t) {
		return
	}
	if msg := s.normalizeAndValidateTransfer(r, &t); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.CreateTransfer(r.Context(), userOf(r), t)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) patchTransfer(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if _, err := s.store.GetTransfer(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "转账不存在")
		return
	} else if err != nil {
		writeInternal(w, r, err)
		return
	}
	var t store.Transfer
	if !decodeJSON(w, r, &t) {
		return
	}
	if msg := s.normalizeAndValidateTransfer(r, &t); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpdateTransfer(r.Context(), userOf(r), id, t)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "转账不存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteTransfer(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteTransfer(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "转账不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) normalizeAndValidateTransfer(r *http.Request, t *store.Transfer) string {
	t.FromAmount = strings.TrimSpace(t.FromAmount)
	t.ToAmount = strings.TrimSpace(t.ToAmount)
	t.TransferDate = strings.TrimSpace(t.TransferDate)
	if t.FromAccountID == 0 || t.ToAccountID == 0 {
		return "from_account_id and to_account_id are required"
	}
	if t.FromAccountID == t.ToAccountID {
		return "转出与转入账户不能相同"
	}
	if !validDecimal(t.FromAmount) || !positiveDecimal(t.FromAmount) {
		return "from_amount must be > 0"
	}
	if !validDecimal(t.ToAmount) || !positiveDecimal(t.ToAmount) {
		return "to_amount must be > 0"
	}
	if _, err := domain.ParseDate(t.TransferDate, s.location(r.Context())); err != nil {
		return "transfer_date must be YYYY-MM-DD"
	}
	if msg := validateOptionalTextLen("notes", t.Notes, maxNoteLen); msg != "" {
		return msg
	}
	fromAcct, err := s.store.GetAccount(r.Context(), userOf(r), t.FromAccountID, s.today(r.Context()))
	if errors.Is(err, store.ErrNotFound) {
		return "转出账户不存在"
	} else if err != nil {
		return "account lookup failed"
	}
	toAcct, err := s.store.GetAccount(r.Context(), userOf(r), t.ToAccountID, s.today(r.Context()))
	if errors.Is(err, store.ErrNotFound) {
		return "转入账户不存在"
	} else if err != nil {
		return "account lookup failed"
	}
	// A transfer's two legs both feed the effective-balance / liability model, so the endpoints must
	// be accounts that can actually hold a balance. The transfer-OUT side must be a cash-type account
	// (现金/定期/理财). The transfer-IN side may be cash-type (a normal move) OR a credit_card account,
	// in which case the transfer is a repayment that reduces the card's outstanding (PRD §6.18/§6.19).
	// Anything else (e.g. a brokerage/持仓 account, which holds no cash balance) would silently drop
	// that leg from the cash replay and shift net worth, so it's rejected.
	if !supportsBalanceSnapshots(fromAcct.Kind) {
		return "转出账户须为现金类账户（现金 / 定期 / 理财）"
	}
	if !supportsBalanceSnapshots(toAcct.Kind) && toAcct.Kind != "credit_card" {
		return "转入账户须为现金类账户，或信用卡账户（视为还款）"
	}
	return ""
}

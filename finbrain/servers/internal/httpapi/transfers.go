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
	if _, err := domain.ParseDate(t.TransferDate, s.cfg.Location); err != nil {
		return "transfer_date must be YYYY-MM-DD"
	}
	if msg := validateOptionalTextLen("notes", t.Notes, maxNoteLen); msg != "" {
		return msg
	}
	for _, id := range []int64{t.FromAccountID, t.ToAccountID} {
		if _, err := s.store.GetAccount(r.Context(), userOf(r), id, s.today(r.Context())); errors.Is(err, store.ErrNotFound) {
			return "account not found"
		} else if err != nil {
			return "account lookup failed"
		}
	}
	return ""
}

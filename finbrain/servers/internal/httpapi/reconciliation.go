package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) getAccountReconciliation(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid account id")
		return
	}
	onDate := strings.TrimSpace(r.URL.Query().Get("date"))
	if onDate == "" {
		onDate = s.today()
	} else if _, err := domain.ParseDate(onDate, s.cfg.Location); err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "date must be YYYY-MM-DD")
		return
	}
	settledOnly := strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("settled_only")), "true")

	out, err := s.store.ReconcileAccount(r.Context(), userOf(r), id, onDate, settledOnly)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "账户不存在")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

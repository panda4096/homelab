package httpapi

import "net/http"

func (s *Server) listTemplates(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListAccountTemplates(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, items)
}

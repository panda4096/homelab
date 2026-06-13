package httpapi

import "net/http"

func (s *Server) listTemplates(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListAccountTemplates(r.Context())
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

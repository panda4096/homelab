package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) listInstitutions(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListInstitutions(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) getInstitution(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	in, err := s.store.GetInstitution(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "institution not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, in)
}

func (s *Server) createInstitution(w http.ResponseWriter, r *http.Request) {
	var in store.Institution
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid JSON body")
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "name is required")
		return
	}
	out, err := s.store.CreateInstitution(r.Context(), in)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "机构名已存在")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) patchInstitution(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	cur, err := s.store.GetInstitution(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "institution not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	var body struct {
		Name         *string `json:"name"`
		Kind         *string `json:"kind"`
		Note         *string `json:"note"`
		DisplayOrder *int    `json:"display_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid JSON body")
		return
	}
	if body.Name != nil {
		cur.Name = strings.TrimSpace(*body.Name)
	}
	if body.Kind != nil {
		cur.Kind = body.Kind
	}
	if body.Note != nil {
		cur.Note = body.Note
	}
	if body.DisplayOrder != nil {
		cur.DisplayOrder = *body.DisplayOrder
	}
	if cur.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "name is required")
		return
	}
	out, err := s.store.UpdateInstitution(r.Context(), cur)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "机构名已存在")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteInstitution(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	in, err := s.store.GetInstitution(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "institution not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if in.AccountCount > 0 {
		writeError(w, http.StatusConflict, "conflict", "该机构下还有账户,请先迁移或删除账户")
		return
	}
	if err := s.store.DeleteInstitution(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

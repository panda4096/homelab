package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) listInstitutions(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListInstitutions(r.Context())
	if err != nil {
		writeInternal(w, r, err)
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
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, in)
}

func (s *Server) createInstitution(w http.ResponseWriter, r *http.Request) {
	var in store.Institution
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "name is required")
		return
	}
	if msg := validateInstitutionText(in); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.CreateInstitution(r.Context(), in)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "机构名已存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
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
		writeInternal(w, r, err)
		return
	}
	var body struct {
		Name         *string `json:"name"`
		Kind         *string `json:"kind"`
		Note         *string `json:"note"`
		DisplayOrder *int    `json:"display_order"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Name != nil {
		cur.Name = strings.TrimSpace(*body.Name)
	}
	if body.Kind != nil {
		kind := strings.TrimSpace(*body.Kind)
		cur.Kind = &kind
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
	if msg := validateInstitutionText(cur); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpdateInstitution(r.Context(), cur)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "机构名已存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
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
	err = s.store.DeleteInstitutionIfEmpty(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "institution not found")
		return
	}
	if errors.Is(err, store.ErrInUse) || isForeignKeyViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该机构下还有账户,请先迁移或删除账户")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func validateInstitutionText(in store.Institution) string {
	if msg := validateTextLen("name", in.Name, maxNameLen); msg != "" {
		return msg
	}
	if msg := validateOptionalTextLen("kind", in.Kind, maxKindLen); msg != "" {
		return msg
	}
	return validateOptionalTextLen("note", in.Note, maxNoteLen)
}

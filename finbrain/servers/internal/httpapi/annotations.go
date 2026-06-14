package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

var annotationKinds = map[string]bool{"date": true, "account": true, "symbol": true, "position": true}

func (s *Server) listAnnotations(w http.ResponseWriter, r *http.Request) {
	from := strings.TrimSpace(r.URL.Query().Get("from"))
	to := strings.TrimSpace(r.URL.Query().Get("to"))
	items, err := s.store.ListAnnotations(r.Context(), userOf(r), from, to)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) createAnnotation(w http.ResponseWriter, r *http.Request) {
	var a store.Annotation
	if !decodeJSON(w, r, &a) {
		return
	}
	if msg := s.normalizeAndValidateAnnotation(&a); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.CreateAnnotation(r.Context(), userOf(r), a)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) patchAnnotation(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	var a store.Annotation
	if !decodeJSON(w, r, &a) {
		return
	}
	if msg := s.normalizeAndValidateAnnotation(&a); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpdateAnnotation(r.Context(), userOf(r), id, a)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "标注不存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteAnnotation(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteAnnotation(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "标注不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) normalizeAndValidateAnnotation(a *store.Annotation) string {
	a.AnchorKind = strings.ToLower(strings.TrimSpace(a.AnchorKind))
	a.EventDate = strings.TrimSpace(a.EventDate)
	a.Label = strings.TrimSpace(a.Label)
	if a.AnchorKind == "" {
		a.AnchorKind = "date"
	}
	if !annotationKinds[a.AnchorKind] {
		return "anchor_kind must be date / account / symbol / position"
	}
	if a.Label == "" {
		return "label is required"
	}
	if msg := validateTextLen("label", a.Label, 64); msg != "" {
		return msg
	}
	if msg := validateOptionalTextLen("body", a.Body, maxNoteLen); msg != "" {
		return msg
	}
	if _, err := domain.ParseDate(a.EventDate, s.cfg.Location); err != nil {
		return "event_date must be YYYY-MM-DD"
	}
	return ""
}

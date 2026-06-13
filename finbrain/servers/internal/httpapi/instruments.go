package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) listInstruments(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListInstruments(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) getInstrument(w http.ResponseWriter, r *http.Request) {
	i, err := s.store.GetInstrument(r.Context(), chi.URLParam(r, "symbol"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "instrument not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, i)
}

func (s *Server) upsertInstrument(w http.ResponseWriter, r *http.Request) {
	var in store.Instrument
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid JSON body")
		return
	}
	in.Symbol = strings.TrimSpace(in.Symbol)
	if in.Symbol == "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "symbol is required")
		return
	}
	out, err := s.store.UpsertInstrument(r.Context(), in)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// patchInstrument merges body fields onto the existing instrument at {symbol}.
func (s *Server) patchInstrument(w http.ResponseWriter, r *http.Request) {
	symbol := chi.URLParam(r, "symbol")
	cur, err := s.store.GetInstrument(r.Context(), symbol)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "instrument not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	var body struct {
		DisplayName   *string `json:"display_name"`
		Market        *string `json:"market"`
		QuoteCurrency *string `json:"quote_currency"`
		AssetKind     *string `json:"asset_kind"`
		IsBenchmark   *bool   `json:"is_benchmark"`
		Note          *string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid JSON body")
		return
	}
	if body.DisplayName != nil {
		cur.DisplayName = body.DisplayName
	}
	if body.Market != nil {
		cur.Market = body.Market
	}
	if body.QuoteCurrency != nil {
		cur.QuoteCurrency = body.QuoteCurrency
	}
	if body.AssetKind != nil {
		cur.AssetKind = body.AssetKind
	}
	if body.IsBenchmark != nil {
		cur.IsBenchmark = *body.IsBenchmark
	}
	if body.Note != nil {
		cur.Note = body.Note
	}
	out, err := s.store.UpsertInstrument(r.Context(), cur)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteInstrument(w http.ResponseWriter, r *http.Request) {
	err := s.store.DeleteInstrument(r.Context(), chi.URLParam(r, "symbol"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "instrument not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

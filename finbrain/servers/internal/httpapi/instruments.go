package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) listInstruments(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListInstruments(r.Context())
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) getInstrument(w http.ResponseWriter, r *http.Request) {
	i, err := s.store.GetInstrument(r.Context(), strings.ToUpper(strings.TrimSpace(chi.URLParam(r, "symbol"))))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "instrument not found")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, i)
}

func (s *Server) upsertInstrument(w http.ResponseWriter, r *http.Request) {
	var in store.Instrument
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Symbol = strings.ToUpper(strings.TrimSpace(in.Symbol))
	if in.Symbol == "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "symbol is required")
		return
	}
	normalizeInstrumentText(&in)
	if msg := validateInstrumentText(in); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpsertInstrument(r.Context(), in)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	// New instrument → fetch its full price history right away (idempotent, non-blocking).
	s.market.TriggerEnsureBackfilled(out.Symbol)
	writeJSON(w, http.StatusOK, out)
}

// patchInstrument merges body fields onto the existing instrument at {symbol}.
func (s *Server) patchInstrument(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(strings.TrimSpace(chi.URLParam(r, "symbol")))
	cur, err := s.store.GetInstrument(r.Context(), symbol)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "instrument not found")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
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
	if !decodeJSON(w, r, &body) {
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
	normalizeInstrumentText(&cur)
	if msg := validateInstrumentText(cur); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpsertInstrument(r.Context(), cur)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteInstrument(w http.ResponseWriter, r *http.Request) {
	err := s.store.DeleteInstrument(r.Context(), strings.ToUpper(strings.TrimSpace(chi.URLParam(r, "symbol"))))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "instrument not found")
		return
	}
	if errors.Is(err, store.ErrInUse) || isForeignKeyViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "标的仍被持仓引用,无法删除")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func normalizeInstrumentText(in *store.Instrument) {
	in.Symbol = strings.ToUpper(strings.TrimSpace(in.Symbol))
	if in.DisplayName != nil {
		v := strings.TrimSpace(*in.DisplayName)
		in.DisplayName = &v
	}
	if in.Market != nil {
		v := strings.TrimSpace(*in.Market)
		in.Market = &v
	}
	if in.QuoteCurrency != nil {
		v := strings.ToUpper(strings.TrimSpace(*in.QuoteCurrency))
		in.QuoteCurrency = &v
	}
	if in.AssetKind != nil {
		v := strings.TrimSpace(*in.AssetKind)
		in.AssetKind = &v
	}
}

func validateInstrumentText(in store.Instrument) string {
	if msg := validateTextLen("symbol", in.Symbol, maxSymbolLen); msg != "" {
		return msg
	}
	if msg := validateOptionalTextLen("display_name", in.DisplayName, maxNameLen); msg != "" {
		return msg
	}
	if msg := validateOptionalTextLen("market", in.Market, maxKindLen); msg != "" {
		return msg
	}
	if msg := validateOptionalTextLen("asset_kind", in.AssetKind, maxKindLen); msg != "" {
		return msg
	}
	return validateOptionalTextLen("note", in.Note, maxNoteLen)
}

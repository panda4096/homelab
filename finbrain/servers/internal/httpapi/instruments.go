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
	if s.market != nil {
		s.market.TriggerEnsureBackfilled(out.Symbol)
	}
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
	// Snapshot the fetch-relevant fields before merging, so we can re-backfill history if the edit
	// makes a previously un-fetchable instrument fetchable (e.g. market filled in after creation).
	beforeMarket, beforeKind, beforeCcy := ptrString(cur.Market), ptrString(cur.AssetKind), ptrString(cur.QuoteCurrency)
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
	// If market/asset_kind/quote_currency changed, the prior backfill marker (possibly set while the
	// instrument was un-fetchable) is stale: clear it and re-trigger so history is fetched anew.
	if s.market != nil &&
		(ptrString(out.Market) != beforeMarket || ptrString(out.AssetKind) != beforeKind || ptrString(out.QuoteCurrency) != beforeCcy) {
		if err := s.store.ResetMarketBackfill(r.Context(), out.Symbol); err != nil {
			writeInternal(w, r, err)
			return
		}
		s.market.TriggerEnsureBackfilled(out.Symbol)
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
		v := strings.ToUpper(strings.TrimSpace(*in.Market))
		in.Market = &v
	}
	if in.QuoteCurrency != nil {
		v := strings.ToUpper(strings.TrimSpace(*in.QuoteCurrency))
		in.QuoteCurrency = &v
	}
	if in.AssetKind != nil {
		v := strings.ToLower(strings.TrimSpace(*in.AssetKind))
		in.AssetKind = &v
	}
}

// Known enums for instruments. quote_currency feeds the valuation FX resolver and a bogus value
// silently degrades to a 1:1 fallback rate, so it (and market / asset_kind) is validated rather
// than stored as free text. Sets cover existing data plus the UI's options.
var (
	allowedMarkets    = map[string]bool{"US": true, "HK": true, "CN": true, "CRYPTO": true, "INDEX": true}
	allowedAssetKinds = map[string]bool{"equity": true, "etf": true, "fund": true, "crypto": true, "index": true, "cash": true}
)

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
	if in.QuoteCurrency != nil && *in.QuoteCurrency != "" && !currencyRe.MatchString(*in.QuoteCurrency) {
		return "quote_currency 须为 3 位 ISO 货币代码（如 USD / HKD / CNY）"
	}
	if in.Market != nil && *in.Market != "" && !allowedMarkets[*in.Market] {
		return "market 不支持：仅 US / HK / CN / CRYPTO / INDEX"
	}
	if in.AssetKind != nil && *in.AssetKind != "" && !allowedAssetKinds[*in.AssetKind] {
		return "asset_kind 不支持：仅 equity / etf / fund / crypto / index / cash"
	}
	return validateOptionalTextLen("note", in.Note, maxNoteLen)
}

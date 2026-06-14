package httpapi

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) listPrices(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListPrices(r.Context(), store.PriceFilter{
		Symbol:   r.URL.Query().Get("symbol"),
		DateFrom: r.URL.Query().Get("date_from"),
		DateTo:   r.URL.Query().Get("date_to"),
		Sort:     r.URL.Query().Get("sort"),
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) upsertPrice(w http.ResponseWriter, r *http.Request) {
	var p store.Price
	if !decodeJSON(w, r, &p) {
		return
	}
	normalizePrice(&p)
	if msg := validatePrice(p, s.cfg.Location); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpsertPrice(r.Context(), p)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) batchUpsertPrices(w http.ResponseWriter, r *http.Request) {
	var prices []store.Price
	if !decodeJSON(w, r, &prices) {
		return
	}
	errs := make([]batchRowError, 0)
	for i := range prices {
		normalizePrice(&prices[i])
		if msg := validatePrice(prices[i], s.cfg.Location); msg != "" {
			errs = append(errs, newBatchRowError("prices", i, "", "business_rule_violated", msg))
		}
	}
	if len(errs) > 0 {
		writeErrorDetails(w, http.StatusUnprocessableEntity, "business_rule_violated", "价格批量导入存在无效行", errs)
		return
	}
	out, err := s.store.BatchUpsertPrices(r.Context(), prices)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out, "count": len(out)})
}

func (s *Server) patchPrice(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	var p store.Price
	if !decodeJSON(w, r, &p) {
		return
	}
	normalizePrice(&p)
	if msg := validatePricePatch(p, s.cfg.Location); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpdatePrice(r.Context(), id, p)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "price not found")
		return
	}
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该标的在该日期已有价格")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deletePrice(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeletePrice(r.Context(), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "price not found")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listFxRates(w http.ResponseWriter, r *http.Request) {
	base := r.URL.Query().Get("base")
	if base == "" {
		base = r.URL.Query().Get("base_currency")
	}
	quote := r.URL.Query().Get("quote")
	if quote == "" {
		quote = r.URL.Query().Get("quote_currency")
	}
	items, err := s.store.ListFxRates(r.Context(), store.FxRateFilter{
		BaseCurrency:  base,
		QuoteCurrency: quote,
		DateFrom:      r.URL.Query().Get("date_from"),
		DateTo:        r.URL.Query().Get("date_to"),
		Sort:          r.URL.Query().Get("sort"),
	})
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) upsertFxRate(w http.ResponseWriter, r *http.Request) {
	var f store.FxRate
	if !decodeJSON(w, r, &f) {
		return
	}
	normalizeFxRate(&f)
	if msg := validateFxRate(f, s.cfg.Location); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpsertFxRate(r.Context(), f)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) batchUpsertFxRates(w http.ResponseWriter, r *http.Request) {
	var rates []store.FxRate
	if !decodeJSON(w, r, &rates) {
		return
	}
	errs := make([]batchRowError, 0)
	for i := range rates {
		normalizeFxRate(&rates[i])
		if msg := validateFxRate(rates[i], s.cfg.Location); msg != "" {
			errs = append(errs, newBatchRowError("fx_rates", i, "", "business_rule_violated", msg))
		}
	}
	if len(errs) > 0 {
		writeErrorDetails(w, http.StatusUnprocessableEntity, "business_rule_violated", "汇率批量导入存在无效行", errs)
		return
	}
	out, err := s.store.BatchUpsertFxRates(r.Context(), rates)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out, "count": len(out)})
}

func (s *Server) patchFxRate(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	var f store.FxRate
	if !decodeJSON(w, r, &f) {
		return
	}
	normalizeFxRate(&f)
	if msg := validateFxRatePatch(f, s.cfg.Location); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.UpdateFxRate(r.Context(), id, f)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "fx rate not found")
		return
	}
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该币种对在该日期已有汇率")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteFxRate(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteFxRate(r.Context(), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "fx rate not found")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) getValuation(w http.ResponseWriter, r *http.Request) {
	prefs, err := s.store.GetPreferences(r.Context())
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	onDate := strings.TrimSpace(r.URL.Query().Get("date"))
	if onDate == "" {
		onDate = s.today()
	}
	if err := domain.ValidateSnapshotDate(onDate, s.cfg.Location); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", err.Error())
		return
	}
	displayCurrency := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("display_currency")))
	if displayCurrency == "" {
		displayCurrency = prefs.DisplayCurrency
	}
	if !currencyRe.MatchString(displayCurrency) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "display_currency must be a 3-letter ISO code")
		return
	}
	fxMode := strings.TrimSpace(r.URL.Query().Get("fx_mode"))
	if fxMode == "" {
		fxMode = prefs.FxMode
	}
	if !oneOf(fxMode, "current", "historical") {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "fx_mode must be current|historical")
		return
	}
	out, err := s.store.GetValuation(r.Context(), onDate, displayCurrency, fxMode, s.today())
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func normalizePrice(p *store.Price) {
	p.Symbol = strings.ToUpper(strings.TrimSpace(p.Symbol))
	p.PriceDate = strings.TrimSpace(p.PriceDate)
	p.Price = strings.TrimSpace(p.Price)
	p.Currency = strings.ToUpper(strings.TrimSpace(p.Currency))
	p.Source = strings.TrimSpace(p.Source)
	if p.Source == "" {
		p.Source = "manual"
	}
}

func normalizeFxRate(f *store.FxRate) {
	f.BaseCurrency = strings.ToUpper(strings.TrimSpace(f.BaseCurrency))
	f.QuoteCurrency = strings.ToUpper(strings.TrimSpace(f.QuoteCurrency))
	f.RateDate = strings.TrimSpace(f.RateDate)
	f.Rate = strings.TrimSpace(f.Rate)
	f.Source = strings.TrimSpace(f.Source)
	if f.Source == "" {
		f.Source = "manual"
	}
}

func validatePrice(p store.Price, loc *time.Location) string {
	if p.Symbol == "" {
		return "symbol is required"
	}
	if msg := validateTextLen("symbol", p.Symbol, maxSymbolLen); msg != "" {
		return msg
	}
	return validatePricePatch(p, loc)
}

func validatePricePatch(p store.Price, loc *time.Location) string {
	if msg := validateOptionalTextLen("note", p.Note, maxNoteLen); msg != "" {
		return msg
	}
	if msg := validateTextLen("source", p.Source, maxKindLen); msg != "" {
		return msg
	}
	if err := domain.ValidateSnapshotDate(p.PriceDate, loc); err != nil {
		return err.Error()
	}
	if !positiveDecimal(p.Price) {
		return "price must be > 0"
	}
	if !currencyRe.MatchString(p.Currency) {
		return "currency must be a 3-letter ISO code"
	}
	return ""
}

func validateFxRate(f store.FxRate, loc *time.Location) string {
	if !currencyRe.MatchString(f.BaseCurrency) || !currencyRe.MatchString(f.QuoteCurrency) {
		return "base_currency and quote_currency must be 3-letter ISO codes"
	}
	if f.BaseCurrency == f.QuoteCurrency {
		return "base_currency and quote_currency must differ"
	}
	return validateFxRatePatch(f, loc)
}

func validateFxRatePatch(f store.FxRate, loc *time.Location) string {
	if msg := validateOptionalTextLen("note", f.Note, maxNoteLen); msg != "" {
		return msg
	}
	if msg := validateTextLen("source", f.Source, maxKindLen); msg != "" {
		return msg
	}
	if err := domain.ValidateSnapshotDate(f.RateDate, loc); err != nil {
		return err.Error()
	}
	if !positiveDecimal(f.Rate) {
		return "rate must be > 0"
	}
	return ""
}

func positiveDecimal(s string) bool {
	if !validDecimal(s) || isNegativeDecimal(s) {
		return false
	}
	for _, ch := range strings.TrimSpace(s) {
		if ch >= '1' && ch <= '9' {
			return true
		}
	}
	return false
}

package httpapi

import (
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
)

var trendGranularities = map[string]bool{"day": true, "month": true, "quarter": true, "year": true}

func (s *Server) getTrend(w http.ResponseWriter, r *http.Request) {
	prefs, err := s.store.GetPreferences(r.Context())
	if err != nil {
		writeInternal(w, r, err)
		return
	}

	to := strings.TrimSpace(r.URL.Query().Get("to"))
	if to == "" {
		to = s.today()
	}
	toT, err := domain.ParseDate(to, s.cfg.Location)
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "to must be YYYY-MM-DD")
		return
	}

	from := strings.TrimSpace(r.URL.Query().Get("from"))
	if from == "" {
		from = toT.AddDate(0, -12, 0).Format("2006-01-02")
	} else if _, err := domain.ParseDate(from, s.cfg.Location); err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "from must be YYYY-MM-DD")
		return
	}

	gran := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("granularity")))
	if gran == "" {
		gran = prefs.TimeAggregationDefault
	}
	if !trendGranularities[gran] {
		gran = "month"
	}

	displayCurrency := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("display_currency")))
	if displayCurrency == "" {
		displayCurrency = prefs.DisplayCurrency
	}
	if !currencyRe.MatchString(displayCurrency) {
		writeError(w, http.StatusBadRequest, "validation_failed", "display_currency must be a 3-letter ISO code")
		return
	}

	fxMode := strings.TrimSpace(r.URL.Query().Get("fx_mode"))
	if fxMode == "" {
		fxMode = prefs.FxMode
	}
	if fxMode != "current" && fxMode != "historical" {
		fxMode = "current"
	}

	series, err := s.store.NetWorthTrend(r.Context(), from, to, gran, displayCurrency, fxMode)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, series)
}

package httpapi

import (
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
)

func (s *Server) getAttribution(w http.ResponseWriter, r *http.Request) {
	from := strings.TrimSpace(r.URL.Query().Get("from"))
	to := strings.TrimSpace(r.URL.Query().Get("to"))
	if to == "" {
		to = s.today()
	}
	if _, err := domain.ParseDate(from, s.cfg.Location); err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "from must be YYYY-MM-DD")
		return
	}
	if _, err := domain.ParseDate(to, s.cfg.Location); err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "to must be YYYY-MM-DD")
		return
	}
	prefs, err := s.store.GetPreferences(r.Context())
	if err != nil {
		writeInternal(w, r, err)
		return
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
	out, err := s.store.PeriodAttribution(r.Context(), from, to, displayCurrency, fxMode)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

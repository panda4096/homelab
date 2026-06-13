package httpapi

import "net/http"

func (s *Server) getPreferences(w http.ResponseWriter, r *http.Request) {
	p, err := s.store.GetPreferences(r.Context())
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// putPreferences merges provided fields onto the current row (PATCH-like), so the
// frontend can send just the changed key (e.g. display_currency).
func (s *Server) putPreferences(w http.ResponseWriter, r *http.Request) {
	cur, err := s.store.GetPreferences(r.Context())
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	var body struct {
		DisplayCurrency        *string `json:"display_currency"`
		FxMode                 *string `json:"fx_mode"`
		TimeAggregationDefault *string `json:"time_aggregation_default"`
		MarketConvention       *string `json:"market_convention"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.DisplayCurrency != nil {
		cur.DisplayCurrency = *body.DisplayCurrency
	}
	if body.FxMode != nil {
		cur.FxMode = *body.FxMode
	}
	if body.TimeAggregationDefault != nil {
		cur.TimeAggregationDefault = *body.TimeAggregationDefault
	}
	if body.MarketConvention != nil {
		cur.MarketConvention = *body.MarketConvention
	}
	if !oneOf(cur.FxMode, "current", "historical") {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "fx_mode must be current|historical")
		return
	}
	if !oneOf(cur.TimeAggregationDefault, "day", "month", "quarter", "year") {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "time_aggregation_default must be day|month|quarter|year")
		return
	}
	if !oneOf(cur.MarketConvention, "western", "cn") {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "market_convention must be western|cn")
		return
	}
	out, err := s.store.UpdatePreferences(r.Context(), cur)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func oneOf(v string, allowed ...string) bool {
	for _, a := range allowed {
		if v == a {
			return true
		}
	}
	return false
}

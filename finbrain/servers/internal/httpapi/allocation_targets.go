package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/shopspring/decimal"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func (s *Server) listAllocationTargets(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListAllocationTargetSets(r.Context(), userOf(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) createAllocationTarget(w http.ResponseWriter, r *http.Request) {
	var set store.AllocationTargetSet
	if !decodeJSON(w, r, &set) {
		return
	}
	set.ID = 0
	if msg := normalizeAndValidateTargetSet(&set); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.SaveAllocationTargetSet(r.Context(), userOf(r), set)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "目标配置名称已存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) patchAllocationTarget(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	var set store.AllocationTargetSet
	if !decodeJSON(w, r, &set) {
		return
	}
	set.ID = id
	if msg := normalizeAndValidateTargetSet(&set); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	out, err := s.store.SaveAllocationTargetSet(r.Context(), userOf(r), set)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "目标配置不存在")
		return
	}
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "目标配置名称已存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteAllocationTarget(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteAllocationTargetSet(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "目标配置不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) getAllocationTargetDrift(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	prefs, err := s.store.GetPreferences(r.Context(), userOf(r))
	if err != nil {
		writeInternal(w, r, err)
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
	if fxMode != "current" && fxMode != "historical" {
		fxMode = "current"
	}
	out, err := s.store.EvaluateDrift(r.Context(), userOf(r), id, s.today(r.Context()), displayCurrency, fxMode)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "目标配置不存在")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func normalizeAndValidateTargetSet(set *store.AllocationTargetSet) string {
	set.Name = strings.TrimSpace(set.Name)
	set.Dimension = strings.TrimSpace(set.Dimension)
	set.DriftThresholdPct = strings.TrimSpace(set.DriftThresholdPct)
	if set.Name == "" {
		return "name is required"
	}
	if msg := validateTextLen("name", set.Name, maxNameLen); msg != "" {
		return msg
	}
	if set.Dimension == "" {
		return "dimension is required"
	}
	if msg := validateTextLen("dimension", set.Dimension, maxKindLen); msg != "" {
		return msg
	}
	if set.DriftThresholdPct == "" {
		set.DriftThresholdPct = "5"
	}
	if !validDecimal(set.DriftThresholdPct) || !positiveDecimal(set.DriftThresholdPct) {
		return "drift_threshold_pct must be > 0"
	}
	if msg := validateOptionalTextLen("note", set.Note, maxNoteLen); msg != "" {
		return msg
	}
	if len(set.Items) == 0 {
		return "至少需要一个目标项"
	}
	// Sum target percentages in decimal (not float64) to stay consistent with the rest of the
	// money/percentage pipeline and avoid binary-float accumulation drift.
	sum := decimal.Zero
	seen := map[string]bool{}
	for i := range set.Items {
		it := &set.Items[i]
		it.DimensionValue = strings.TrimSpace(it.DimensionValue)
		it.TargetPct = strings.TrimSpace(it.TargetPct)
		if it.DimensionValue == "" {
			return "目标项维度值必填"
		}
		if seen[it.DimensionValue] {
			return "目标项维度值重复: " + it.DimensionValue
		}
		seen[it.DimensionValue] = true
		if msg := validateTextLen("dimension_value", it.DimensionValue, maxSymbolLen); msg != "" {
			return msg
		}
		if !validDecimal(it.TargetPct) || !positiveDecimal(it.TargetPct) {
			return "target_pct must be > 0"
		}
		d, err := decimal.NewFromString(it.TargetPct)
		if err != nil {
			return "target_pct must be > 0"
		}
		sum = sum.Add(d)
	}
	// Keep a small tolerance (0.01) so e.g. 33.33+33.33+33.34 and minor rounding still validate.
	if sum.Sub(decimal.NewFromInt(100)).Abs().GreaterThan(decimal.NewFromFloat(0.01)) {
		return "目标项百分比之和必须等于 100（当前 " + sum.StringFixed(2) + "）"
	}
	return ""
}

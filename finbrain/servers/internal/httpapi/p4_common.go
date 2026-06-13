package httpapi

import (
	"net/http"
	"strconv"
	"strings"
)

// queryInt64 parses an int64 query param (0 if absent/invalid).
func queryInt64(r *http.Request, key string) int64 {
	v, _ := strconv.ParseInt(strings.TrimSpace(r.URL.Query().Get(key)), 10, 64)
	return v
}

// queryLimit parses a positive `limit` query param (0 → store default).
func queryLimit(r *http.Request) int {
	n, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("limit")))
	if n < 0 {
		return 0
	}
	return n
}

// listResponse wraps a list with the truncation flags (PLAN §2.1).
func listResponse(items any, truncated bool, limit int) map[string]any {
	if limit <= 0 {
		limit = marketDataLimitFallback
	}
	return map[string]any{"items": items, "truncated": truncated, "limit": limit}
}

const marketDataLimitFallback = 5000

package httpapi

import (
	"context"
	"net/http"
	"time"
)

// marketStatus returns the latest stored price date per symbol, for staleness display.
func (s *Server) marketStatus(w http.ResponseWriter, r *http.Request) {
	rows, err := s.store.MarketDataStatus(r.Context())
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":  s.market != nil,
		"interval": s.cfg.MarketDataInterval.String(),
		"items":    rows,
	})
}

// marketRefresh triggers an immediate latest-price refresh and waits for it (bounded).
func (s *Server) marketRefresh(w http.ResponseWriter, r *http.Request) {
	if s.market == nil {
		writeError(w, http.StatusServiceUnavailable, "market_disabled", "行情自动获取未启用")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	if err := s.market.RefreshLatest(ctx); err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}

// marketBackfill kicks off a full-history backfill in the background and returns 202.
func (s *Server) marketBackfill(w http.ResponseWriter, r *http.Request) {
	if s.market == nil {
		writeError(w, http.StatusServiceUnavailable, "market_disabled", "行情自动获取未启用")
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		_ = s.market.Backfill(ctx)
	}()
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "backfill_started"})
}

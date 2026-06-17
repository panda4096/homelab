package httpapi

import (
	"context"
	"log"
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

// marketResolve validates a user-entered instrument: it probes the upstream feed for the given
// symbol/market/asset_kind and reports whether a price is fetchable (with the latest value).
func (s *Server) marketResolve(w http.ResponseWriter, r *http.Request) {
	if s.market == nil {
		writeError(w, http.StatusServiceUnavailable, "market_disabled", "行情自动获取未启用")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	q := r.URL.Query()
	res := s.market.Resolve(ctx, q.Get("symbol"), q.Get("market"), q.Get("asset_kind"))
	writeJSON(w, http.StatusOK, res)
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
	// ?reset=true first wipes auto-fetched prices (keeps manual) + clears markers, for a clean
	// re-fetch after the adjustment basis changes. Destructive but bounded to source<>'manual'.
	reset := r.URL.Query().Get("reset") == "true"
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
		defer cancel()
		if reset {
			n, err := s.store.DeleteAutoPrices(ctx)
			if err != nil {
				log.Printf("[market] backfill reset (prices): %v", err)
				return
			}
			log.Printf("[market] backfill reset: deleted %d auto price rows", n)
			if err := s.store.ResetMarketBackfill(ctx); err != nil {
				log.Printf("[market] backfill reset (markers): %v", err)
			}
		}
		_ = s.market.Backfill(ctx)
	}()
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "backfill_started", "reset": reset})
}

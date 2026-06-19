// Command finbrain is the single binary for the finbrain backend.
//
//	finbrain serve            # start the HTTP server (+ market-data scheduler); auto-applies pending up migrations
//	finbrain migrate [up|down|status]  # manual control; down/rollback is never run automatically
//	finbrain seed             # load dev seed data
//	finbrain backfill [sym…]  # fetch full price history (all instruments when no args)
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
	"github.com/panda4096/homelab/finbrain/servers/internal/httpapi"
	"github.com/panda4096/homelab/finbrain/servers/internal/market"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: finbrain <serve|migrate|seed|backfill> [args]")
	}
	cmd := os.Args[1]

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	// Enforce the configured timezone process-wide so all "today" logic agrees (PLAN §2.2).
	time.Local = cfg.Location

	switch cmd {
	case "backfill":
		// finbrain backfill [--reset] [sym…]
		// --reset first DELETEs auto-fetched prices (keeps manual) + clears backfill markers, so
		// history is re-fetched from scratch (use after changing the adjustment basis).
		ctx := context.Background()
		reset := false
		var syms []string
		for _, a := range os.Args[2:] {
			if a == "--reset" {
				reset = true
			} else {
				syms = append(syms, a)
			}
		}
		st, err := store.New(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("db: %v", err)
		}
		defer st.Close()
		mkt := market.New(cfg, st)
		if reset {
			n, err := st.DeleteAutoPrices(ctx, syms...)
			if err != nil {
				log.Fatalf("backfill reset (prices): %v", err)
			}
			if err := st.ResetMarketBackfill(ctx, syms...); err != nil {
				log.Fatalf("backfill reset (markers): %v", err)
			}
			log.Printf("backfill reset: deleted %d auto price rows", n)
		}
		if err := mkt.Backfill(ctx, syms...); err != nil {
			log.Fatalf("backfill: %v", err)
		}
		log.Print("backfill: ok")

	case "migrate":
		dir := "up"
		if len(os.Args) > 2 {
			dir = os.Args[2]
		}
		if err := store.Migrate(cfg.DatabaseURL, dir); err != nil {
			log.Fatalf("migrate: %v", err)
		}
		log.Printf("migrate %s: ok", dir)

	case "seed":
		if err := store.Seed(cfg.DatabaseURL); err != nil {
			log.Fatalf("seed: %v", err)
		}
		log.Print("seed: ok")

	case "serve":
		ctx := context.Background()
		// Auto-apply pending schema migrations (forward only) on startup, so a fresh or lagging DB
		// is brought up to date without a manual step. This NEVER runs down/rollback — destructive
		// migration commands stay manual-only (finbrain migrate down). goose.Up is idempotent: when
		// nothing is pending it's a no-op.
		if err := store.Migrate(cfg.DatabaseURL, "up"); err != nil {
			log.Fatalf("auto-migrate: %v", err)
		}
		st, err := store.New(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("db: %v", err)
		}
		defer st.Close()

		var mkt *market.Service
		if cfg.MarketDataEnabled {
			mkt = market.New(cfg, st)
		}

		srv := &http.Server{
			Addr:              ":" + cfg.Port,
			Handler:           httpapi.NewRouter(cfg, st, mkt),
			ReadHeaderTimeout: 10 * time.Second,
		}
		log.Printf("finbrain serve on :%s (env=%s tz=%s)", cfg.Port, cfg.Env, cfg.Timezone)
		// Market scheduler is a background side-car: launched after the server is wired so the
		// startup log reads server-first, and it never blocks request serving (own goroutine).
		if mkt != nil {
			go mkt.Start(ctx)
		}
		if err := srv.ListenAndServe(); err != nil {
			log.Fatal(err)
		}

	default:
		log.Fatalf("unknown command %q (want serve|migrate|seed|backfill)", cmd)
	}
}

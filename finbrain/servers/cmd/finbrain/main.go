// Command finbrain is the single binary for the finbrain backend.
//
//	finbrain serve            # start the HTTP server (+ market-data scheduler)
//	finbrain migrate [up|down|status]
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
		ctx := context.Background()
		st, err := store.New(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("db: %v", err)
		}
		defer st.Close()
		mkt := market.New(cfg, st)
		if err := mkt.Backfill(ctx, os.Args[2:]...); err != nil {
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
		st, err := store.New(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("db: %v", err)
		}
		defer st.Close()

		var mkt *market.Service
		if cfg.MarketDataEnabled {
			mkt = market.New(cfg, st)
			go mkt.Start(ctx)
		}

		srv := &http.Server{
			Addr:              ":" + cfg.Port,
			Handler:           httpapi.NewRouter(cfg, st, mkt),
			ReadHeaderTimeout: 10 * time.Second,
		}
		log.Printf("finbrain serve on :%s (env=%s tz=%s)", cfg.Port, cfg.Env, cfg.Timezone)
		if err := srv.ListenAndServe(); err != nil {
			log.Fatal(err)
		}

	default:
		log.Fatalf("unknown command %q (want serve|migrate|seed|backfill)", cmd)
	}
}

// Command finbrain is the single binary for the finbrain backend.
//
//	finbrain serve            # start the HTTP server
//	finbrain migrate [up|down|status]
//	finbrain seed             # load dev seed data
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
	"github.com/panda4096/homelab/finbrain/servers/internal/httpapi"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: finbrain <serve|migrate|seed> [args]")
	}
	cmd := os.Args[1]

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	// Enforce the configured timezone process-wide so all "today" logic agrees (PLAN §2.2).
	time.Local = cfg.Location

	switch cmd {
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

		srv := &http.Server{
			Addr:              ":" + cfg.Port,
			Handler:           httpapi.NewRouter(cfg, st),
			ReadHeaderTimeout: 10 * time.Second,
		}
		log.Printf("finbrain serve on :%s (env=%s tz=%s)", cfg.Port, cfg.Env, cfg.Timezone)
		if err := srv.ListenAndServe(); err != nil {
			log.Fatal(err)
		}

	default:
		log.Fatalf("unknown command %q (want serve|migrate|seed)", cmd)
	}
}

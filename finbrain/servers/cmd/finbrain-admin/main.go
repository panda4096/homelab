// Command finbrain-admin contains operator-only maintenance commands.
package main

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	authpkg "github.com/panda4096/homelab/finbrain/servers/internal/auth"
	"github.com/panda4096/homelab/finbrain/servers/internal/config"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: finbrain-admin set-password <username> <temporary-password>")
	}
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	time.Local = cfg.Location

	switch os.Args[1] {
	case "set-password":
		if len(os.Args) != 4 {
			log.Fatal("usage: finbrain-admin set-password <username> <temporary-password>")
		}
		if err := setPassword(cfg, os.Args[2], os.Args[3]); err != nil {
			log.Fatalf("set-password: %v", err)
		}
		log.Print("set-password: ok")
	default:
		log.Fatalf("unknown command %q", os.Args[1])
	}
}

func setPassword(cfg *config.Config, username, temporaryPassword string) error {
	username = strings.ToLower(strings.TrimSpace(username))
	ctx := context.Background()
	st, err := store.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer st.Close()

	identity, err := st.GetPasswordIdentity(ctx, username)
	if err != nil {
		return err
	}
	hash, err := authpkg.HashPassword(temporaryPassword)
	if err != nil {
		return err
	}
	if err := st.SetPassword(ctx, identity.UserID, hash, true); err != nil {
		return err
	}
	return st.RevokeUserSessions(ctx, identity.UserID)
}

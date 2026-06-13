package httpapi

import (
	"net/http"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
)

// authMiddleware is pluggable (PRD §9 / PLAN §2.4): in dev it allows everything;
// in production, if FINBRAIN_AUTH_HEADER is set it requires that header (injected
// by the reverse proxy after SSO). The concrete auth form is decided at deploy.
func authMiddleware(cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if cfg.IsDev() {
				next.ServeHTTP(w, r)
				return
			}
			if cfg.AuthHeader != "" && r.Header.Get(cfg.AuthHeader) == "" {
				writeError(w, http.StatusUnauthorized, "unauthorized", "missing identity header")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

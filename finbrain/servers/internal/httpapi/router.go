package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

// Server holds handler dependencies.
type Server struct {
	cfg   *config.Config
	store *store.Store
}

// NewRouter builds the HTTP handler: /healthz, /api/*, and optional static frontend.
func NewRouter(cfg *config.Config, st *store.Store) http.Handler {
	s := &Server{cfg: cfg, store: st}

	r := chi.NewRouter()
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger) // logs method/path only — never amounts (PLAN §2.4)
	r.Use(chimw.Recoverer)

	r.Get("/healthz", s.handleHealthz)

	r.Route("/api", func(r chi.Router) {
		r.Use(authMiddleware(cfg))

		r.Get("/preferences", s.getPreferences)
		r.Put("/preferences", s.putPreferences)

		r.Get("/instruments", s.listInstruments)
		r.Post("/instruments", s.upsertInstrument)
		r.Get("/instruments/{symbol}", s.getInstrument)
		r.Patch("/instruments/{symbol}", s.patchInstrument)
		r.Delete("/instruments/{symbol}", s.deleteInstrument)

		r.Get("/account-templates", s.listTemplates)

		// P1: institutions
		r.Get("/institutions", s.listInstitutions)
		r.Post("/institutions", s.createInstitution)
		r.Get("/institutions/{id}", s.getInstitution)
		r.Patch("/institutions/{id}", s.patchInstitution)
		r.Delete("/institutions/{id}", s.deleteInstitution)

		// P1: accounts
		r.Get("/accounts", s.listAccounts)
		r.Post("/accounts", s.createAccount)
		r.Post("/accounts/from-template", s.createAccountsFromTemplate)
		r.Get("/accounts/{id}", s.getAccount)
		r.Patch("/accounts/{id}", s.patchAccount)
		r.Delete("/accounts/{id}", s.deleteAccount)
		r.Get("/accounts/{id}/balance-snapshots", s.listAccountBalanceSnapshots)
		r.Get("/accounts/{id}/position-snapshots", s.listAccountPositionSnapshots)
		r.Get("/accounts/{id}/positions", s.listAccountPositions)

		// P1: snapshots
		r.Post("/balance-snapshots", s.upsertBalanceSnapshot)
		r.Patch("/balance-snapshots/{id}", s.patchBalanceSnapshot)
		r.Delete("/balance-snapshots/{id}", s.deleteBalanceSnapshot)
		r.Post("/position-snapshots", s.upsertPositionSnapshot)
		r.Patch("/position-snapshots/{id}", s.patchPositionSnapshot)
		r.Delete("/position-snapshots/{id}", s.deletePositionSnapshot)
	})

	if cfg.StaticDir != "" {
		s.mountStatic(r)
	}
	return r
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

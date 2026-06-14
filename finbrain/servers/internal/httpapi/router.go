package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
	"github.com/panda4096/homelab/finbrain/servers/internal/llm"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

// Server holds handler dependencies.
type Server struct {
	cfg   *config.Config
	store *store.Store
	llm   *llm.Client
}

// NewRouter builds the HTTP handler: /healthz, /api/*, and optional static frontend.
func NewRouter(cfg *config.Config, st *store.Store) http.Handler {
	s := &Server{cfg: cfg, store: st, llm: llm.New(cfg)}

	r := chi.NewRouter()
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger) // logs method/path only — never amounts (PLAN §2.4)
	r.Use(chimw.Recoverer)

	r.Get("/healthz", s.handleHealthz)

	r.Route("/api", func(r chi.Router) {
		r.Use(maxBodyMiddleware)
		r.Use(authMiddleware(cfg))
		r.Use(s.mutationAuditMiddleware)

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
		r.Get("/accounts/{id}/credit-card-bills", s.listAccountCreditCardBills)
		r.Get("/accounts/{id}/reconciliation", s.getAccountReconciliation)

		// P1: snapshots
		r.Post("/balance-snapshots", s.upsertBalanceSnapshot)
		r.Patch("/balance-snapshots/{id}", s.patchBalanceSnapshot)
		r.Delete("/balance-snapshots/{id}", s.deleteBalanceSnapshot)
		r.Post("/position-snapshots", s.upsertPositionSnapshot)
		r.Patch("/position-snapshots/{id}", s.patchPositionSnapshot)
		r.Delete("/position-snapshots/{id}", s.deletePositionSnapshot)

		// P2: market data and valuation
		r.Get("/prices", s.listPrices)
		r.Post("/prices", s.upsertPrice)
		r.Post("/prices/batch", s.batchUpsertPrices)
		r.Patch("/prices/{id}", s.patchPrice)
		r.Delete("/prices/{id}", s.deletePrice)
		r.Get("/fx-rates", s.listFxRates)
		r.Post("/fx-rates", s.upsertFxRate)
		r.Post("/fx-rates/batch", s.batchUpsertFxRates)
		r.Patch("/fx-rates/{id}", s.patchFxRate)
		r.Delete("/fx-rates/{id}", s.deleteFxRate)
		r.Get("/valuation", s.getValuation)
		r.Get("/trend", s.getTrend)
		r.Get("/attribution", s.getAttribution)

		// P3: monthly review and credit-card liabilities
		r.Get("/credit-card-bills", s.listCreditCardBills)
		r.Post("/credit-card-bills", s.upsertCreditCardBill)
		r.Patch("/credit-card-bills/{id}", s.patchCreditCardBill)
		r.Delete("/credit-card-bills/{id}", s.deleteCreditCardBill)
		r.Post("/reviews/batch", s.submitReviewBatch)

		// P4: transactions / transfers / income events / corporate actions
		r.Get("/transactions", s.listTransactions)
		r.Post("/transactions", s.createTransaction)
		r.Patch("/transactions/{id}", s.patchTransaction)
		r.Delete("/transactions/{id}", s.deleteTransaction)
		r.Get("/transfers", s.listTransfers)
		r.Post("/transfers", s.createTransfer)
		r.Patch("/transfers/{id}", s.patchTransfer)
		r.Delete("/transfers/{id}", s.deleteTransfer)
		r.Get("/income-events", s.listIncomeEvents)
		r.Post("/income-events", s.createIncomeEvent)
		r.Patch("/income-events/{id}", s.patchIncomeEvent)
		r.Delete("/income-events/{id}", s.deleteIncomeEvent)
		r.Get("/corporate-actions", s.listCorporateActions)
		r.Post("/corporate-actions", s.createCorporateAction)
		r.Patch("/corporate-actions/{id}", s.patchCorporateAction)
		r.Delete("/corporate-actions/{id}", s.deleteCorporateAction)

		// P5: trend / allocation targets
		r.Get("/allocation-targets", s.listAllocationTargets)
		r.Post("/allocation-targets", s.createAllocationTarget)
		r.Get("/allocation-targets/{id}/drift", s.getAllocationTargetDrift)
		r.Patch("/allocation-targets/{id}", s.patchAllocationTarget)
		r.Delete("/allocation-targets/{id}", s.deleteAllocationTarget)

		// P6: LLM status + stage summaries. NL→SQL/draft removed — all NL now goes
		// through the P8 skill layer (/agent/plan → registered skills, no SQL).
		r.Get("/llm/status", s.getLLMStatus)
		r.Get("/summaries", s.listSummaries)
		r.Post("/summaries/generate", s.generateSummary)
		r.Get("/summaries/{id}", s.getSummary)
		r.Delete("/summaries/{id}", s.deleteSummary)

		// P5: annotations (timeline notes)
		r.Get("/annotations", s.listAnnotations)
		r.Post("/annotations", s.createAnnotation)
		r.Patch("/annotations/{id}", s.patchAnnotation)
		r.Delete("/annotations/{id}", s.deleteAnnotation)

		// P7: data export
		r.Get("/export", s.exportData)

		// P8: agent skill layer (no SQL — read/draft/apply via registered skills),
		// API-key management for external agents, and the unified audit log.
		r.Get("/api-keys", s.listAPIKeys)
		r.Post("/api-keys", s.createAPIKey)
		r.Delete("/api-keys/{id}", s.deleteAPIKey)
		r.Get("/audit", s.listAuditEvents)
		r.Route("/agent", func(r chi.Router) {
			r.Use(s.agentAuthMiddleware)
			r.Get("/skills", s.listAgentSkills)
			r.Post("/plan", s.planAgent)
			r.Post("/run", s.runAgentSkill)
			r.Post("/apply", s.applyAgentSkill)
		})
	})

	if cfg.StaticDir != "" {
		s.mountStatic(r)
	}
	return r
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

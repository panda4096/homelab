package httpapi

import (
	"archive/zip"
	"encoding/csv"
	"fmt"
	"net/http"
)

// exportTables is the whitelist of tables included in the data export (§7.20).
// Fixed list — never user input — so the SELECT is injection-safe.
var exportTables = []string{
	"institutions", "accounts", "instruments",
	"balance_snapshots", "position_snapshots",
	"prices", "fx_rates", "credit_card_bills",
	"transactions", "transfers", "income_events", "corporate_actions",
	"allocation_target_sets", "allocation_target_items", "annotations", "summaries",
}

func (s *Server) exportData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="finbrain-export.zip"`)
	zw := zip.NewWriter(w)
	defer zw.Close()

	for _, table := range exportTables {
		res, err := s.store.RunReadOnlyQuery(r.Context(), "SELECT * FROM "+table+" ORDER BY 1", 1_000_000)
		if err != nil {
			// Best-effort: skip a table that fails rather than abort the whole zip.
			continue
		}
		f, err := zw.Create(table + ".csv")
		if err != nil {
			return
		}
		cw := csv.NewWriter(f)
		_ = cw.Write(res.Columns)
		for _, row := range res.Rows {
			rec := make([]string, len(row))
			for i, c := range row {
				if c == nil {
					rec[i] = ""
				} else {
					rec[i] = fmt.Sprint(c)
				}
			}
			_ = cw.Write(rec)
		}
		cw.Flush()
	}
}

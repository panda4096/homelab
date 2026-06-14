package httpapi

import (
	"archive/zip"
	"bytes"
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
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	for _, table := range exportTables {
		res, err := s.store.RunReadOnlyQuery(r.Context(), "SELECT * FROM "+table+" ORDER BY 1", 1_000_000)
		if err != nil {
			_ = zw.Close()
			writeStorageError(w, r, err)
			return
		}
		f, err := zw.Create(table + ".csv")
		if err != nil {
			_ = zw.Close()
			writeInternal(w, r, err)
			return
		}
		cw := csv.NewWriter(f)
		if err := cw.Write(res.Columns); err != nil {
			_ = zw.Close()
			writeInternal(w, r, err)
			return
		}
		for _, row := range res.Rows {
			rec := make([]string, len(row))
			for i, c := range row {
				if c == nil {
					rec[i] = ""
				} else {
					rec[i] = fmt.Sprint(c)
				}
			}
			if err := cw.Write(rec); err != nil {
				_ = zw.Close()
				writeInternal(w, r, err)
				return
			}
		}
		cw.Flush()
		if err := cw.Error(); err != nil {
			_ = zw.Close()
			writeInternal(w, r, err)
			return
		}
	}
	if err := zw.Close(); err != nil {
		writeInternal(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="finbrain-export.zip"`)
	_, _ = w.Write(buf.Bytes())
}

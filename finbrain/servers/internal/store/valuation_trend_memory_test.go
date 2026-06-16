package store

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestTrendInMemoryMatchesPerDate is the divergence safety net: the fast in-memory trend
// must produce byte-identical totals to the per-date valuation engine for every date.
// Opt-in (needs a real DB + TREND_BENCH=1).
func TestTrendInMemoryMatchesPerDate(t *testing.T) {
	if os.Getenv("TREND_BENCH") != "1" {
		t.Skip("set TREND_BENCH=1 (+ DATABASE_URL) to run the in-memory/per-date equality check")
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	st, err := New(ctx, dbURL)
	if err != nil {
		t.Fatalf("db: %v", err)
	}
	defer st.Close()

	const userID = 1
	const dc, fx = "CNY", "current"

	// daily dates across the first-snapshot boundary + a long historical span
	var dates []string
	d := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 6, 17, 0, 0, 0, 0, time.UTC)
	for !d.After(end) {
		dates = append(dates, d.Format("2006-01-02"))
		d = d.AddDate(0, 0, 1)
	}

	inMem, err := st.netWorthTrendInMemory(ctx, userID, dates, dc, fx)
	if err != nil {
		t.Fatalf("in-memory: %v", err)
	}
	mismatches := 0
	for i, ds := range dates {
		want, err := st.netWorthAt(ctx, userID, ds, dc, fx)
		if err != nil {
			t.Fatalf("per-date %s: %v", ds, err)
		}
		got := inMem[i]
		if got.NetWorth != want.NetWorth || got.TotalAssets != want.TotalAssets ||
			got.TotalLiabilities != want.TotalLiabilities || got.CashValue != want.CashValue ||
			got.PositionValue != want.PositionValue {
			mismatches++
			if mismatches <= 8 {
				t.Errorf("%s mismatch:\n  in-mem: nw=%s ta=%s tl=%s cash=%s pos=%s\n  perday: nw=%s ta=%s tl=%s cash=%s pos=%s",
					ds, got.NetWorth, got.TotalAssets, got.TotalLiabilities, got.CashValue, got.PositionValue,
					want.NetWorth, want.TotalAssets, want.TotalLiabilities, want.CashValue, want.PositionValue)
			}
		}
	}
	if mismatches == 0 {
		t.Logf("OK: in-memory == per-date on all %d dates", len(dates))
	} else {
		t.Fatalf("%d/%d dates diverged", mismatches, len(dates))
	}
}

package store

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestTrendPerf benchmarks NetWorthTrend across concurrency × point-cap against a real DB.
// Opt-in (needs TREND_BENCH=1 + DATABASE_URL) so it never runs in the normal suite/CI.
//
//	DATABASE_URL=... TREND_BENCH=1 go test ./internal/store/ -run TestTrendPerf -v -timeout 300s
func TestTrendPerf(t *testing.T) {
	if os.Getenv("TREND_BENCH") != "1" {
		t.Skip("set TREND_BENCH=1 (+ DATABASE_URL) to run the trend perf benchmark")
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
	const from, to = "2025-06-16", "2026-06-16" // 12 months, daily
	const dc, fx = "CNY", "current"

	run := func(maxPoints, conc int) (time.Duration, int) {
		start := time.Now()
		s, err := st.NetWorthTrend(ctx, userID, from, to, "day", dc, fx, maxPoints, conc)
		if err != nil {
			t.Fatalf("trend(cap=%d,conc=%d): %v", maxPoints, conc, err)
		}
		return time.Since(start), len(s.Points)
	}

	run(366, 8) // warm DB cache + query plans before timing

	t.Log("── concurrency sweep @ cap=120 (12-month daily) ──")
	for _, c := range []int{1, 2, 4, 6, 8, 12, 16} {
		d, n := run(120, c)
		t.Logf("conc=%-3d points=%-4d %v", c, n, d.Round(time.Millisecond))
	}

	t.Log("── cap sweep @ conc=8 ──")
	for _, cp := range []int{30, 45, 60, 90, 120, 180, 366} {
		d, n := run(cp, 8)
		t.Logf("cap=%-4d points=%-4d %v", cp, n, d.Round(time.Millisecond))
	}

	t.Log("── serial (conc=1) cap sweep ──")
	for _, cp := range []int{30, 60, 90, 120} {
		d, n := run(cp, 1)
		t.Logf("cap=%-4d points=%-4d %v", cp, n, d.Round(time.Millisecond))
	}
}

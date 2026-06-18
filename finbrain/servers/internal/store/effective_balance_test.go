package store

import (
	"context"
	"os"
	"testing"

	"github.com/shopspring/decimal"
)

// TestCarryBalanceAnchor covers the in-memory trend's effective-cash windowing without a DB:
// the anchor must be the latest snapshot on/before d, replay only events strictly after it,
// and add NO replay when only future snapshots exist (projected-backward case).
func TestCarryBalanceAnchor(t *testing.T) {
	dec := decimal.RequireFromString
	series := []memBal{
		{balance: dec("100"), date: "2026-01-10"},
		{balance: dec("150"), date: "2026-03-01"},
	}
	deltas := []memCashDelta{
		{date: "2026-01-05", amount: dec("-9")}, // before first snapshot → never in any window
		{date: "2026-02-01", amount: dec("-30")},
		{date: "2026-03-01", amount: dec("-7")}, // SAME day as the 03-01 snapshot → excluded (snapshot wins)
		{date: "2026-04-01", amount: dec("20")},
	}
	// effective(series, deltas, d) replicates the in-memory cash loop.
	eff := func(d string) (string, bool) {
		bal, anchor, anchored, exists := carryBalanceAnchor(series, d)
		if !exists {
			return "", false
		}
		if anchored {
			for _, cd := range deltas {
				if cd.date > anchor && cd.date <= d {
					bal = bal.Add(cd.amount)
				}
			}
		}
		return bal.String(), true
	}

	cases := []struct {
		d, want string
	}{
		{"2026-01-05", "100"}, // before first snapshot → projected back to 100, no replay
		{"2026-01-10", "100"}, // anchor 01-10, nothing strictly after yet
		{"2026-02-15", "70"},  // 100 + (-30) [02-01]; 01-05 excluded (before anchor)
		{"2026-03-01", "150"}, // re-base to the 03-01 snapshot; same-day -7 excluded
		{"2026-05-01", "170"}, // 150 + 20 [04-01]; 02-01/03-01 events pre-anchor, excluded
	}
	for _, c := range cases {
		got, ok := eff(c.d)
		if !ok || got != c.want {
			t.Errorf("eff(%s) = %q (ok=%v), want %q", c.d, got, ok, c.want)
		}
	}

	if _, _, _, exists := carryBalanceAnchor(nil, "2026-01-01"); exists {
		t.Error("empty series must report exists=false")
	}
}

// TestCashReplaySumsMatchesReconciliation guards the single-source-of-truth invariant:
// the effective-balance term used by current_balance / valuation (cashReplaySums) must
// equal the 现金对账 card's replay (ReconcileAccount delta = expected − snapshot) for the
// same account/date, so the account-list 余额, net worth, and the reconciliation view can
// never silently disagree. Opt-in (needs a real DB) so it stays out of the unit suite/CI.
//
//	EFFBAL_CHECK=1 DATABASE_URL=... go test ./internal/store/ -run TestCashReplaySumsMatchesReconciliation -v
func TestCashReplaySumsMatchesReconciliation(t *testing.T) {
	if os.Getenv("EFFBAL_CHECK") == "" {
		t.Skip("set EFFBAL_CHECK=1 (+ DATABASE_URL) to run the effective-balance consistency check")
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	st, err := New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	const onDate = "2026-06-19"
	rows, err := st.pool.Query(ctx, `SELECT DISTINCT user_id, id FROM accounts
		WHERE NOT is_archived AND kind IN ('cash','time_deposit','wealth_product') ORDER BY user_id, id`)
	if err != nil {
		t.Fatal(err)
	}
	type acct struct{ user, id int64 }
	var accts []acct
	for rows.Next() {
		var a acct
		if err := rows.Scan(&a.user, &a.id); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		accts = append(accts, a)
	}
	rows.Close()

	checked := 0
	for _, a := range accts {
		sums, err := st.cashReplaySums(ctx, a.user, a.id, onDate, false)
		if err != nil {
			t.Fatalf("cashReplaySums(user=%d acct=%d): %v", a.user, a.id, err)
		}
		rec, err := st.ReconcileAccount(ctx, a.user, a.id, onDate, false)
		if err != nil {
			t.Fatalf("ReconcileAccount(user=%d acct=%d): %v", a.user, a.id, err)
		}
		// cashReplaySums omits accounts with no snapshot baseline (sum→0 by contract);
		// reconciliation replays from 0001-01-01 in that case, so only compare when a
		// snapshot anchor exists (the live, meaningful case).
		if rec.SnapshotDate == nil {
			continue
		}
		want := mustDec(rec.Delta).StringFixed(2)
		got := sums[a.id].StringFixed(2)
		if got != want {
			t.Errorf("user=%d acct=%d: cashReplaySums=%s != recon delta=%s", a.user, a.id, got, want)
		}
		checked++
	}
	t.Logf("checked %d cash accounts with a snapshot baseline", checked)
}

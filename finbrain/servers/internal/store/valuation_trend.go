package store

import (
	"context"
	"sync"
	"time"
)

// maxTrendPoints is the in-store fallback cap used when the caller passes maxPoints <= 0
// (production passes config.TrendMaxPoints). A chart is only a few hundred px wide, so
// denser sampling adds latency without visible detail.
const maxTrendPoints = 90

// TrendPoint is one cross-section of net worth (§6.5). Money fields are decimal
// strings in the requested display currency.
type TrendPoint struct {
	Date             string `json:"date"`
	NetWorth         string `json:"net_worth"`
	TotalAssets      string `json:"total_assets"`
	TotalLiabilities string `json:"total_liabilities"`
	CashValue        string `json:"cash_value"`
	PositionValue    string `json:"position_value"`
}

type TrendSeries struct {
	From            string       `json:"from"`
	To              string       `json:"to"`
	Granularity     string       `json:"granularity"`
	DisplayCurrency string       `json:"display_currency"`
	FxMode          string       `json:"fx_mode"`
	Points          []TrendPoint `json:"points"`
}

// netWorthAt computes the §6.1–6.4 cross-section totals at onDate using the
// same valuation engine as the current dashboard so transaction replay, pricing,
// liabilities, and FX handling stay consistent across current and trend views.
func (s *Store) netWorthAt(ctx context.Context, userID int64, onDate, displayCurrency, fxMode string) (TrendPoint, error) {
	val, err := s.GetValuation(ctx, userID, onDate, displayCurrency, fxMode, onDate)
	if err != nil {
		return TrendPoint{}, err
	}
	return TrendPoint{
		Date:             onDate,
		NetWorth:         val.NetWorth,
		TotalAssets:      val.TotalAssets,
		TotalLiabilities: val.TotalLiabilities,
		CashValue:        val.CashValue,
		PositionValue:    val.PositionValue,
	}, nil
}

// NetWorthTrend computes a net-worth cross-section at each section date in
// [from, to] for the granularity (day|month|quarter|year), per §6.5.
func (s *Store) NetWorthTrend(ctx context.Context, userID int64, from, to, granularity, displayCurrency, fxMode string, maxPoints, concurrency int) (TrendSeries, error) {
	if maxPoints <= 0 {
		maxPoints = maxTrendPoints
	}
	if concurrency < 1 {
		concurrency = 1
	}
	loc := time.UTC
	fromT, err := time.ParseInLocation("2006-01-02", from, loc)
	if err != nil {
		return TrendSeries{}, err
	}
	toT, err := time.ParseInLocation("2006-01-02", to, loc)
	if err != nil {
		return TrendSeries{}, err
	}
	if toT.Before(fromT) {
		fromT, toT = toT, fromT
	}
	dates := capDates(sectionDates(fromT, toT, granularity), maxPoints)
	out := TrendSeries{From: from, To: to, Granularity: granularity, DisplayCurrency: displayCurrency, FxMode: fxMode, Points: make([]TrendPoint, len(dates))}
	if len(dates) == 0 {
		return out, nil
	}
	dateStrs := make([]string, len(dates))
	for i, d := range dates {
		dateStrs[i] = d.Format("2006-01-02")
	}

	// Fast path: a user with no transactions on/before the range end has fixed holdings (no
	// replay), so load their snapshots ONCE and compute every date in memory against the
	// cached prices/FX — zero per-date DB queries, so even serial is instant. Transaction
	// users fall back to the per-date engine, which replays correctly.
	if s.market != nil {
		if has, err := s.userHasTransactionsAsOf(ctx, userID, dateStrs[len(dateStrs)-1]); err == nil && !has {
			if pts, err := s.netWorthTrendInMemory(ctx, userID, dateStrs, displayCurrency, fxMode); err == nil {
				out.Points = pts
				return out, nil
			}
			// fall through to the per-date engine on any error
		}
	}

	// Per-date engine (transaction users / fallback). Pre-warm the price cache, then fan the
	// independent valuations out across a bounded worker pool (concurrency=1 ⇒ serial).
	if s.market != nil {
		if syms, err := s.heldSymbols(ctx, userID); err == nil {
			_ = s.market.EnsurePrices(ctx, syms)
		}
	}
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var firstErr error
	for i, d := range dates {
		if firstErr != nil {
			break
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, ds string) {
			defer wg.Done()
			defer func() { <-sem }()
			pt, err := s.netWorthAt(ctx, userID, ds, displayCurrency, fxMode)
			if err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = err
				}
				mu.Unlock()
				return
			}
			out.Points[i] = pt
		}(i, d.Format("2006-01-02"))
	}
	wg.Wait()
	if firstErr != nil {
		return TrendSeries{}, firstErr
	}
	return out, nil
}

// heldSymbols lists the distinct instruments the user has ever snapshotted, for pre-warming
// the price cache before a trend computation.
func (s *Store) heldSymbols(ctx context.Context, userID int64) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT symbol FROM position_snapshots WHERE user_id=$1 /* OWNED position_snapshots */`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var sym string
		if err := rows.Scan(&sym); err != nil {
			return nil, err
		}
		out = append(out, sym)
	}
	return out, rows.Err()
}

// capDates downsamples to at most maxN evenly-spaced dates, always keeping the first and
// last. Returns the input unchanged when it already fits.
func capDates(dates []time.Time, maxN int) []time.Time {
	n := len(dates)
	if n <= maxN || maxN < 2 {
		return dates
	}
	out := make([]time.Time, 0, maxN)
	last := -1
	for i := 0; i < maxN; i++ {
		idx := i * (n - 1) / (maxN - 1) // maps [0,maxN-1] -> [0,n-1], includes both ends
		if idx == last {
			continue
		}
		out = append(out, dates[idx])
		last = idx
	}
	return out
}

// sectionDates enumerates cross-section dates. Daily ranges over ~370 days fall
// back to monthly to bound the point count (§6.14 perf note).
func sectionDates(from, to time.Time, gran string) []time.Time {
	if gran == "day" && to.Sub(from) > 370*24*time.Hour {
		gran = "month"
	}
	var out []time.Time
	switch gran {
	case "day":
		for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
			out = append(out, d)
		}
	case "quarter":
		out = periodEnds(from, to, 3)
	case "year":
		out = periodEnds(from, to, 12)
	default: // month
		out = periodEnds(from, to, 1)
	}
	if len(out) == 0 || !out[len(out)-1].Equal(to) {
		out = append(out, to)
	}
	return out
}

// periodEnds returns the last day of each N-month period that ends within
// [from, to]. It steps on the first-of-period (always day 1) to avoid the
// month-end + AddDate overflow that skips short months.
func periodEnds(from, to time.Time, months int) []time.Time {
	var out []time.Time
	startMonth := ((int(from.Month())-1)/months)*months + 1 // 1-based first month of from's period
	cur := time.Date(from.Year(), time.Month(startMonth), 1, 0, 0, 0, 0, from.Location())
	for {
		end := cur.AddDate(0, months, 0).AddDate(0, 0, -1) // last day of this period
		if end.After(to) {
			break
		}
		if !end.Before(from) {
			out = append(out, end)
		}
		cur = cur.AddDate(0, months, 0) // first-of-next-period: safe (day stays 1)
	}
	return out
}

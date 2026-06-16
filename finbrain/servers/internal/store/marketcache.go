package store

import (
	"context"
	"sort"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
)

// marketCache holds the GLOBAL, user-independent market data — instrument prices and FX
// rates — in memory with a TTL. These tables are shared across all users and would
// otherwise be queried once per (symbol,date) by the valuation engine; the net-worth
// trend hits them heavily. Caching turns those into in-memory binary searches.
//
// Memory is bounded by a FIXED LRU cap (predictable for resource planning; can't OOM as
// users/instruments grow): total cached price bars never exceed maxBars, and when over it
// the least-recently-used symbols are evicted first — an evicted symbol simply reloads on
// next access. The TTL governs only FRESHNESS: a cached symbol is reloaded when its data is
// older than the TTL, so feed/manual price updates show up. The TTL does NOT affect the
// memory ceiling (no idle eviction) — memory is purely LRU-governed.
//
// Worst-case memory ≈ maxBars × ~120 bytes/bar (e.g. 200k bars ≈ ~25 MB). Safe for concurrent use.
type marketCache struct {
	pool    *pgxpool.Pool
	ttl     time.Duration
	maxBars int // cap on total cached price bars across all symbols (the memory bound)

	mu             sync.Mutex
	prices         map[string]*priceEntry
	fx             map[string]*fxEntry
	totalPriceBars int
}

type priceBar struct {
	date     string
	price    decimal.Decimal
	currency string
	id       int64
}

type priceEntry struct {
	loadedAt   time.Time
	lastAccess time.Time
	bars       []priceBar
}

type fxBar struct {
	date string
	rate decimal.Decimal
	id   int64
}

type fxEntry struct {
	loadedAt   time.Time
	lastAccess time.Time
	bars       []fxBar
}

func newMarketCache(pool *pgxpool.Pool, ttl time.Duration, maxBars int) *marketCache {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	if maxBars <= 0 {
		maxBars = 200_000 // ~25 MB of price bars
	}
	return &marketCache{
		pool:    pool,
		ttl:     ttl,
		maxBars: maxBars,
		prices:  map[string]*priceEntry{},
		fx:      map[string]*fxEntry{},
	}
}

func (c *marketCache) fresh(loadedAt time.Time) bool {
	return !loadedAt.IsZero() && time.Since(loadedAt) < c.ttl
}

// evictLocked enforces the memory bound: when total cached price bars exceed maxBars, it
// evicts least-recently-used price entries until under it. Memory is thus a fixed,
// predictable ceiling — no time-based idle eviction. Caller holds c.mu.
func (c *marketCache) evictLocked() {
	if c.maxBars <= 0 || c.totalPriceBars <= c.maxBars {
		return
	}
	keys := make([]string, 0, len(c.prices))
	for k := range c.prices {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return c.prices[keys[i]].lastAccess.Before(c.prices[keys[j]].lastAccess) })
	for _, k := range keys {
		if c.totalPriceBars <= c.maxBars {
			break
		}
		c.totalPriceBars -= len(c.prices[k].bars)
		delete(c.prices, k)
	}
}

// EnsurePrices loads (and caches) full price history for any of symbols not already fresh,
// in a single bulk query. Pre-warm before a trend so per-date lookups never hit the DB.
func (c *marketCache) EnsurePrices(ctx context.Context, symbols []string) error {
	var missing []string
	c.mu.Lock()
	for _, s := range symbols {
		if e := c.prices[s]; e != nil && c.fresh(e.loadedAt) {
			continue
		}
		missing = append(missing, s)
	}
	c.mu.Unlock()
	if len(missing) == 0 {
		return nil
	}

	rows, err := c.pool.Query(ctx, `
		SELECT symbol, price_date::text, price::text, currency, id
		FROM prices
		WHERE symbol = ANY($1)
		ORDER BY symbol, price_date, id`, missing)
	if err != nil {
		return err
	}
	defer rows.Close()
	loaded := map[string][]priceBar{}
	for _, s := range missing { // even symbols with zero rows get a (fresh, empty) entry
		loaded[s] = []priceBar{}
	}
	for rows.Next() {
		var sym, dateText, priceText, currency string
		var id int64
		if err := rows.Scan(&sym, &dateText, &priceText, &currency, &id); err != nil {
			return err
		}
		v, err := decimalFromString(priceText)
		if err != nil {
			return err
		}
		loaded[sym] = append(loaded[sym], priceBar{date: dateText, price: v, currency: currency, id: id})
	}
	if err := rows.Err(); err != nil {
		return err
	}
	now := time.Now()
	c.mu.Lock()
	for s, bars := range loaded {
		if old := c.prices[s]; old != nil {
			c.totalPriceBars -= len(old.bars)
		}
		c.prices[s] = &priceEntry{loadedAt: now, lastAccess: now, bars: bars}
		c.totalPriceBars += len(bars)
	}
	c.evictLocked()
	c.mu.Unlock()
	return nil
}

// PriceAsOf returns the price for symbol effective on onDate, replicating the valuation
// query's selection: the latest price_date <= onDate, preferring a row whose currency
// matches preferCurrency, then the highest id. ok=false when no such row exists.
func (c *marketCache) PriceAsOf(ctx context.Context, symbol, onDate, preferCurrency string) (price decimal.Decimal, currency, priceDate string, ok bool, err error) {
	if err := c.EnsurePrices(ctx, []string{symbol}); err != nil {
		return decZero, "", "", false, err
	}
	c.mu.Lock()
	e := c.prices[symbol]
	if e != nil {
		e.lastAccess = time.Now()
	}
	c.mu.Unlock()
	if e == nil || len(e.bars) == 0 {
		return decZero, "", "", false, nil
	}
	bars := e.bars // immutable after load; safe to read without the lock
	// largest index with date <= onDate (bars sorted by date asc, id asc)
	hi := sort.Search(len(bars), func(i int) bool { return bars[i].date > onDate })
	if hi == 0 {
		return decZero, "", "", false, nil
	}
	maxDate := bars[hi-1].date
	best := priceBar{}
	haveBest, bestPref := false, false
	for i := hi - 1; i >= 0 && bars[i].date == maxDate; i-- {
		b := bars[i]
		pref := preferCurrency != "" && b.currency == preferCurrency
		if !haveBest || (pref && !bestPref) || (pref == bestPref && b.id > best.id) {
			best, haveBest, bestPref = b, true, pref
		}
	}
	return best.price, best.currency, best.date, true, nil
}

func (c *marketCache) ensureFx(ctx context.Context, base, quote string) ([]fxBar, error) {
	key := base + "|" + quote
	c.mu.Lock()
	if e := c.fx[key]; e != nil && c.fresh(e.loadedAt) {
		e.lastAccess = time.Now()
		bars := e.bars
		c.mu.Unlock()
		return bars, nil
	}
	c.mu.Unlock()

	rows, err := c.pool.Query(ctx, `
		SELECT rate_date::text, rate::text, id
		FROM fx_rates
		WHERE base_currency=$1 AND quote_currency=$2
		ORDER BY rate_date, id`, base, quote)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	bars := []fxBar{}
	for rows.Next() {
		var dateText, rateText string
		var id int64
		if err := rows.Scan(&dateText, &rateText, &id); err != nil {
			return nil, err
		}
		v, err := decimalFromString(rateText)
		if err != nil {
			return nil, err
		}
		bars = append(bars, fxBar{date: dateText, rate: v, id: id})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	now := time.Now()
	c.mu.Lock()
	c.fx[key] = &fxEntry{loadedAt: now, lastAccess: now, bars: bars}
	c.evictLocked()
	c.mu.Unlock()
	return bars, nil
}

// FxLookup is an fxResolver.lookupFn backed by the cache. mode "current" returns the latest
// rate for the pair; "historical" the latest rate on/before onDate — matching the SQL in
// fxResolver.lookup. ok=false when the pair has no rows.
func (c *marketCache) FxLookup(base, quote, mode, onDate string) (decimal.Decimal, *string, bool, error) {
	bars, err := c.ensureFx(context.Background(), base, quote)
	if err != nil {
		return decZero, nil, false, err
	}
	if len(bars) == 0 {
		return decZero, nil, false, nil
	}
	var pick *fxBar
	if mode == "current" {
		pick = &bars[len(bars)-1]
	} else {
		hi := sort.Search(len(bars), func(i int) bool { return bars[i].date > onDate })
		if hi == 0 {
			return decZero, nil, false, nil
		}
		pick = &bars[hi-1]
	}
	d := pick.date
	return pick.rate, &d, true, nil
}

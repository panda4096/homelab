// Package market auto-fetches instrument prices and FX rates and writes them into the store.
// It runs a background scheduler that polls the latest price for every instrument (intraday
// during an open session, the close afterwards) and backfills full history for newly added
// instruments. Stocks, indices, and FX come from Yahoo Finance (overseas, split-adjusted);
// open-end fund NAV comes from Eastmoney/fundgz (domestic). All writes go through the store's
// auto-upsert, which never overwrites a manually corrected row.
package market

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/shopspring/decimal"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
	"github.com/panda4096/homelab/finbrain/servers/internal/market/eastmoney"
	"github.com/panda4096/homelab/finbrain/servers/internal/market/yahoo"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

// Source tags recorded on auto-fetched rows. Both are non-"manual", so the store treats them
// as auto-upserts (never overwriting a manual correction) and the --reset re-backfill clears
// either. Stocks/indices/FX come from Yahoo; open-end fund NAV from Eastmoney.
const (
	sourceQuote = "yahoo"
	sourceFund  = "eastmoney"
)

// benchmarkDef is an index auto-created as a benchmark (is_benchmark) so the trend-comparison
// feature has data out of the box. Indices use explicit Yahoo symbols (the equity rules don't
// apply). market="INDEX" routes them through the K-line fetch path; the currency is a nominal
// label — the chart rebases for comparison.
type benchmarkDef struct {
	symbol      string
	yahoo       string
	currency    string
	displayName string
}

var defaultBenchmarks = []benchmarkDef{
	{symbol: "HSI", yahoo: "^HSI", currency: "HKD", displayName: "恒生指数"},
	{symbol: "SPX", yahoo: "^GSPC", currency: "USD", displayName: "标普500"},
	{symbol: "NDX", yahoo: "^NDX", currency: "USD", displayName: "纳斯达克100"},
	{symbol: "CSI300", yahoo: "000300.SS", currency: "CNY", displayName: "沪深300"},
}

var yahooIndexSymbol = func() map[string]string {
	m := make(map[string]string, len(defaultBenchmarks))
	for _, b := range defaultBenchmarks {
		m[b.symbol] = b.yahoo
	}
	return m
}()

// fundSource fetches open-end fund NAV (Eastmoney/fundgz, a domestic source).
type fundSource interface {
	FundNavHistory(ctx context.Context, fundCode string) ([]eastmoney.Bar, error)
	FundEstimate(ctx context.Context, fundCode string) (eastmoney.FundEstimate, error)
}

// klineSource fetches daily split-adjusted closes for equities/indices/FX (Yahoo, overseas).
type klineSource interface {
	DailyCloses(ctx context.Context, symbol, beg string) ([]yahoo.Bar, error)
	DailyClosesNamed(ctx context.Context, symbol, beg string) (string, []yahoo.Bar, error)
}

// Service owns the upstream clients and the scheduler.
type Service struct {
	cfg   *config.Config
	store *store.Store
	em    fundSource  // open-end fund NAV (domestic)
	yh    klineSource // equities / indices / FX (overseas, split-adjusted)
	log   *log.Logger

	inflight    sync.Map // symbol -> struct{} (dedup concurrent backfills)
	runMu       sync.Mutex
	backfilling atomic.Bool // guards the full-history Backfill sweep from stacking
}

// New builds the market service. The Eastmoney (fund) client connects directly per
// cfg.MarketDataProxy; the Yahoo (quote) client honours the env proxy unless overridden.
func New(cfg *config.Config, st *store.Store) *Service {
	return &Service{
		cfg:   cfg,
		store: st,
		em:    eastmoney.New(cfg.MarketDataProxy),
		yh:    yahoo.New(cfg.MarketDataYahooProxy),
		log:   log.New(os.Stderr, "[market] ", log.LstdFlags),
	}
}

// ensureDefaultBenchmarks creates the default index benchmarks (恒生/标普500/纳指100/沪深300)
// if absent, flagged is_benchmark so the trend-comparison feature has data out of the box.
// Created once — it never overwrites an existing instrument, so a user who edits or
// un-benchmarks one keeps their change. They carry no positions, so they never enter net worth.
func (s *Service) ensureDefaultBenchmarks(ctx context.Context) {
	for _, b := range defaultBenchmarks {
		if _, err := s.store.GetInstrument(ctx, b.symbol); err == nil {
			continue
		} else if !errors.Is(err, store.ErrNotFound) {
			s.log.Printf("benchmark %s: %v", b.symbol, err)
			continue
		}
		mkt, ccy, name, ak := "INDEX", b.currency, b.displayName, "index"
		if _, err := s.store.UpsertInstrument(ctx, store.Instrument{
			Symbol: b.symbol, Market: &mkt, QuoteCurrency: &ccy, DisplayName: &name, AssetKind: &ak, IsBenchmark: true,
		}); err != nil {
			s.log.Printf("seed benchmark %s: %v", b.symbol, err)
		} else {
			s.log.Printf("seeded benchmark %s (%s)", b.symbol, b.displayName)
		}
	}
}

// Start runs the scheduler until ctx is cancelled: an immediate refresh + history
// backfill, then a refresh on every interval tick.
func (s *Service) Start(ctx context.Context) {
	s.log.Printf("scheduler on (interval=%s, fund-proxy=%q, quote-proxy=%q)", s.cfg.MarketDataInterval, s.cfg.MarketDataProxy, s.cfg.MarketDataYahooProxy)
	s.ensureDefaultBenchmarks(ctx)
	s.tick(ctx)

	t := time.NewTicker(s.cfg.MarketDataInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.tick(ctx)
		}
	}
}

// tick refreshes the latest prices, then runs the backfill sweep. The sweep is a cheap
// no-op for already-backfilled symbols and retries any that previously failed. All
// upstream requests are globally paced by each client, so the two phases never burst.
func (s *Service) tick(ctx context.Context) {
	if err := s.RefreshLatest(ctx); err != nil {
		s.log.Printf("refresh: %v", err)
	}
	s.EnsureAllBackfilled(ctx)
}

// RefreshLatest fetches the latest price for every instrument and the latest FX rate for
// every non-CNY currency in use, then auto-upserts them. Per-instrument failures are
// logged and skipped so one bad symbol never blocks the rest.
func (s *Service) RefreshLatest(ctx context.Context) error {
	s.runMu.Lock()
	defer s.runMu.Unlock()

	insts, err := s.store.ListInstruments(ctx)
	if err != nil {
		return err
	}

	// Upsert per instrument so one bad symbol's batch can never roll back the others'.
	// Request pacing is handled globally by each client.
	written := 0
	currencies := map[string]struct{}{}
	for _, inst := range insts {
		cur := s.currencyOf(inst)
		if cur != "" && cur != "CNY" {
			currencies[cur] = struct{}{}
		}
		ps, err := s.latestForInstrument(ctx, inst)
		if err != nil {
			s.log.Printf("latest %s: %v", inst.Symbol, err)
			continue
		}
		if len(ps) == 0 {
			continue
		}
		n, err := s.store.BatchUpsertAutoPrices(ctx, ps)
		if err != nil {
			s.log.Printf("upsert %s: %v", inst.Symbol, err)
			continue
		}
		written += n
	}

	rates := s.latestFx(ctx, currencies)
	fxWritten := 0
	if len(rates) > 0 {
		if fxWritten, err = s.store.BatchUpsertAutoFxRates(ctx, rates); err != nil {
			s.log.Printf("upsert fx: %v", err)
		}
	}
	s.log.Printf("refresh done: %d prices, %d fx", written, fxWritten)
	return nil
}

// ResolveResult reports whether a symbol/market is actually fetchable from the upstream feed.
// Used to validate a user-entered instrument before it is saved.
type ResolveResult struct {
	OK        bool   `json:"ok"`
	Name      string `json:"name,omitempty"` // instrument display name from the feed, for auto-fill
	Currency  string `json:"currency,omitempty"`
	Price     string `json:"price,omitempty"`
	PriceDate string `json:"price_date,omitempty"`
	Reason    string `json:"reason,omitempty"`
}

// resolveErrMessage turns a raw upstream/transport error into a short, user-facing reason —
// never leaking the full request URL. Transport/timeout/throttle errors mean the feed is
// unreachable (e.g. an IP being rate-limited), which is NOT the user's symbol being wrong.
func resolveErrMessage(err error) string {
	var urlErr *url.Error
	msg := err.Error()
	if errors.As(err, &urlErr) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) ||
		strings.Contains(msg, "eastmoney") || strings.Contains(msg, "yahoo") || strings.Contains(msg, "EOF") || strings.Contains(msg, "timeout") ||
		strings.Contains(msg, "no such host") || strings.Contains(msg, "connection refused") {
		return "行情源暂时不可用，请稍后重试（不一定是代码有误）"
	}
	if len(msg) > 60 {
		msg = msg[:60] + "…"
	}
	return "查询失败：" + msg
}

// Resolve probes the upstream feed for symbol/market/assetKind via the SAME path the collector
// uses, so a positive result means auto-fetch will work. It makes one (globally paced) upstream
// request — callers must bound it with a context timeout.
func (s *Service) Resolve(ctx context.Context, symbol, market, assetKind string) ResolveResult {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return ResolveResult{Reason: "代码为空"}
	}
	mkt := strings.ToUpper(strings.TrimSpace(market))
	ak := strings.ToLower(strings.TrimSpace(assetKind))
	inst := store.Instrument{Symbol: symbol, Market: &mkt, AssetKind: &ak}
	cur := s.currencyOf(inst)
	switch s.kindOf(inst) {
	case kindFund:
		est, err := s.em.FundEstimate(ctx, symbol)
		if err != nil {
			return ResolveResult{Reason: resolveErrMessage(err)}
		}
		price, date := est.OfficialNav, est.OfficialDate
		if validNum(est.EstNav) && est.EstDate > est.OfficialDate {
			price, date = est.EstNav, est.EstDate
		}
		if !validNum(price) {
			return ResolveResult{Reason: "未获取到行情，请确认代码与市场是否匹配"}
		}
		return ResolveResult{OK: true, Name: est.Name, Currency: cur, Price: price, PriceDate: date}
	case kindStock:
		ysym, err := s.yahooSymbol(inst)
		if err != nil {
			return ResolveResult{Reason: resolveErrMessage(err)}
		}
		name, bars, err := s.yh.DailyClosesNamed(ctx, ysym, "")
		if err != nil {
			return ResolveResult{Reason: resolveErrMessage(err)}
		}
		for i := len(bars) - 1; i >= 0; i-- { // last valid bar
			if validNum(bars[i].Close) {
				return ResolveResult{OK: true, Name: name, Currency: cur, Price: bars[i].Close, PriceDate: bars[i].Date}
			}
		}
		return ResolveResult{Reason: "未获取到行情，请确认代码与市场是否匹配"}
	default:
		return ResolveResult{Reason: "暂不支持自动获取该市场 / 类型的行情，可手动维护价格"}
	}
}

func (s *Service) latestFx(ctx context.Context, currencies map[string]struct{}) []store.FxRate {
	var rates []store.FxRate
	for cur := range currencies {
		ysym, ok := yahooFxSymbol(cur)
		if !ok {
			s.log.Printf("no FX source for %s/CNY", cur)
			continue
		}
		bars, err := s.yh.DailyCloses(ctx, ysym, "")
		if err != nil || len(bars) == 0 {
			s.log.Printf("fx %s/CNY: %v", cur, err)
			continue
		}
		b := bars[len(bars)-1]
		if !validNum(b.Close) {
			continue
		}
		rates = append(rates, store.FxRate{BaseCurrency: cur, QuoteCurrency: "CNY", RateDate: b.Date, Rate: b.Close, Source: sourceQuote})
	}
	return rates
}

// latestForInstrument returns the price row(s) to upsert for one instrument's latest data.
func (s *Service) latestForInstrument(ctx context.Context, inst store.Instrument) ([]store.Price, error) {
	cur := s.currencyOf(inst)
	switch s.kindOf(inst) {
	case kindFund:
		est, err := s.em.FundEstimate(ctx, inst.Symbol)
		if err != nil {
			return nil, err
		}
		var out []store.Price
		if validNum(est.OfficialNav) && est.OfficialDate != "" {
			out = append(out, store.Price{Symbol: inst.Symbol, PriceDate: est.OfficialDate, Price: est.OfficialNav, Currency: cur, Source: sourceFund})
		}
		// Today's estimate, only when newer than the last official NAV (T+1/T+2 funds).
		if validNum(est.EstNav) && est.EstDate != "" && est.EstDate > est.OfficialDate {
			out = append(out, store.Price{Symbol: inst.Symbol, PriceDate: est.EstDate, Price: est.EstNav, Currency: cur, Source: sourceFund})
		}
		return out, nil
	case kindStock:
		ysym, err := s.yahooSymbol(inst)
		if err != nil {
			return nil, err
		}
		bars, err := s.yh.DailyCloses(ctx, ysym, "")
		if err != nil {
			return nil, err
		}
		if len(bars) == 0 {
			return nil, nil
		}
		b := bars[len(bars)-1]
		if !validNum(b.Close) {
			return nil, nil
		}
		return []store.Price{{Symbol: inst.Symbol, PriceDate: b.Date, Price: b.Close, Currency: cur, Source: sourceQuote}}, nil
	default:
		return nil, nil // unsupported market — skip silently
	}
}

// Backfill pulls full price history for the given symbols (all instruments when empty)
// and FX history when no symbols are specified. Heavy/one-shot: runs symbols serially.
func (s *Service) Backfill(ctx context.Context, symbols ...string) error {
	// Self-serialize: the manual /market/backfill trigger spawns a detached 30-min goroutine,
	// so without this a second click would stack another full sweep. Concurrent calls no-op.
	if !s.backfilling.CompareAndSwap(false, true) {
		s.log.Printf("backfill already in progress; skipping")
		return nil
	}
	defer s.backfilling.Store(false)
	var insts []store.Instrument
	if len(symbols) == 0 {
		all, err := s.store.ListInstruments(ctx)
		if err != nil {
			return err
		}
		insts = all
	} else {
		for _, sym := range symbols {
			inst, err := s.store.GetInstrument(ctx, sym)
			if err != nil {
				s.log.Printf("backfill %s: %v", sym, err)
				continue
			}
			insts = append(insts, inst)
		}
	}

	for _, inst := range insts {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := s.backfillInstrument(ctx, inst); err != nil {
			s.log.Printf("backfill %s: %v", inst.Symbol, err)
			continue
		}
		if err := s.store.MarkMarketBackfilled(ctx, inst.Symbol); err != nil {
			s.log.Printf("mark %s: %v", inst.Symbol, err)
		}
	}

	if len(symbols) == 0 {
		s.backfillFx(ctx, insts)
	}
	return nil
}

func (s *Service) backfillInstrument(ctx context.Context, inst store.Instrument) error {
	cur := s.currencyOf(inst)
	var prices []store.Price
	switch s.kindOf(inst) {
	case kindFund:
		bars, err := s.em.FundNavHistory(ctx, inst.Symbol)
		if err != nil {
			return err
		}
		for _, b := range bars {
			if !validNum(b.Close) || b.Date == "" {
				continue
			}
			prices = append(prices, store.Price{Symbol: inst.Symbol, PriceDate: b.Date, Price: b.Close, Currency: cur, Source: sourceFund})
		}
	case kindStock:
		ysym, err := s.yahooSymbol(inst)
		if err != nil {
			return err
		}
		bars, err := s.yh.DailyCloses(ctx, ysym, s.backfillBeg())
		if err != nil {
			return err
		}
		for _, b := range bars {
			if !validNum(b.Close) || b.Date == "" {
				continue
			}
			prices = append(prices, store.Price{Symbol: inst.Symbol, PriceDate: b.Date, Price: b.Close, Currency: cur, Source: sourceQuote})
		}
	default:
		return nil
	}
	if len(prices) == 0 {
		return nil
	}
	n, err := s.store.BatchUpsertAutoPrices(ctx, prices)
	if err != nil {
		return err
	}
	s.log.Printf("backfill %s: %d rows", inst.Symbol, n)
	return nil
}

func (s *Service) backfillFx(ctx context.Context, insts []store.Instrument) {
	seen := map[string]struct{}{}
	for _, inst := range insts {
		cur := s.currencyOf(inst)
		if cur == "" || cur == "CNY" {
			continue
		}
		ysym, ok := yahooFxSymbol(cur)
		if !ok {
			continue
		}
		if _, done := seen[cur]; done {
			continue
		}
		seen[cur] = struct{}{}
		bars, err := s.yh.DailyCloses(ctx, ysym, s.backfillBeg())
		if err != nil {
			s.log.Printf("backfill fx %s/CNY: %v", cur, err)
			continue
		}
		rates := make([]store.FxRate, 0, len(bars))
		for _, b := range bars {
			if !validNum(b.Close) || b.Date == "" {
				continue
			}
			rates = append(rates, store.FxRate{BaseCurrency: cur, QuoteCurrency: "CNY", RateDate: b.Date, Rate: b.Close, Source: sourceQuote})
		}
		if n, err := s.store.BatchUpsertAutoFxRates(ctx, rates); err != nil {
			s.log.Printf("backfill fx %s/CNY: %v", cur, err)
		} else {
			s.log.Printf("backfill fx %s/CNY: %d rows", cur, n)
		}
	}
}

// EnsureBackfilled backfills full history for a symbol unless it has already been
// backfilled (tracked by an explicit marker, NOT by the presence of recent price rows).
// The marker is set only on success, so a failed attempt is retried on the next sweep.
// Idempotent and deduplicated — safe on every new-instrument event and on every ticker sweep.
func (s *Service) EnsureBackfilled(ctx context.Context, symbol string) error {
	if _, busy := s.inflight.LoadOrStore(symbol, struct{}{}); busy {
		return nil
	}
	defer s.inflight.Delete(symbol)

	done, err := s.store.MarketBackfillDone(ctx, symbol)
	if err != nil {
		return err
	}
	if done {
		return nil
	}
	inst, err := s.store.GetInstrument(ctx, symbol)
	if err != nil {
		return err
	}
	if s.kindOf(inst) == kindSkip {
		// Not fetchable yet (e.g. market/asset_kind not filled in, or an unmapped index). Do NOT
		// mark it backfilled — otherwise a later edit that makes it fetchable (US/HK/INDEX/fund)
		// would find the marker already set and never backfill its history. Leaving it unmarked lets
		// a future patch reset+retry it (see patchInstrument).
		return nil
	}
	if err := s.backfillInstrument(ctx, inst); err != nil {
		return err // leave unmarked so the next sweep retries
	}
	return s.store.MarkMarketBackfilled(ctx, symbol)
}

// TriggerEnsureBackfilled fires EnsureBackfilled in the background (fire-and-forget),
// for HTTP handlers that just created an instrument. Never blocks the request.
func (s *Service) TriggerEnsureBackfilled(symbol string) {
	if s == nil || strings.TrimSpace(symbol) == "" {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		if err := s.EnsureBackfilled(ctx, symbol); err != nil {
			s.log.Printf("ensure-backfill %s: %v", symbol, err)
		}
	}()
}

// EnsureAllBackfilled backfills any instrument not yet marked as backfilled. Runs each
// tick; a no-op (one cheap marker query per symbol) for those already done, and a retry
// for any whose earlier attempt failed. Upstream requests are paced by each client.
func (s *Service) EnsureAllBackfilled(ctx context.Context) {
	insts, err := s.store.ListInstruments(ctx)
	if err != nil {
		s.log.Printf("ensure-all: %v", err)
		return
	}
	for _, inst := range insts {
		if ctx.Err() != nil {
			return
		}
		if err := s.EnsureBackfilled(ctx, inst.Symbol); err != nil {
			s.log.Printf("ensure-all %s: %v", inst.Symbol, err)
		}
	}
}

// ---- classification helpers ----

type instKind int

const (
	kindSkip instKind = iota
	kindStock
	kindFund
)

func (s *Service) kindOf(inst store.Instrument) instKind {
	if deref(inst.Market) == "INDEX" {
		// Indices fetch via the same daily K-line path, but only the ones we have a Yahoo
		// symbol for. A user-created INDEX with an unknown symbol is skipped (not failed) so it
		// can't spam refresh/backfill errors every cycle — its prices can still be set manually.
		if _, ok := yahooIndexSymbol[inst.Symbol]; ok {
			return kindStock
		}
		return kindSkip
	}
	if deref(inst.AssetKind) == "fund" {
		return kindFund
	}
	switch deref(inst.Market) {
	case "US", "HK":
		return kindStock
	default:
		return kindSkip
	}
}

func (s *Service) currencyOf(inst store.Instrument) string {
	if c := strings.ToUpper(strings.TrimSpace(deref(inst.QuoteCurrency))); c != "" {
		return c
	}
	switch deref(inst.Market) {
	case "US":
		return "USD"
	case "HK":
		return "HKD"
	default:
		return "CNY"
	}
}

// yahooSymbol maps an instrument to its Yahoo Finance symbol. US tickers pass through
// (class-share dots become dashes, e.g. BRK.B -> BRK-B); HK codes are left-padded to 4 digits
// with a .HK suffix; indices use an explicit table.
func (s *Service) yahooSymbol(inst store.Instrument) (string, error) {
	switch deref(inst.Market) {
	case "INDEX":
		if y, ok := yahooIndexSymbol[inst.Symbol]; ok {
			return y, nil
		}
		return "", fmt.Errorf("no yahoo symbol for index %q", inst.Symbol)
	case "HK":
		return yahooHKSymbol(inst.Symbol)
	case "US":
		return yahooUSSymbol(inst.Symbol), nil
	default:
		return "", fmt.Errorf("no yahoo symbol for market %q", deref(inst.Market))
	}
}

// yahooUSSymbol normalises a US ticker for Yahoo: upper-case, class-share dot -> dash.
func yahooUSSymbol(symbol string) string {
	return strings.ReplaceAll(strings.ToUpper(strings.TrimSpace(symbol)), ".", "-")
}

// yahooHKSymbol maps "0700.HK"/"700.HK" -> "0700.HK" and "09988.HK"/"9988.HK" -> "9988.HK".
// Yahoo's HK tickers use the significant digits zero-padded to a MINIMUM width of 4: a 4-digit
// listing keeps its leading zero (0700.HK), but a 5-significant-digit code is NOT zero-padded
// (9988.HK — Yahoo 404s the padded "09988.HK"). So strip leading zeros first, then re-pad to 4.
func yahooHKSymbol(symbol string) (string, error) {
	code := strings.TrimSpace(symbol)
	code = strings.TrimSuffix(code, ".HK")
	code = strings.TrimSuffix(code, ".hk")
	code = strings.TrimLeft(code, "0") // recover significant digits (guards empty/all-zeros below)
	if code == "" {
		return "", fmt.Errorf("empty HK code for %q", symbol)
	}
	for len(code) < 4 {
		code = "0" + code
	}
	return code + ".HK", nil
}

// yahooFxSymbol maps a quote currency to its Yahoo CNY-pair symbol (e.g. USD -> "USDCNY=X").
// Returns ok=false for an empty currency or CNY itself (no conversion needed).
func yahooFxSymbol(cur string) (string, bool) {
	c := strings.ToUpper(strings.TrimSpace(cur))
	if c == "" || c == "CNY" {
		return "", false
	}
	return c + "CNY=X", true
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// backfillBeg returns the `beg` date for history backfill: N years ago
// (FINBRAIN_MARKETDATA_BACKFILL_YEARS, default 10) to keep responses small. A configured
// value <= 0 means full history ("0").
func (s *Service) backfillBeg() string {
	years := 10
	if s.cfg != nil {
		years = s.cfg.MarketDataBackfillYears
	}
	if years <= 0 {
		return "0"
	}
	return time.Now().AddDate(-years, 0, 0).Format("20060102")
}

// validNum reports whether v is a well-formed decimal that stays positive at the prices
// table's 8-dp precision. Rejects empty/zero/negative AND non-numeric tokens, so a bad
// upstream value can never reach the ::numeric cast / CHECK (price > 0) and error a write.
func validNum(v string) bool {
	d, err := decimal.NewFromString(strings.TrimSpace(v))
	if err != nil {
		return false
	}
	return d.Round(8).IsPositive()
}

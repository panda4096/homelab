package market

import (
	"context"
	"errors"
	"io"
	"log"
	"net/url"
	"strings"
	"testing"

	"github.com/panda4096/homelab/finbrain/servers/internal/market/eastmoney"
	"github.com/panda4096/homelab/finbrain/servers/internal/market/yahoo"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

// fakeFunds is an in-memory fundSource (Eastmoney/fundgz) for network-free tests.
type fakeFunds struct {
	hist map[string][]eastmoney.Bar
	est  map[string]eastmoney.FundEstimate
	err  error // when set, every call returns this error (exercises the redaction path)
}

func (f *fakeFunds) FundNavHistory(_ context.Context, code string) ([]eastmoney.Bar, error) {
	return f.hist[code], f.err
}
func (f *fakeFunds) FundEstimate(_ context.Context, code string) (eastmoney.FundEstimate, error) {
	if f.err != nil {
		return eastmoney.FundEstimate{}, f.err
	}
	return f.est[code], nil
}

// fakeQuotes is an in-memory klineSource (Yahoo) keyed by Yahoo symbol.
type fakeQuotes struct {
	closes map[string][]yahoo.Bar
	err    error // when set, every call returns this error
}

func (f *fakeQuotes) DailyCloses(_ context.Context, symbol, _ string) ([]yahoo.Bar, error) {
	return f.closes[symbol], f.err
}
func (f *fakeQuotes) DailyClosesNamed(_ context.Context, symbol, _ string) (string, []yahoo.Bar, error) {
	if f.err != nil {
		return "", nil, f.err
	}
	return symbol, f.closes[symbol], nil
}

func ptr(s string) *string { return &s }

func testService(em fundSource, yh klineSource) *Service {
	return &Service{em: em, yh: yh, log: log.New(io.Discard, "", 0)}
}

func TestYahooSymbol(t *testing.T) {
	s := testService(nil, nil)
	cases := []struct{ sym, mkt, want string }{
		{"AAPL", "US", "AAPL"},
		{"aapl", "US", "AAPL"},
		{"brk.b", "US", "BRK-B"},
		{"0700.HK", "HK", "0700.HK"},
		{"700.hk", "HK", "0700.HK"},
		{"00700.HK", "HK", "0700.HK"}, // 5-digit leading-zero form normalises to 4-digit
		{"7709.HK", "HK", "7709.HK"},
		{"0005.HK", "HK", "0005.HK"},
		{"09988.HK", "HK", "9988.HK"}, // Alibaba: 5 significant digits, NOT zero-padded
		{"9988.HK", "HK", "9988.HK"},
		{"HSI", "INDEX", "^HSI"},
		{"SPX", "INDEX", "^GSPC"},
		{"NDX", "INDEX", "^NDX"},
		{"CSI300", "INDEX", "000300.SS"},
	}
	for _, c := range cases {
		got, err := s.yahooSymbol(store.Instrument{Symbol: c.sym, Market: ptr(c.mkt)})
		if err != nil || got != c.want {
			t.Errorf("yahooSymbol(%q,%q) = %q, %v; want %q", c.sym, c.mkt, got, err, c.want)
		}
	}
	if _, err := s.yahooSymbol(store.Instrument{Symbol: "XXX", Market: ptr("INDEX")}); err == nil {
		t.Error("unknown index should error")
	}
	if _, err := s.yahooSymbol(store.Instrument{Symbol: "X", Market: ptr("JP")}); err == nil {
		t.Error("unknown market should error")
	}
}

func TestYahooFxSymbol(t *testing.T) {
	if y, ok := yahooFxSymbol("usd"); !ok || y != "USDCNY=X" {
		t.Errorf("usd -> %q,%v; want USDCNY=X,true", y, ok)
	}
	if y, ok := yahooFxSymbol("HKD"); !ok || y != "HKDCNY=X" {
		t.Errorf("HKD -> %q,%v; want HKDCNY=X,true", y, ok)
	}
	if _, ok := yahooFxSymbol("CNY"); ok {
		t.Error("CNY should be ok=false (no conversion)")
	}
	if _, ok := yahooFxSymbol(""); ok {
		t.Error("empty should be ok=false")
	}
}

func TestKindAndCurrency(t *testing.T) {
	s := testService(nil, nil)
	us := store.Instrument{Symbol: "AAPL", Market: ptr("US"), AssetKind: ptr("equity"), QuoteCurrency: ptr("USD")}
	hk := store.Instrument{Symbol: "0700.HK", Market: ptr("HK"), AssetKind: ptr("equity")}
	fund := store.Instrument{Symbol: "016532", Market: ptr("CN"), AssetKind: ptr("fund"), QuoteCurrency: ptr("CNY")}
	idx := store.Instrument{Symbol: "HSI", Market: ptr("INDEX"), AssetKind: ptr("index")}
	unkIdx := store.Instrument{Symbol: "WAT", Market: ptr("INDEX")}
	unknown := store.Instrument{Symbol: "X", Market: ptr("JP")}

	if s.kindOf(us) != kindStock || s.kindOf(hk) != kindStock || s.kindOf(idx) != kindStock {
		t.Error("US/HK/known-INDEX should be kindStock")
	}
	if s.kindOf(fund) != kindFund {
		t.Error("fund should be kindFund")
	}
	if s.kindOf(unkIdx) != kindSkip {
		t.Error("INDEX without a Yahoo symbol should be kindSkip")
	}
	if s.kindOf(unknown) != kindSkip {
		t.Error("unknown market should be kindSkip")
	}
	if s.currencyOf(hk) != "HKD" { // inferred from market when quote_currency is nil
		t.Errorf("HK currency = %q, want HKD", s.currencyOf(hk))
	}
	if s.currencyOf(us) != "USD" {
		t.Errorf("US currency = %q, want USD", s.currencyOf(us))
	}
}

func TestLatestForInstrument(t *testing.T) {
	em := &fakeFunds{
		est: map[string]eastmoney.FundEstimate{
			// official NAV is older than today's estimate -> expect BOTH rows
			"016532": {OfficialDate: "2026-06-12", OfficialNav: "2.1875", EstDate: "2026-06-15", EstNav: "2.2427"},
			// official already current -> estimate suppressed, expect ONE row
			"999999": {OfficialDate: "2026-06-15", OfficialNav: "1.50", EstDate: "2026-06-15", EstNav: "1.51"},
		},
	}
	yh := &fakeQuotes{
		closes: map[string][]yahoo.Bar{
			"AAPL":    {{Date: "2026-06-12", Close: "291.13"}, {Date: "2026-06-15", Close: "295.71"}},
			"0700.HK": {{Date: "2026-06-15", Close: "459.60"}},
		},
	}
	s := testService(em, yh)
	ctx := context.Background()

	got, _ := s.latestForInstrument(ctx, store.Instrument{Symbol: "AAPL", Market: ptr("US"), QuoteCurrency: ptr("USD")})
	if len(got) != 1 || got[0].PriceDate != "2026-06-15" || got[0].Price != "295.71" || got[0].Currency != "USD" || got[0].Source != sourceQuote {
		t.Errorf("AAPL latest = %+v", got)
	}

	got, _ = s.latestForInstrument(ctx, store.Instrument{Symbol: "0700.HK", Market: ptr("HK")})
	if len(got) != 1 || got[0].Price != "459.60" || got[0].Currency != "HKD" || got[0].Source != sourceQuote {
		t.Errorf("0700.HK latest = %+v", got)
	}

	got, _ = s.latestForInstrument(ctx, store.Instrument{Symbol: "016532", Market: ptr("CN"), AssetKind: ptr("fund"), QuoteCurrency: ptr("CNY")})
	if len(got) != 2 {
		t.Fatalf("fund 016532 expected 2 rows (official + estimate), got %+v", got)
	}
	if got[0].PriceDate != "2026-06-12" || got[0].Price != "2.1875" || got[0].Source != sourceFund ||
		got[1].PriceDate != "2026-06-15" || got[1].Price != "2.2427" || got[1].Source != sourceFund {
		t.Errorf("fund rows = %+v", got)
	}

	got, _ = s.latestForInstrument(ctx, store.Instrument{Symbol: "999999", AssetKind: ptr("fund"), QuoteCurrency: ptr("CNY")})
	if len(got) != 1 || got[0].PriceDate != "2026-06-15" || got[0].Price != "1.50" {
		t.Errorf("fund 999999 (official current) expected 1 official row, got %+v", got)
	}
}

func TestResolve(t *testing.T) {
	em := &fakeFunds{est: map[string]eastmoney.FundEstimate{
		// estimate newer than official -> uses the estimate
		"016532": {Name: "易方达蓝筹", OfficialDate: "2026-06-12", OfficialNav: "2.1875", EstDate: "2026-06-15", EstNav: "2.2427"},
		// official already current -> estimate suppressed
		"999999": {Name: "某基金", OfficialDate: "2026-06-15", OfficialNav: "1.50", EstDate: "2026-06-15", EstNav: "1.51"},
		// neither price valid
		"888888": {Name: "空基金", OfficialDate: "", OfficialNav: "0", EstDate: "", EstNav: ""},
	}}
	yh := &fakeQuotes{closes: map[string][]yahoo.Bar{
		"AAPL":    {{Date: "2026-06-12", Close: "291.13"}, {Date: "2026-06-15", Close: "295.71"}},
		"0700.HK": {{Date: "2026-06-15", Close: "459.60"}},
		"TRAIL":   {{Date: "2026-06-12", Close: "10.00"}, {Date: "2026-06-15", Close: "0"}}, // trailing invalid
	}}
	s := testService(em, yh)
	ctx := context.Background()

	if r := s.Resolve(ctx, "aapl", "US", "equity"); !r.OK || r.Currency != "USD" || r.Price != "295.71" || r.PriceDate != "2026-06-15" || r.Name != "AAPL" {
		t.Errorf("AAPL resolve = %+v", r)
	}
	// HK lookup must go through yahooHKSymbol -> fake keyed by "0700.HK"
	if r := s.Resolve(ctx, "0700.HK", "HK", "equity"); !r.OK || r.Currency != "HKD" || r.Price != "459.60" {
		t.Errorf("0700.HK resolve = %+v", r)
	}
	// trailing invalid bar -> backward-walk to the earlier valid one
	if r := s.Resolve(ctx, "TRAIL", "US", "equity"); !r.OK || r.Price != "10.00" || r.PriceDate != "2026-06-12" {
		t.Errorf("TRAIL backward-walk resolve = %+v", r)
	}
	// no data (holiday/unknown) -> not OK, and the reason must NOT echo the symbol as "wrong"
	if r := s.Resolve(ctx, "NODATA", "US", "equity"); r.OK || !strings.Contains(r.Reason, "未获取到行情") || strings.Contains(r.Reason, "NODATA") {
		t.Errorf("NODATA resolve = %+v", r)
	}
	if r := s.Resolve(ctx, "016532", "CN", "fund"); !r.OK || r.Price != "2.2427" || r.PriceDate != "2026-06-15" || r.Name != "易方达蓝筹" || r.Currency != "CNY" {
		t.Errorf("016532 resolve = %+v", r)
	}
	if r := s.Resolve(ctx, "999999", "CN", "fund"); !r.OK || r.Price != "1.50" || r.PriceDate != "2026-06-15" {
		t.Errorf("999999 resolve = %+v", r)
	}
	if r := s.Resolve(ctx, "888888", "CN", "fund"); r.OK || !strings.Contains(r.Reason, "未获取到行情") {
		t.Errorf("888888 (no valid price) resolve = %+v", r)
	}
	// kindSkip default branch: unknown INDEX + unsupported market
	if r := s.Resolve(ctx, "WAT", "INDEX", "index"); r.OK || !strings.Contains(r.Reason, "暂不支持") {
		t.Errorf("unknown index resolve = %+v", r)
	}
	if r := s.Resolve(ctx, "X", "JP", "equity"); r.OK || !strings.Contains(r.Reason, "暂不支持") {
		t.Errorf("JP resolve = %+v", r)
	}
	if r := s.Resolve(ctx, "  ", "US", "equity"); r.OK || !strings.Contains(r.Reason, "代码为空") {
		t.Errorf("empty symbol resolve = %+v", r)
	}
	// upstream error -> redacted, generic reason (NOT "symbol is wrong")
	bad := testService(em, &fakeQuotes{err: errors.New("yahoo: http 429")})
	if r := bad.Resolve(ctx, "AAPL", "US", "equity"); r.OK || !strings.Contains(r.Reason, "行情源暂时不可用") {
		t.Errorf("upstream-error resolve = %+v", r)
	}
}

func TestResolveErrMessage(t *testing.T) {
	transient := []error{
		&url.Error{Op: "Get", URL: "https://query1.finance.yahoo.com/v8/finance/chart/AAPL", Err: errors.New("connection reset")},
		context.DeadlineExceeded,
		context.Canceled,
		errors.New("yahoo: http 429"),
		errors.New("eastmoney kline 105.AAPL: EOF"),
		errors.New("dial tcp: i/o timeout"),
		errors.New("lookup query1.finance.yahoo.com: no such host"),
		errors.New("connection refused"),
	}
	for _, e := range transient {
		if got := resolveErrMessage(e); got != "行情源暂时不可用，请稍后重试（不一定是代码有误）" {
			t.Errorf("resolveErrMessage(%v) = %q; want the transient message", e, got)
		}
	}
	// a plain (non-transport) failure passes through, and must not leak a URL
	if got := resolveErrMessage(errors.New("bad code")); got != "查询失败：bad code" {
		t.Errorf("plain err = %q", got)
	}
	// over-long messages are truncated with an ellipsis (still no URL leak)
	long := resolveErrMessage(errors.New(strings.Repeat("x", 80)))
	if !strings.HasSuffix(long, "…") {
		t.Errorf("long err not truncated: %q", long)
	}
}

func TestValidNum(t *testing.T) {
	for _, bad := range []string{"", "0", "0.00", "-1.2", "  ", "abc", "1.2.3", "0.000000001"} {
		if validNum(bad) {
			t.Errorf("validNum(%q) should be false", bad)
		}
	}
	for _, ok := range []string{"295.71", "0.0001", "2.1875", "459.60"} {
		if !validNum(ok) {
			t.Errorf("validNum(%q) should be true", ok)
		}
	}
}

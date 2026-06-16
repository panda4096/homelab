package market

import (
	"context"
	"io"
	"log"
	"testing"

	"github.com/panda4096/homelab/finbrain/servers/internal/market/eastmoney"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

// fakeProvider is an in-memory provider for network-free tests.
type fakeProvider struct {
	klines   map[string][]eastmoney.Bar
	fundHist map[string][]eastmoney.Bar
	fundEst  map[string]eastmoney.FundEstimate
	secids   map[string]string
}

func (f *fakeProvider) DailyKline(_ context.Context, secid string, _ int, _ string) ([]eastmoney.Bar, error) {
	return f.klines[secid], nil
}
func (f *fakeProvider) FundNavHistory(_ context.Context, code string) ([]eastmoney.Bar, error) {
	return f.fundHist[code], nil
}
func (f *fakeProvider) FundEstimate(_ context.Context, code string) (eastmoney.FundEstimate, error) {
	return f.fundEst[code], nil
}
func (f *fakeProvider) ResolveUSSecid(_ context.Context, ticker string) (string, error) {
	return f.secids[ticker], nil
}

func ptr(s string) *string { return &s }

func testService(em provider) *Service {
	return &Service{em: em, log: log.New(io.Discard, "", 0)}
}

func TestHKSecid(t *testing.T) {
	cases := map[string]string{
		"0700.HK": "116.00700",
		"7709.HK": "116.07709",
		"0005.HK": "116.00005",
		"700.hk":  "116.00700",
	}
	for in, want := range cases {
		got, err := hkSecid(in)
		if err != nil || got != want {
			t.Errorf("hkSecid(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
}

func TestKindAndCurrency(t *testing.T) {
	s := testService(nil)
	us := store.Instrument{Symbol: "AAPL", Market: ptr("US"), AssetKind: ptr("equity"), QuoteCurrency: ptr("USD")}
	hk := store.Instrument{Symbol: "0700.HK", Market: ptr("HK"), AssetKind: ptr("equity")}
	fund := store.Instrument{Symbol: "016532", Market: ptr("CN"), AssetKind: ptr("fund"), QuoteCurrency: ptr("CNY")}
	unknown := store.Instrument{Symbol: "X", Market: ptr("JP")}

	if s.kindOf(us) != kindStock || s.kindOf(hk) != kindStock {
		t.Error("US/HK should be kindStock")
	}
	if s.kindOf(fund) != kindFund {
		t.Error("fund should be kindFund")
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
	em := &fakeProvider{
		secids: map[string]string{"AAPL": "105.AAPL"},
		klines: map[string][]eastmoney.Bar{
			"105.AAPL":  {{Date: "2026-06-12", Close: "291.13"}, {Date: "2026-06-15", Close: "295.71"}},
			"116.00700": {{Date: "2026-06-15", Close: "459.60"}},
		},
		fundEst: map[string]eastmoney.FundEstimate{
			// official NAV is older than today's estimate -> expect BOTH rows
			"016532": {OfficialDate: "2026-06-12", OfficialNav: "2.1875", EstDate: "2026-06-15", EstNav: "2.2427"},
			// official already current -> estimate suppressed, expect ONE row
			"999999": {OfficialDate: "2026-06-15", OfficialNav: "1.50", EstDate: "2026-06-15", EstNav: "1.51"},
		},
	}
	s := testService(em)
	ctx := context.Background()

	got, _ := s.latestForInstrument(ctx, store.Instrument{Symbol: "AAPL", Market: ptr("US"), QuoteCurrency: ptr("USD")})
	if len(got) != 1 || got[0].PriceDate != "2026-06-15" || got[0].Price != "295.71" || got[0].Currency != "USD" || got[0].Source != sourceTag {
		t.Errorf("AAPL latest = %+v", got)
	}

	got, _ = s.latestForInstrument(ctx, store.Instrument{Symbol: "0700.HK", Market: ptr("HK")})
	if len(got) != 1 || got[0].Price != "459.60" || got[0].Currency != "HKD" {
		t.Errorf("0700.HK latest = %+v", got)
	}

	got, _ = s.latestForInstrument(ctx, store.Instrument{Symbol: "016532", Market: ptr("CN"), AssetKind: ptr("fund"), QuoteCurrency: ptr("CNY")})
	if len(got) != 2 {
		t.Fatalf("fund 016532 expected 2 rows (official + estimate), got %+v", got)
	}
	if got[0].PriceDate != "2026-06-12" || got[0].Price != "2.1875" || got[1].PriceDate != "2026-06-15" || got[1].Price != "2.2427" {
		t.Errorf("fund rows = %+v", got)
	}

	got, _ = s.latestForInstrument(ctx, store.Instrument{Symbol: "999999", AssetKind: ptr("fund"), QuoteCurrency: ptr("CNY")})
	if len(got) != 1 || got[0].PriceDate != "2026-06-15" || got[0].Price != "1.50" {
		t.Errorf("fund 999999 (official current) expected 1 official row, got %+v", got)
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

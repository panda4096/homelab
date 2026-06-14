package httpapi

import (
	"strings"
	"testing"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func TestNarratePortfolioSnapshotSpeaksChinese(t *testing.T) {
	pct := "78.20"
	plPct := "10.70"
	got := narrateSkillResult(Skill{Name: "portfolio.getSnapshot", Type: "read"}, skillArgs{}, store.Valuation{
		AsOf: "2026-06-15", DisplayCurrency: "CNY", NetWorth: "1309779.41", TotalAssets: "1328419.41", TotalLiabilities: "18640.00",
		CashValue: "304170.35", PositionValue: "1024249.06", UnrealizedPL: "98991.98", UnrealizedPLPct: &plPct, RealizedPLYtd: "0.00", IncomeYtd: "0.00", PositionShare: &pct,
		Allocations: map[string][]store.ValuationBucket{"kind": {
			{Key: "brokerage", Name: "brokerage", Value: "1047394.89", Percent: "75.05"},
			{Key: "wealth_product", Name: "wealth_product", Value: "206957.40", Percent: "14.83"},
			{Key: "cash", Name: "cash", Value: "98855.64", Percent: "7.08"},
		}},
		Warnings: []store.ValuationWarning{{Message: "SPCX 缺少最新价格"}},
	}, 3)

	wantAll(t, got, "净资产", "总资产", "负债", "现金", "持仓", "证券 75.05%", "理财 14.83%", "SPCX 缺少最新价格")
	wantNone(t, got, "net_worth", "total_assets", "brokerage", "wealth_product", "{", "}")
}

func TestNarrateHoldingsSummarizesTopPositions(t *testing.T) {
	tv := "256185.36"
	tw := "23.51"
	mv := "219399.65"
	mw := "20.13"
	name := "腾讯控股有限公司"
	got := narrateSkillResult(Skill{Name: "holdings.listCurrent", Type: "read"}, skillArgs{"display_currency": "CNY"}, []store.ValuationPosition{
		{Symbol: "MU", MarketValueDisplay: &mv, Weight: &mw},
		{Symbol: "0700.HK", DisplayName: &name, MarketValueDisplay: &tv, Weight: &tw},
		{Symbol: "SPCX", MissingPrice: true},
	}, 3)

	wantAll(t, got, "当前共有 3 个持仓项", "总市值约", "0700.HK 腾讯控股有限公司 23.51%", "MU 20.13%", "1 项缺价格")
	wantNone(t, got, "market_value_display", "weight", "{")
}

func TestNarrateMarketDataHistory(t *testing.T) {
	got := narrateSkillResult(Skill{Name: "marketData.getInstrumentHistory", Type: "read"}, nil, store.PriceList{Items: []store.Price{
		{Symbol: "GILD", PriceDate: "2026-06-12", Price: "125.5900", Currency: "USD", Source: "yahoo"},
		{Symbol: "GILD", PriceDate: "2026-06-14", Price: "127.1000", Currency: "USD", Source: "manual"},
	}}, 2)

	wantAll(t, got, "GILD", "2 个价格点", "2026-06-12 至 2026-06-14", "最新价是 USD 127.1", "manual")
	wantNone(t, got, "price_date", "items")
}

func TestNarrateFxHistory(t *testing.T) {
	got := narrateSkillResult(Skill{Name: "fx.getRateHistory", Type: "read"}, nil, store.FxRateList{Items: []store.FxRate{
		{BaseCurrency: "USD", QuoteCurrency: "CNY", RateDate: "2026-06-12", Rate: "7.1800", Source: "manual"},
		{BaseCurrency: "USD", QuoteCurrency: "CNY", RateDate: "2026-06-15", Rate: "7.1772", Source: "ecb"},
	}}, 2)

	wantAll(t, got, "USD/CNY", "2 个汇率点", "最新汇率是 7.1772", "ecb")
	wantNone(t, got, "base_currency", "quote_currency", "{")
}

func TestNarrateDraftPreviewUsesHumanLabels(t *testing.T) {
	got := narrateSkillResult(Skill{Name: "entry.draftBalanceSnapshot", Type: "draft"}, nil, map[string]any{
		"entity":  "balance_snapshot",
		"account": map[string]any{"institution": "汇丰香港", "name": "港元储蓄", "currency": "HKD"},
		"fields":  map[string]any{"snapshot_date": "2026-06-15", "balance": "18843.55"},
	}, 0)

	wantAll(t, got, "待确认", "余额快照", "汇丰香港 · 港元储蓄（HKD）", "日期 2026-06-15", "余额 18843.55", "确认后才会写入账本")
	wantNone(t, got, "snapshot_date", "balance_snapshot", "{", "}")
}

func wantAll(t *testing.T, got string, parts ...string) {
	t.Helper()
	for _, part := range parts {
		if !strings.Contains(got, part) {
			t.Fatalf("expected narration to contain %q\nnarration: %s", part, got)
		}
	}
}

func wantNone(t *testing.T, got string, parts ...string) {
	t.Helper()
	for _, part := range parts {
		if strings.Contains(got, part) {
			t.Fatalf("expected narration not to contain %q\nnarration: %s", part, got)
		}
	}
}

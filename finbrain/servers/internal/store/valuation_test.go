package store

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestDecimalMoneyRounding(t *testing.T) {
	qty := decimal.RequireFromString("3")
	price := decimal.RequireFromString("1.005")
	got := formatMoneyDecimal(qty.Mul(price))
	if got != "3.02" {
		t.Fatalf("decimal rounding mismatch: got %s, want 3.02", got)
	}
}

func TestFutureSplitFactor(t *testing.T) {
	// 4:1 split on 2024-03-01, then 1:2 reverse split (merge) on 2024-09-01.
	events := []splitAdjEvent{
		{date: "2024-03-01", factor: decimal.RequireFromString("4")},
		{date: "2024-09-01", factor: decimal.RequireFromString("0.5")},
	}
	cases := []struct {
		onDate string
		want   string // cumulative factor for splits strictly after onDate
	}{
		{"2024-01-01", "2"},   // both later: 4 × 0.5 = 2
		{"2024-03-01", "0.5"}, // only the merge is strictly after
		{"2024-06-01", "0.5"}, // only the merge is after
		{"2024-09-01", "1"},   // nothing after
		{"2025-01-01", "1"},   // nothing after
	}
	for _, c := range cases {
		got := futureSplitFactor(events, c.onDate)
		if !got.Equal(decimal.RequireFromString(c.want)) {
			t.Errorf("futureSplitFactor(onDate=%s) = %s, want %s", c.onDate, got.String(), c.want)
		}
	}
	// No recorded splits → factor 1 (manually-priced instruments untouched).
	if got := futureSplitFactor(nil, "2024-06-01"); !got.Equal(decOne) {
		t.Errorf("futureSplitFactor(nil) = %s, want 1", got.String())
	}

	// End-to-end intent: a 前复权 price un-adjusts to the real price on a pre-split date.
	// Pre-split real price 400; after a 4:1 split the adjusted series shows 400/4 = 100 for that
	// date. Un-adjusting with the 4× future factor recovers 400.
	adjusted := decimal.RequireFromString("100")
	real := adjusted.Mul(futureSplitFactor([]splitAdjEvent{{date: "2024-03-01", factor: decimal.RequireFromString("4")}}, "2024-02-01"))
	if !real.Equal(decimal.RequireFromString("400")) {
		t.Fatalf("un-adjust mismatch: got %s, want 400", real.String())
	}
}

func TestFxResolverDirectReverseBridgeAndFallback(t *testing.T) {
	rates := map[string]string{
		"USD|CNY": "7.20000000",
		"USD|HKD": "7.83000000",
		"EUR|USD": "1.10000000",
	}
	fx := &fxResolver{
		mode:   "historical",
		onDate: "2026-06-14",
		cache:  map[string]fxResult{},
		lookupFn: func(base, quote, mode, onDate string) (decimal.Decimal, *string, bool, error) {
			if mode != "historical" || onDate != "2026-06-14" {
				t.Fatalf("unexpected lookup scope mode=%s onDate=%s", mode, onDate)
			}
			v, ok := rates[base+"|"+quote]
			if !ok {
				return decZero, nil, false, nil
			}
			d := "2026-06-13"
			rate := decimal.RequireFromString(v)
			return rate, &d, true, nil
		},
	}

	got, err := fx.resolve("USD", "CNY")
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != "direct" || !got.Rate.Equal(decimal.RequireFromString("7.20000000")) {
		t.Fatalf("direct rate mismatch: %+v", got)
	}

	got, err = fx.resolve("HKD", "USD")
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != "direct" || got.Rate.Round(8).StringFixed(8) != "0.12771392" {
		t.Fatalf("reverse rate mismatch: source=%s rate=%s", got.Source, got.Rate.String())
	}

	got, err = fx.resolve("EUR", "CNY")
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != "usd_bridge" || !got.Rate.Equal(decimal.RequireFromString("7.9200000000000000")) {
		t.Fatalf("bridge rate mismatch: %+v", got)
	}

	got, err = fx.resolve("GBP", "CNY")
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != "fallback" || !got.Rate.Equal(decOne) {
		t.Fatalf("fallback mismatch: %+v", got)
	}
}

func TestBuildSymbolPositionGroupsWeightedCost(t *testing.T) {
	usd := "USD"
	positions := []ValuationPosition{
		{
			AccountID:           1,
			AccountName:         "A",
			AccountKind:         "brokerage",
			Institution:         "I",
			Symbol:              "NVDA",
			Quantity:            "10",
			AvgCost:             stringPtr("100.00"),
			CostCurrency:        "USD",
			Price:               stringPtr("150.00"),
			PriceCurrency:       &usd,
			MarketValueDisplay:  stringPtr("1500.00"),
			CostValueDisplay:    stringPtr("1000.00"),
			NetCostValueDisplay: stringPtr("900.00"),
			RealizedPLDisplay:   stringPtr("100.00"),
			UnrealizedPLDisplay: stringPtr("500.00"),
		},
		{
			AccountID:           2,
			AccountName:         "B",
			AccountKind:         "brokerage",
			Institution:         "I",
			Symbol:              "NVDA",
			Quantity:            "6",
			AvgCost:             stringPtr("200.00"),
			CostCurrency:        "USD",
			Price:               stringPtr("150.00"),
			PriceCurrency:       &usd,
			MarketValueDisplay:  stringPtr("900.00"),
			CostValueDisplay:    stringPtr("1200.00"),
			NetCostValueDisplay: stringPtr("1080.00"),
			RealizedPLDisplay:   stringPtr("-20.00"),
			UnrealizedPLDisplay: stringPtr("-300.00"),
		},
	}
	groups := buildSymbolPositionGroups(positions, decimal.RequireFromString("2400"), decimal.RequireFromString("4800"), "USD")
	if len(groups) != 1 {
		t.Fatalf("groups=%d, want 1", len(groups))
	}
	g := groups[0]
	if g.Quantity != "16" {
		t.Fatalf("quantity=%s, want 16", g.Quantity)
	}
	if g.AvgCost == nil || *g.AvgCost != "137.50" {
		t.Fatalf("weighted avg cost=%v, want 137.50", g.AvgCost)
	}
	if g.NetCost == nil || *g.NetCost != "123.75" {
		t.Fatalf("net avg cost=%v, want 123.75", g.NetCost)
	}
	if g.NetCostValueDisplay == nil || *g.NetCostValueDisplay != "1980.00" {
		t.Fatalf("net cost value=%v, want 1980.00", g.NetCostValueDisplay)
	}
	if g.RealizedPLDisplay == nil || *g.RealizedPLDisplay != "80.00" {
		t.Fatalf("realized pl=%v, want 80.00", g.RealizedPLDisplay)
	}
	if g.Weight == nil || *g.Weight != "100.00" {
		t.Fatalf("position weight=%v, want 100.00", g.Weight)
	}
	if g.AssetWeight == nil || *g.AssetWeight != "50.00" {
		t.Fatalf("asset weight=%v, want 50.00", g.AssetWeight)
	}
}

func TestAllocationBuilderIncludesAssetKind(t *testing.T) {
	alloc := newAllocationBuilder()
	alloc.add("asset_kind", "equity", "equity", decimal.RequireFromString("75"))
	alloc.add("asset_kind", "cash", "cash", decimal.RequireFromString("25"))

	buckets := alloc.build(map[string]decimal.Decimal{"asset_kind": decimal.RequireFromString("100")})["asset_kind"]
	if len(buckets) != 2 {
		t.Fatalf("bucket count=%d, want 2", len(buckets))
	}
	if buckets[0].Key != "equity" || buckets[0].Percent != "75.00" {
		t.Fatalf("first bucket=%+v, want equity 75.00", buckets[0])
	}
}

func TestQuoteCurrencyExposureDenominatorUsesNetBucketAbs(t *testing.T) {
	alloc := newAllocationBuilder()
	alloc.add("quote_currency", "USD", "USD", decimal.RequireFromString("1000"))
	alloc.add("quote_currency", "USD", "USD", decimal.RequireFromString("-400"))

	denom := alloc.absTotal("quote_currency")
	if !denom.Equal(decimal.RequireFromString("600")) {
		t.Fatalf("denominator=%s, want 600", denom)
	}

	buckets := alloc.build(map[string]decimal.Decimal{"quote_currency": denom})["quote_currency"]
	if len(buckets) != 1 {
		t.Fatalf("bucket count=%d, want 1", len(buckets))
	}
	if buckets[0].Value != "600.00" {
		t.Fatalf("USD exposure value=%s, want 600.00", buckets[0].Value)
	}
	if buckets[0].Percent != "100.00" {
		t.Fatalf("USD exposure percent=%s, want 100.00", buckets[0].Percent)
	}
}

func TestQuoteCurrencyExposureDenominatorSumsAbsoluteNetBuckets(t *testing.T) {
	alloc := newAllocationBuilder()
	alloc.add("quote_currency", "USD", "USD", decimal.RequireFromString("1000"))
	alloc.add("quote_currency", "USD", "USD", decimal.RequireFromString("-400"))
	alloc.add("quote_currency", "HKD", "HKD", decimal.RequireFromString("300"))
	alloc.add("quote_currency", "HKD", "HKD", decimal.RequireFromString("-800"))

	denom := alloc.absTotal("quote_currency")
	if !denom.Equal(decimal.RequireFromString("1100")) {
		t.Fatalf("denominator=%s, want 1100", denom)
	}

	buckets := alloc.build(map[string]decimal.Decimal{"quote_currency": denom})["quote_currency"]
	var totalPct decimal.Decimal
	for _, b := range buckets {
		pct := decimal.RequireFromString(b.Percent)
		if pct.IsNegative() {
			pct = pct.Abs()
		}
		totalPct = totalPct.Add(pct)
	}
	if totalPct.StringFixed(2) != "100.00" {
		t.Fatalf("absolute percent sum=%s, want 100.00", totalPct.StringFixed(2))
	}
}

func TestCompleteTargetItemsForActualsAddsZeroTargets(t *testing.T) {
	set := AllocationTargetSet{
		Items: []AllocationTargetItem{
			{DimensionValue: "equity", TargetPct: "70.00"},
		},
	}
	completeTargetItemsForActuals(&set, map[string]string{
		"cash":   "10.00",
		"equity": "60.00",
		"bond":   "30.00",
	})

	if len(set.Items) != 3 {
		t.Fatalf("item count=%d, want 3", len(set.Items))
	}
	if set.Items[1].DimensionValue != "bond" || set.Items[1].TargetPct != "0.00" {
		t.Fatalf("first missing item=%+v, want bond 0.00", set.Items[1])
	}
	if set.Items[2].DimensionValue != "cash" || set.Items[2].TargetPct != "0.00" {
		t.Fatalf("second missing item=%+v, want cash 0.00", set.Items[2])
	}
}

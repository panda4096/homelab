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
	if g.Weight == nil || *g.Weight != "100.00" {
		t.Fatalf("position weight=%v, want 100.00", g.Weight)
	}
	if g.AssetWeight == nil || *g.AssetWeight != "50.00" {
		t.Fatalf("asset weight=%v, want 50.00", g.AssetWeight)
	}
}

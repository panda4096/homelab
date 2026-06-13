package store

import "testing"

func tev(date string, id int64, kind, qty, price, fee string) replayEvent {
	return replayEvent{date: date, rank: 0, id: id, kind: kind, quantity: mustDec(qty), price: mustDec(price), fee: mustDec(fee)}
}

func tca(date string, id int64, kind, num, den string) replayEvent {
	return replayEvent{date: date, rank: 1, id: id, kind: kind, ratioNum: mustDec(num), ratioDen: mustDec(den)}
}

func TestReplayBuySellSplitRealizedPreserved(t *testing.T) {
	// PRD §6.17 worked example: 1.00 buy 100, 10.00 sell 50 → realized 450;
	// then 1→2 split → qty 100, weighted cost 0.5, realized stays 450.
	events := []replayEvent{
		tev("2025-01-01", 1, "buy", "100", "1.00", "0"),
		tev("2025-02-01", 2, "sell", "50", "10.00", "0"),
		tca("2025-03-01", 3, "split", "2", "1"),
	}
	st := replayHolding(HoldingState{}, events, false)
	if !st.Quantity.Equal(mustDec("100")) {
		t.Fatalf("quantity = %s, want 100", st.Quantity)
	}
	if !st.WeightedBuyCost.Equal(mustDec("0.5")) {
		t.Fatalf("weighted_buy_cost = %s, want 0.5", st.WeightedBuyCost)
	}
	if !st.RealizedPL.Equal(mustDec("450")) {
		t.Fatalf("realized_pl = %s, want 450", st.RealizedPL)
	}
}

func TestReplayWeightedCostAndBuyFeeModes(t *testing.T) {
	events := []replayEvent{
		tev("2025-01-01", 1, "buy", "10", "100", "5"),
		tev("2025-02-01", 2, "buy", "6", "200", "0"),
	}
	// default: buy fee NOT in cost → weighted = (10*100 + 6*200)/16 = 137.5
	def := replayHolding(HoldingState{}, events, false)
	if !def.WeightedBuyCost.Equal(mustDec("137.5")) {
		t.Fatalf("weighted (fee excluded) = %s, want 137.5", def.WeightedBuyCost)
	}
	if !def.BuyFeeTotal.Equal(mustDec("5")) {
		t.Fatalf("buy_fee_total = %s, want 5", def.BuyFeeTotal)
	}
	// fee in cost → first lot 1005/10 = 100.5, then (1005+1200)/16 = 137.8125
	inc := replayHolding(HoldingState{}, events, true)
	if !inc.WeightedBuyCost.Equal(mustDec("137.8125")) {
		t.Fatalf("weighted (fee included) = %s, want 137.8125", inc.WeightedBuyCost)
	}
}

func TestReplayHoldingStartResetsAfterFlatten(t *testing.T) {
	events := []replayEvent{
		tev("2025-01-01", 1, "buy", "5", "1", "0"),
		tev("2025-02-01", 2, "sell", "5", "2", "0"), // flat → segment ends
		tev("2025-03-01", 3, "buy", "3", "1", "0"),  // new segment starts here
	}
	st := replayHolding(HoldingState{}, events, false)
	if !st.Quantity.Equal(mustDec("3")) {
		t.Fatalf("quantity = %s, want 3", st.Quantity)
	}
	if st.HoldingStartDate != "2025-03-01" {
		t.Fatalf("holding_start = %q, want 2025-03-01", st.HoldingStartDate)
	}
}

func TestReplayMergeReverseOfSplit(t *testing.T) {
	// 2→1 merge halves quantity and doubles weighted cost.
	events := []replayEvent{
		tev("2025-01-01", 1, "buy", "100", "2", "0"),
		tca("2025-02-01", 2, "merge", "1", "2"),
	}
	st := replayHolding(HoldingState{}, events, false)
	if !st.Quantity.Equal(mustDec("50")) {
		t.Fatalf("quantity = %s, want 50", st.Quantity)
	}
	if !st.WeightedBuyCost.Equal(mustDec("4")) {
		t.Fatalf("weighted = %s, want 4", st.WeightedBuyCost)
	}
}

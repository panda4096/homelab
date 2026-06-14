package httpapi

import (
	"testing"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

func TestCompactAgentResultKeepsLosses(t *testing.T) {
	loss := "-51244.52"
	lossPct := "-17.59"
	gain := "85384.25"
	gainPct := "70.92"
	got := compactAgentResult([]store.ValuationPosition{
		{Symbol: "MU", UnrealizedPLDisplay: &gain, UnrealizedPLPct: &gainPct},
		{Symbol: "0700.HK", UnrealizedPLDisplay: &loss, UnrealizedPLPct: &lossPct},
	}).(map[string]any)

	losses := got["top_losses"].([]map[string]any)
	if len(losses) != 1 {
		t.Fatalf("got %d losses, want 1", len(losses))
	}
	if losses[0]["symbol"] != "0700.HK" {
		t.Fatalf("top loss symbol = %v, want 0700.HK", losses[0]["symbol"])
	}
	if losses[0]["unrealized_pl_display"] != loss {
		t.Fatalf("top loss amount = %v, want %s", losses[0]["unrealized_pl_display"], loss)
	}
}

func TestAgentResponseCarriesVisibleSteps(t *testing.T) {
	out := agentResponse(agentSkillOutcome{
		Skill:    Skill{Name: "holdings.listCurrent", Type: "read"},
		Params:   map[string]any{"display_currency": "CNY"},
		RowCount: 12,
	}, "已完成。", []agentStep{
		{Key: "plan_1", Label: "规划下一步", Status: "done"},
		{Key: "tool_1", Label: "查询数据", Status: "done", RowCount: 12},
	})

	if out["reply"] != "已完成。" {
		t.Fatalf("reply = %v", out["reply"])
	}
	steps := out["steps"].([]agentStep)
	if len(steps) != 2 {
		t.Fatalf("steps len = %d, want 2", len(steps))
	}
	if steps[1].Label != "查询数据" || steps[1].RowCount != 12 {
		t.Fatalf("unexpected second step: %+v", steps[1])
	}
}

func TestShouldRefreshHoldingsForCorrection(t *testing.T) {
	history := []agentChatMessage{
		{Role: "user", Text: "我亏得最多的是什么"},
		{Role: "assistant", Text: "DRAM +18.11%，AAPL +16.91%，这些盈利稳健。"},
	}
	if !shouldRefreshHoldingsForCorrection("盈利稳健加钱光？你逻辑不对吧", history) {
		t.Fatal("expected holdings refresh for corrective follow-up")
	}
	if shouldRefreshHoldingsForCorrection("这个文案不对，帮我改短一点", nil) {
		t.Fatal("did not expect holdings refresh for non-portfolio copy correction")
	}
}

func TestParseAgentActionExtractsJSONObject(t *testing.T) {
	got, err := parseAgentAction("我会先处理：\n{\"action\":\"run_skill\",\"skill\":\"holdings.listCurrent\",\"params\":{}}\n谢谢")
	if err != nil {
		t.Fatalf("parseAgentAction returned error: %v", err)
	}
	if got.Action != "run_skill" || got.Skill != "holdings.listCurrent" {
		t.Fatalf("unexpected action: %+v", got)
	}
}

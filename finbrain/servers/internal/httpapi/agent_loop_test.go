package httpapi

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
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

func TestAgentInitialMessagesPreserveConversationRoles(t *testing.T) {
	s := &Server{cfg: &config.Config{Location: time.UTC}}
	got := s.agentInitialMessages(context.Background(), "我现在亏得最多是什么？", []agentChatMessage{
		{Role: "user", Text: "先看持仓"},
		{Role: "assistant", Text: "已经查过当前持仓。"},
	})
	if len(got) != 3 {
		t.Fatalf("messages len = %d, want 3", len(got))
	}
	if got[0].Role != "user" || got[1].Role != "assistant" || got[2].Role != "user" {
		t.Fatalf("roles = %q, %q, %q", got[0].Role, got[1].Role, got[2].Role)
	}
	if !containsAny(got[2].Content, []string{"用户问题:我现在亏得最多是什么？"}) {
		t.Fatalf("current question message = %q", got[2].Content)
	}
}

func TestParseToolCallArgsRequiresJSONObject(t *testing.T) {
	got, err := parseToolCallArgs(json.RawMessage(`{"display_currency":"CNY"}`))
	if err != nil {
		t.Fatal(err)
	}
	if got["display_currency"] != "CNY" {
		t.Fatalf("display_currency = %v", got["display_currency"])
	}
	if _, err := parseToolCallArgs(json.RawMessage(`[1,2]`)); err == nil {
		t.Fatal("expected non-object args to fail")
	}
}

func TestAgentNativeToolsUseProviderSafeNames(t *testing.T) {
	s := &Server{}
	tools, names := s.agentNativeToolContext()
	if len(tools) == 0 {
		t.Fatal("expected tools")
	}
	found := false
	for _, tool := range tools {
		if containsAny(tool.Name, []string{"."}) {
			t.Fatalf("wire tool name contains dot: %q", tool.Name)
		}
		if tool.Name == "holdings_listCurrent" {
			found = true
			if names[tool.Name] != "holdings.listCurrent" {
				t.Fatalf("mapped name = %q", names[tool.Name])
			}
		}
	}
	if !found {
		t.Fatal("did not find holdings_listCurrent wire tool")
	}
}

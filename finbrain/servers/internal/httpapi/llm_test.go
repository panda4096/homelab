package httpapi

import (
	"testing"

	"github.com/panda4096/homelab/finbrain/servers/internal/llm"
)

func TestStripCodeFence(t *testing.T) {
	cases := map[string]string{
		"```sql\nSELECT 1\n```": "SELECT 1",
		"```\nSELECT 2\n```":    "SELECT 2",
		"SELECT 3":              "SELECT 3",
	}
	for in, want := range cases {
		if got := stripCodeFence(in); got != want {
			t.Errorf("stripCodeFence(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestLLMUserMessageForInsufficientBalance(t *testing.T) {
	got := llmUserMessage(llm.UpstreamError{StatusCode: 402, Message: "Insufficient Balance"})
	if got != "模型服务余额不足" {
		t.Fatalf("got %q, want 模型服务余额不足", got)
	}
}

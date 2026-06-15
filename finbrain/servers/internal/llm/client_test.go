package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
)

func TestNewAnthropicDefaultModelIsCurrent(t *testing.T) {
	c := New(&config.Config{AnthropicAPIKey: "anthropic-key"})
	if c.Model() != "claude-sonnet-4-6" {
		t.Fatalf("model = %q, want claude-sonnet-4-6", c.Model())
	}
}

func TestCompleteDeepSeekMessagesSendsNativeToolsAndParsesToolCall(t *testing.T) {
	var body map[string]any
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("Authorization = %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(`{
			"model":"deepseek-v4-flash",
			"choices":[{"message":{"content":"","tool_calls":[{"id":"call_1","type":"function","function":{"name":"holdings.listCurrent","arguments":"{\"display_currency\":\"CNY\"}"}}]}}],
			"usage":{"prompt_tokens":20,"prompt_cache_hit_tokens":15,"prompt_cache_miss_tokens":5,"completion_tokens":3,"total_tokens":23}
		}`))
	}))
	defer ts.Close()

	c := &Client{provider: "deepseek", apiKey: "test-key", model: "deepseek-v4-flash", baseURL: ts.URL, http: ts.Client()}
	var usage Usage
	resp, err := c.CompleteMessagesWithOptions(context.Background(), ChatRequest{
		System: "system",
		Messages: []Message{
			{Role: "user", Content: "我亏得最多的是什么"},
		},
		Tools: []Tool{{
			Name:        "holdings.listCurrent",
			Description: "当前持仓",
			InputSchema: json.RawMessage(`{"type":"object","properties":{"display_currency":{"type":"string"}}}`),
		}},
		ToolChoice: "auto",
	}, Options{OnUsage: func(part Usage) { usage = part }})
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.ToolCalls) != 1 || resp.ToolCalls[0].Name != "holdings.listCurrent" {
		t.Fatalf("tool calls = %+v", resp.ToolCalls)
	}
	if string(resp.ToolCalls[0].Arguments) != `{"display_currency":"CNY"}` {
		t.Fatalf("arguments = %s", resp.ToolCalls[0].Arguments)
	}
	if usage.PromptCacheHitTokens != 15 || usage.PromptCacheMissTokens != 5 {
		t.Fatalf("usage = %+v", usage)
	}
	if body["tool_choice"] != "auto" {
		t.Fatalf("tool_choice = %v", body["tool_choice"])
	}
	tools := body["tools"].([]any)
	fn := tools[0].(map[string]any)["function"].(map[string]any)
	if fn["name"] != "holdings.listCurrent" {
		t.Fatalf("tool name = %v", fn["name"])
	}
}

func TestCompleteAnthropicMessagesUsesCacheControlAndParsesToolUse(t *testing.T) {
	var body map[string]any
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("x-api-key"); got != "anthropic-key" {
			t.Fatalf("x-api-key = %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(`{
			"model":"claude-sonnet-4-6",
			"usage":{"input_tokens":100,"cache_read_input_tokens":80,"cache_creation_input_tokens":20,"output_tokens":10},
			"content":[{"type":"tool_use","id":"toolu_1","name":"portfolio.getSnapshot","input":{"display_currency":"CNY"}}]
		}`))
	}))
	defer ts.Close()

	c := &Client{provider: "anthropic", apiKey: "anthropic-key", model: "claude-sonnet-4-6", baseURL: ts.URL, http: ts.Client()}
	var usage Usage
	resp, err := c.CompleteMessagesWithOptions(context.Background(), ChatRequest{
		System:   "system",
		Messages: []Message{{Role: "user", Content: "总结资产"}},
		Tools:    []Tool{{Name: "portfolio.getSnapshot", Description: "资产快照", InputSchema: json.RawMessage(`{"type":"object"}`)}},
	}, Options{OnUsage: func(part Usage) { usage = part }})
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.ToolCalls) != 1 || resp.ToolCalls[0].ID != "toolu_1" {
		t.Fatalf("tool calls = %+v", resp.ToolCalls)
	}
	cacheControl := body["cache_control"].(map[string]any)
	if cacheControl["type"] != "ephemeral" {
		t.Fatalf("cache_control = %+v", cacheControl)
	}
	if body["model"] != "claude-sonnet-4-6" {
		t.Fatalf("model = %v", body["model"])
	}
	if usage.PromptCacheHitTokens != 80 || usage.PromptCacheMissTokens != 20 || usage.CompletionTokens != 10 {
		t.Fatalf("usage = %+v", usage)
	}
}

func TestParseDeepSeekStreamDeltaSeparatesContentAndReasoning(t *testing.T) {
	got, err := parseDeepSeekStreamDelta([]byte(`{"choices":[{"delta":{"reasoning_content":"先查数据","content":"净资产"}}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if got.Content != "净资产" {
		t.Fatalf("content = %q, want 净资产", got.Content)
	}
	if got.Reasoning != "先查数据" {
		t.Fatalf("reasoning = %q, want 先查数据", got.Reasoning)
	}
}

func TestParseDeepSeekStreamDeltaAllowsEmptyChoices(t *testing.T) {
	got, err := parseDeepSeekStreamDelta([]byte(`{"choices":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	if got.Content != "" || got.Reasoning != "" || got.Usage != nil {
		t.Fatalf("delta = %+v, want empty", got)
	}
}

func TestParseDeepSeekStreamDeltaIncludesUsage(t *testing.T) {
	got, err := parseDeepSeekStreamDelta([]byte(`{
		"model":"deepseek-v4-flash",
		"choices":[],
		"usage":{
			"prompt_tokens":100,
			"prompt_cache_hit_tokens":80,
			"prompt_cache_miss_tokens":20,
			"completion_tokens":30,
			"completion_tokens_details":{"reasoning_tokens":7},
			"total_tokens":130
		}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if got.Usage == nil {
		t.Fatal("usage is nil")
	}
	if got.Usage.Model != "deepseek-v4-flash" {
		t.Fatalf("model = %q", got.Usage.Model)
	}
	if got.Usage.PromptCacheHitTokens != 80 || got.Usage.PromptCacheMissTokens != 20 {
		t.Fatalf("cache tokens = hit %d miss %d", got.Usage.PromptCacheHitTokens, got.Usage.PromptCacheMissTokens)
	}
	if got.Usage.ReasoningTokens != 7 {
		t.Fatalf("reasoning tokens = %d, want 7", got.Usage.ReasoningTokens)
	}
}

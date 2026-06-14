package llm

import "testing"

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

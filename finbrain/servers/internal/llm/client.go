package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
)

// ErrNotConfigured is returned when no LLM API key is set.
var ErrNotConfigured = errors.New("llm not configured")

type UpstreamError struct {
	StatusCode int
	Message    string
	Body       string
}

func (e UpstreamError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("llm upstream %d: %s", e.StatusCode, e.Message)
	}
	return fmt.Sprintf("llm upstream %d", e.StatusCode)
}

type Options struct {
	Model    string
	Thinking bool
	OnUsage  func(Usage)
}

type StreamDelta struct {
	Content   string
	Reasoning string
	Usage     *Usage
}

type Usage struct {
	Model                 string `json:"model,omitempty"`
	PromptTokens          int    `json:"prompt_tokens,omitempty"`
	PromptCacheHitTokens  int    `json:"prompt_cache_hit_tokens,omitempty"`
	PromptCacheMissTokens int    `json:"prompt_cache_miss_tokens,omitempty"`
	CompletionTokens      int    `json:"completion_tokens,omitempty"`
	ReasoningTokens       int    `json:"reasoning_tokens,omitempty"`
	TotalTokens           int    `json:"total_tokens,omitempty"`
}

func (u Usage) Empty() bool {
	return u.PromptTokens == 0 &&
		u.PromptCacheHitTokens == 0 &&
		u.PromptCacheMissTokens == 0 &&
		u.CompletionTokens == 0 &&
		u.ReasoningTokens == 0 &&
		u.TotalTokens == 0
}

func (u *Usage) UnmarshalJSON(raw []byte) error {
	type alias Usage
	var aux struct {
		*alias
		CompletionTokensDetails struct {
			ReasoningTokens int `json:"reasoning_tokens"`
		} `json:"completion_tokens_details"`
	}
	aux.alias = (*alias)(u)
	if err := json.Unmarshal(raw, &aux); err != nil {
		return err
	}
	if u.ReasoningTokens == 0 {
		u.ReasoningTokens = aux.CompletionTokensDetails.ReasoningTokens
	}
	return nil
}

// Client talks to a chat-completion LLM. DeepSeek (OpenAI-compatible) is the
// default; Anthropic is a fallback. Credentials come from config, never logged.
type Client struct {
	provider string // "deepseek" | "anthropic"
	apiKey   string
	model    string
	baseURL  string
	http     *http.Client
}

// New builds a client from config. Returns a non-configured client (Configured()
// == false) when no key is present, so handlers can degrade gracefully (503).
func New(cfg *config.Config) *Client {
	c := &Client{http: &http.Client{Timeout: 45 * time.Second}}
	switch {
	case cfg.DeepSeekAPIKey != "":
		c.provider = "deepseek"
		c.apiKey = cfg.DeepSeekAPIKey
		c.baseURL = "https://api.deepseek.com/chat/completions"
		c.model = orDefault(cfg.LLMModel, "deepseek-v4-flash")
	case cfg.AnthropicAPIKey != "":
		c.provider = "anthropic"
		c.apiKey = cfg.AnthropicAPIKey
		c.baseURL = "https://api.anthropic.com/v1/messages"
		c.model = orDefault(cfg.LLMModel, "claude-3-5-sonnet-latest")
	}
	return c
}

func (c *Client) Configured() bool { return c.apiKey != "" }
func (c *Client) Provider() string { return c.provider }
func (c *Client) Model() string    { return c.model }

// Complete sends a system+user prompt and returns the assistant text. When
// jsonMode is true the model is asked to return a single JSON object.
func (c *Client) Complete(ctx context.Context, system, user string, jsonMode bool) (string, error) {
	return c.CompleteWithOptions(ctx, system, user, jsonMode, Options{})
}

func (c *Client) CompleteWithOptions(ctx context.Context, system, user string, jsonMode bool, opts Options) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}
	if c.provider == "anthropic" {
		return c.completeAnthropic(ctx, system, user, jsonMode, opts)
	}
	return c.completeDeepSeek(ctx, system, user, jsonMode, opts)
}

func (c *Client) StreamWithOptions(ctx context.Context, system, user string, opts Options, onDelta func(StreamDelta) error) (string, error) {
	if !c.Configured() {
		return "", ErrNotConfigured
	}
	if c.provider == "anthropic" {
		text, err := c.completeAnthropic(ctx, system, user, false, opts)
		if err != nil {
			return "", err
		}
		if onDelta != nil && text != "" {
			if err := onDelta(StreamDelta{Content: text}); err != nil {
				return "", err
			}
		}
		return text, nil
	}
	return c.streamDeepSeek(ctx, system, user, opts, onDelta)
}

func (c *Client) Probe(ctx context.Context) error {
	_, err := c.Complete(ctx, "你是健康检查端点。只返回 JSON。", `返回 {"ok":true}`, true)
	return err
}

func (c *Client) completeDeepSeek(ctx context.Context, system, user string, jsonMode bool, opts Options) (string, error) {
	model := orDefault(opts.Model, c.model)
	body := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
	}
	if !opts.Thinking {
		body["temperature"] = 0
	}
	if jsonMode {
		body["response_format"] = map[string]string{"type": "json_object"}
	}
	if strings.HasPrefix(model, "deepseek-v4-") {
		thinking := "disabled"
		if opts.Thinking {
			thinking = "enabled"
		}
		body["thinking"] = map[string]string{"type": thinking}
	}
	raw, err := c.post(ctx, c.baseURL, map[string]string{"Authorization": "Bearer " + c.apiKey}, body)
	if err != nil {
		return "", err
	}
	var resp struct {
		Model   string `json:"model"`
		Usage   Usage  `json:"usage"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return "", fmt.Errorf("llm decode: %w", err)
	}
	if !resp.Usage.Empty() && opts.OnUsage != nil {
		if resp.Usage.Model == "" {
			resp.Usage.Model = orDefault(resp.Model, model)
		}
		opts.OnUsage(resp.Usage)
	}
	if len(resp.Choices) == 0 {
		return "", errors.New("llm returned no choices")
	}
	return resp.Choices[0].Message.Content, nil
}

func (c *Client) streamDeepSeek(ctx context.Context, system, user string, opts Options, onDelta func(StreamDelta) error) (string, error) {
	model := orDefault(opts.Model, c.model)
	body := map[string]any{
		"model":          model,
		"stream":         true,
		"stream_options": map[string]bool{"include_usage": true},
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
	}
	if !opts.Thinking {
		body["temperature"] = 0
	}
	if strings.HasPrefix(model, "deepseek-v4-") {
		thinking := "disabled"
		if opts.Thinking {
			thinking = "enabled"
		}
		body["thinking"] = map[string]string{"type": thinking}
	}

	buf, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	res, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		raw, readErr := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		if readErr != nil {
			return "", readErr
		}
		return "", UpstreamError{StatusCode: res.StatusCode, Message: upstreamMessage(raw), Body: string(raw)}
	}

	var out strings.Builder
	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ":") {
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		if data == "[DONE]" {
			return out.String(), nil
		}
		delta, err := parseDeepSeekStreamDelta([]byte(data))
		if err != nil {
			return "", err
		}
		if delta.Usage != nil && !delta.Usage.Empty() && opts.OnUsage != nil {
			if delta.Usage.Model == "" {
				delta.Usage.Model = model
			}
			opts.OnUsage(*delta.Usage)
		}
		if delta.Content == "" && delta.Reasoning == "" {
			continue
		}
		if delta.Content != "" {
			out.WriteString(delta.Content)
		}
		if onDelta != nil {
			if err := onDelta(delta); err != nil {
				return "", err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	return out.String(), nil
}

func parseDeepSeekStreamDelta(raw []byte) (StreamDelta, error) {
	var resp struct {
		Model   string `json:"model"`
		Usage   *Usage `json:"usage"`
		Choices []struct {
			Delta struct {
				Content          string `json:"content"`
				ReasoningContent string `json:"reasoning_content"`
			} `json:"delta"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return StreamDelta{}, fmt.Errorf("llm stream decode: %w", err)
	}
	if len(resp.Choices) == 0 {
		if resp.Usage != nil && resp.Usage.Model == "" {
			resp.Usage.Model = resp.Model
		}
		return StreamDelta{Usage: resp.Usage}, nil
	}
	return StreamDelta{Content: resp.Choices[0].Delta.Content, Reasoning: resp.Choices[0].Delta.ReasoningContent, Usage: resp.Usage}, nil
}

func (c *Client) completeAnthropic(ctx context.Context, system, user string, jsonMode bool, opts Options) (string, error) {
	if jsonMode {
		user += "\n\n只返回一个 JSON 对象，不要包含其他文字或代码块标记。"
	}
	model := orDefault(opts.Model, c.model)
	body := map[string]any{
		"model":      model,
		"max_tokens": 2048,
		"system":     system,
		"messages":   []map[string]string{{"role": "user", "content": user}},
	}
	raw, err := c.post(ctx, c.baseURL, map[string]string{"x-api-key": c.apiKey, "anthropic-version": "2023-06-01"}, body)
	if err != nil {
		return "", err
	}
	var resp struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return "", fmt.Errorf("llm decode: %w", err)
	}
	if len(resp.Content) == 0 {
		return "", errors.New("llm returned no content")
	}
	return resp.Content[0].Text, nil
}

func (c *Client) post(ctx context.Context, url string, headers map[string]string, body any) ([]byte, error) {
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 300 {
		return nil, UpstreamError{StatusCode: res.StatusCode, Message: upstreamMessage(raw), Body: string(raw)}
	}
	return raw, nil
}

func upstreamMessage(raw []byte) string {
	var body struct {
		Error struct {
			Message string `json:"message"`
			Code    string `json:"code"`
			Type    string `json:"type"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &body); err == nil {
		if body.Error.Message != "" {
			return body.Error.Message
		}
		if body.Error.Code != "" {
			return body.Error.Code
		}
		if body.Error.Type != "" {
			return body.Error.Type
		}
	}
	return ""
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

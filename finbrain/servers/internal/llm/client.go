package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
)

// ErrNotConfigured is returned when no LLM API key is set.
var ErrNotConfigured = errors.New("llm not configured")

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
		c.model = orDefault(cfg.LLMModel, "deepseek-chat")
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
	if !c.Configured() {
		return "", ErrNotConfigured
	}
	if c.provider == "anthropic" {
		return c.completeAnthropic(ctx, system, user, jsonMode)
	}
	return c.completeDeepSeek(ctx, system, user, jsonMode)
}

func (c *Client) completeDeepSeek(ctx context.Context, system, user string, jsonMode bool) (string, error) {
	body := map[string]any{
		"model":       c.model,
		"temperature": 0,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
	}
	if jsonMode {
		body["response_format"] = map[string]string{"type": "json_object"}
	}
	raw, err := c.post(ctx, c.baseURL, map[string]string{"Authorization": "Bearer " + c.apiKey}, body)
	if err != nil {
		return "", err
	}
	var resp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return "", fmt.Errorf("llm decode: %w", err)
	}
	if len(resp.Choices) == 0 {
		return "", errors.New("llm returned no choices")
	}
	return resp.Choices[0].Message.Content, nil
}

func (c *Client) completeAnthropic(ctx context.Context, system, user string, jsonMode bool) (string, error) {
	if jsonMode {
		user += "\n\n只返回一个 JSON 对象，不要包含其他文字或代码块标记。"
	}
	body := map[string]any{
		"model":      c.model,
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
		return nil, fmt.Errorf("llm upstream %d", res.StatusCode)
	}
	return raw, nil
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

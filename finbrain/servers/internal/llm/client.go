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
	"sort"
	"strings"

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

type Message struct {
	Role       string
	Content    string
	ToolCallID string
	ToolCalls  []ToolCall
}

type Tool struct {
	Name        string
	Description string
	InputSchema json.RawMessage
}

type ToolCall struct {
	ID        string
	Name      string
	Arguments json.RawMessage
}

type ChatRequest struct {
	System     string
	Messages   []Message
	Tools      []Tool
	ToolChoice string // "auto" | "none" | ""
	JSONMode   bool
}

type ChatResponse struct {
	Content   string
	ToolCalls []ToolCall
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
	c := &Client{http: &http.Client{}}
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
		c.model = orDefault(cfg.LLMModel, "claude-sonnet-4-6")
	}
	return c
}

// NewExplicit builds a client from explicit per-user credentials (decrypted at the call site).
// Any provider other than "anthropic" uses the OpenAI-compatible chat-completions path, so a
// custom baseURL points Copilot at any OpenAI-compatible endpoint (DeepSeek is the default).
func NewExplicit(provider, apiKey, baseURL, model string) *Client {
	c := &Client{
		http:     &http.Client{},
		provider: orDefault(strings.ToLower(strings.TrimSpace(provider)), "deepseek"),
		apiKey:   strings.TrimSpace(apiKey),
		baseURL:  strings.TrimSpace(baseURL),
		model:    strings.TrimSpace(model),
	}
	if c.baseURL == "" {
		switch c.provider {
		case "anthropic":
			c.baseURL = "https://api.anthropic.com/v1/messages"
		case "openai":
			c.baseURL = "https://api.openai.com/v1/chat/completions"
		default:
			c.baseURL = "https://api.deepseek.com/chat/completions"
		}
	}
	if c.model == "" {
		switch c.provider {
		case "anthropic":
			c.model = "claude-sonnet-4-6"
		case "openai":
			c.model = "gpt-4o-mini"
		default:
			c.model = "deepseek-v4-flash"
		}
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
	resp, err := c.CompleteMessagesWithOptions(ctx, ChatRequest{
		System:   system,
		Messages: []Message{{Role: "user", Content: user}},
		JSONMode: jsonMode,
	}, opts)
	if err != nil {
		return "", err
	}
	return resp.Content, nil
}

func (c *Client) CompleteMessagesWithOptions(ctx context.Context, req ChatRequest, opts Options) (ChatResponse, error) {
	if !c.Configured() {
		return ChatResponse{}, ErrNotConfigured
	}
	if c.provider == "anthropic" {
		return c.completeAnthropicMessages(ctx, req, opts)
	}
	return c.completeDeepSeekMessages(ctx, req, opts)
}

func (c *Client) StreamWithOptions(ctx context.Context, system, user string, opts Options, onDelta func(StreamDelta) error) (string, error) {
	resp, err := c.StreamMessagesWithOptions(ctx, ChatRequest{System: system, Messages: []Message{{Role: "user", Content: user}}}, opts, onDelta)
	if err != nil {
		return "", err
	}
	return resp.Content, nil
}

func (c *Client) StreamMessagesWithOptions(ctx context.Context, req ChatRequest, opts Options, onDelta func(StreamDelta) error) (ChatResponse, error) {
	if !c.Configured() {
		return ChatResponse{}, ErrNotConfigured
	}
	if c.provider == "anthropic" {
		resp, err := c.completeAnthropicMessages(ctx, req, opts)
		if err != nil {
			return ChatResponse{}, err
		}
		if onDelta != nil && resp.Content != "" {
			if err := onDelta(StreamDelta{Content: resp.Content}); err != nil {
				return ChatResponse{}, err
			}
		}
		return resp, nil
	}
	return c.streamDeepSeekMessages(ctx, req, opts, onDelta)
}

func (c *Client) Probe(ctx context.Context) error {
	_, err := c.Complete(ctx, "你是健康检查端点。只返回 JSON。", `返回 {"ok":true}`, true)
	return err
}

// ListModels fetches the available model ids from the provider's OpenAI-compatible /models
// endpoint (derived from the chat-completions baseURL). Anthropic is not supported here.
func (c *Client) ListModels(ctx context.Context) ([]string, error) {
	if !c.Configured() {
		return nil, ErrNotConfigured
	}
	if c.provider == "anthropic" {
		return nil, errors.New("该服务商不支持动态获取模型列表")
	}
	base := strings.TrimSuffix(strings.TrimSuffix(c.baseURL, "/"), "/chat/completions")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
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
	var body struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, fmt.Errorf("llm models decode: %w", err)
	}
	out := make([]string, 0, len(body.Data))
	for _, m := range body.Data {
		if id := strings.TrimSpace(m.ID); id != "" {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out, nil
}

func (c *Client) completeDeepSeekMessages(ctx context.Context, req ChatRequest, opts Options) (ChatResponse, error) {
	model := orDefault(opts.Model, c.model)
	body := map[string]any{
		"model":    model,
		"messages": deepSeekMessages(req.System, req.Messages),
	}
	if !opts.Thinking {
		body["temperature"] = 0
	}
	if req.JSONMode {
		body["response_format"] = map[string]string{"type": "json_object"}
	}
	if len(req.Tools) > 0 {
		body["tools"] = deepSeekTools(req.Tools)
		if req.ToolChoice != "" {
			body["tool_choice"] = req.ToolChoice
		}
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
		return ChatResponse{}, err
	}
	var resp struct {
		Model   string `json:"model"`
		Usage   Usage  `json:"usage"`
		Choices []struct {
			Message struct {
				Content   string             `json:"content"`
				ToolCalls []deepSeekToolCall `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return ChatResponse{}, fmt.Errorf("llm decode: %w", err)
	}
	if !resp.Usage.Empty() && opts.OnUsage != nil {
		if resp.Usage.Model == "" {
			resp.Usage.Model = orDefault(resp.Model, model)
		}
		opts.OnUsage(resp.Usage)
	}
	if len(resp.Choices) == 0 {
		return ChatResponse{}, errors.New("llm returned no choices")
	}
	msg := resp.Choices[0].Message
	return ChatResponse{Content: msg.Content, ToolCalls: toolCallsFromDeepSeek(msg.ToolCalls)}, nil
}

func (c *Client) streamDeepSeekMessages(ctx context.Context, chatReq ChatRequest, opts Options, onDelta func(StreamDelta) error) (ChatResponse, error) {
	model := orDefault(opts.Model, c.model)
	body := map[string]any{
		"model":          model,
		"stream":         true,
		"stream_options": map[string]bool{"include_usage": true},
		"messages":       deepSeekMessages(chatReq.System, chatReq.Messages),
	}
	if !opts.Thinking {
		body["temperature"] = 0
	}
	if len(chatReq.Tools) > 0 {
		body["tools"] = deepSeekTools(chatReq.Tools)
		if chatReq.ToolChoice != "" {
			body["tool_choice"] = chatReq.ToolChoice
		}
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
		return ChatResponse{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(buf))
	if err != nil {
		return ChatResponse{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	res, err := c.http.Do(httpReq)
	if err != nil {
		return ChatResponse{}, err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		raw, readErr := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		if readErr != nil {
			return ChatResponse{}, readErr
		}
		return ChatResponse{}, UpstreamError{StatusCode: res.StatusCode, Message: upstreamMessage(raw), Body: string(raw)}
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
			return ChatResponse{Content: out.String()}, nil
		}
		delta, err := parseDeepSeekStreamDelta([]byte(data))
		if err != nil {
			return ChatResponse{}, err
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
				return ChatResponse{}, err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return ChatResponse{}, err
	}
	return ChatResponse{Content: out.String()}, nil
}

type deepSeekToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

func deepSeekMessages(system string, messages []Message) []map[string]any {
	out := make([]map[string]any, 0, len(messages)+1)
	if strings.TrimSpace(system) != "" {
		out = append(out, map[string]any{"role": "system", "content": system})
	}
	for _, msg := range messages {
		role := strings.TrimSpace(strings.ToLower(msg.Role))
		switch role {
		case "assistant":
			item := map[string]any{"role": "assistant", "content": msg.Content}
			if len(msg.ToolCalls) > 0 {
				calls := make([]map[string]any, 0, len(msg.ToolCalls))
				for _, call := range msg.ToolCalls {
					calls = append(calls, map[string]any{
						"id":   call.ID,
						"type": "function",
						"function": map[string]string{
							"name":      call.Name,
							"arguments": string(call.Arguments),
						},
					})
				}
				item["tool_calls"] = calls
			}
			out = append(out, item)
		case "tool":
			out = append(out, map[string]any{"role": "tool", "tool_call_id": msg.ToolCallID, "content": msg.Content})
		default:
			if role != "user" {
				role = "user"
			}
			out = append(out, map[string]any{"role": role, "content": msg.Content})
		}
	}
	return out
}

func deepSeekTools(tools []Tool) []map[string]any {
	out := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		input := json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`)
		if len(tool.InputSchema) > 0 {
			input = tool.InputSchema
		}
		out = append(out, map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        tool.Name,
				"description": tool.Description,
				"parameters":  input,
			},
		})
	}
	return out
}

func toolCallsFromDeepSeek(calls []deepSeekToolCall) []ToolCall {
	out := make([]ToolCall, 0, len(calls))
	for i, call := range calls {
		if strings.TrimSpace(call.Function.Name) == "" {
			continue
		}
		id := call.ID
		if id == "" {
			id = fmt.Sprintf("call_%d", i+1)
		}
		args := strings.TrimSpace(call.Function.Arguments)
		if args == "" {
			args = "{}"
		}
		out = append(out, ToolCall{ID: id, Name: call.Function.Name, Arguments: json.RawMessage(args)})
	}
	return out
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

func (c *Client) completeAnthropicMessages(ctx context.Context, req ChatRequest, opts Options) (ChatResponse, error) {
	if req.JSONMode && len(req.Messages) > 0 {
		req.Messages[len(req.Messages)-1].Content += "\n\n只返回一个 JSON 对象，不要包含其他文字或代码块标记。"
	}
	model := orDefault(opts.Model, c.model)
	body := map[string]any{
		"model":         model,
		"max_tokens":    4096,
		"system":        req.System,
		"messages":      anthropicMessages(req.Messages),
		"cache_control": map[string]string{"type": "ephemeral"},
	}
	if len(req.Tools) > 0 {
		body["tools"] = anthropicTools(req.Tools)
		switch req.ToolChoice {
		case "auto", "":
			body["tool_choice"] = map[string]string{"type": "auto"}
		case "none":
			body["tool_choice"] = map[string]string{"type": "none"}
		}
	}
	raw, err := c.post(ctx, c.baseURL, map[string]string{"x-api-key": c.apiKey, "anthropic-version": "2023-06-01"}, body)
	if err != nil {
		return ChatResponse{}, err
	}
	var resp struct {
		Model string `json:"model"`
		Usage struct {
			InputTokens              int `json:"input_tokens"`
			CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
			CacheReadInputTokens     int `json:"cache_read_input_tokens"`
			OutputTokens             int `json:"output_tokens"`
		} `json:"usage"`
		Content []struct {
			Type  string          `json:"type"`
			Text  string          `json:"text"`
			ID    string          `json:"id"`
			Name  string          `json:"name"`
			Input json.RawMessage `json:"input"`
		} `json:"content"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return ChatResponse{}, fmt.Errorf("llm decode: %w", err)
	}
	if opts.OnUsage != nil {
		usage := Usage{
			Model:                 orDefault(resp.Model, model),
			PromptTokens:          resp.Usage.InputTokens,
			PromptCacheHitTokens:  resp.Usage.CacheReadInputTokens,
			PromptCacheMissTokens: maxInt(0, resp.Usage.InputTokens-resp.Usage.CacheReadInputTokens),
			CompletionTokens:      resp.Usage.OutputTokens,
			TotalTokens:           resp.Usage.InputTokens + resp.Usage.OutputTokens,
		}
		if !usage.Empty() {
			opts.OnUsage(usage)
		}
	}
	var text strings.Builder
	var calls []ToolCall
	for i, block := range resp.Content {
		switch block.Type {
		case "text":
			text.WriteString(block.Text)
		case "tool_use":
			id := block.ID
			if id == "" {
				id = fmt.Sprintf("toolu_%d", i+1)
			}
			input := block.Input
			if len(input) == 0 {
				input = json.RawMessage(`{}`)
			}
			calls = append(calls, ToolCall{ID: id, Name: block.Name, Arguments: input})
		}
	}
	if text.Len() == 0 && len(calls) == 0 {
		return ChatResponse{}, errors.New("llm returned no content")
	}
	return ChatResponse{Content: text.String(), ToolCalls: calls}, nil
}

func anthropicMessages(messages []Message) []map[string]any {
	out := make([]map[string]any, 0, len(messages))
	started := false
	for _, msg := range messages {
		role := strings.TrimSpace(strings.ToLower(msg.Role))
		// Anthropic requires the conversation to start with a user turn; a trimmed history
		// window can begin with an assistant message. Drop leading assistant messages so the
		// first emitted message is a user/tool turn (avoids a 400 on the Anthropic fallback).
		if !started && role == "assistant" {
			continue
		}
		started = true
		switch role {
		case "assistant":
			content := make([]map[string]any, 0, 1+len(msg.ToolCalls))
			if strings.TrimSpace(msg.Content) != "" {
				content = append(content, map[string]any{"type": "text", "text": msg.Content})
			}
			for _, call := range msg.ToolCalls {
				input := json.RawMessage(`{}`)
				if len(call.Arguments) > 0 {
					input = call.Arguments
				}
				content = append(content, map[string]any{
					"type":  "tool_use",
					"id":    call.ID,
					"name":  call.Name,
					"input": input,
				})
			}
			if len(content) == 0 {
				content = append(content, map[string]any{"type": "text", "text": ""})
			}
			out = append(out, map[string]any{"role": "assistant", "content": content})
		case "tool":
			out = append(out, map[string]any{"role": "user", "content": []map[string]any{{
				"type":        "tool_result",
				"tool_use_id": msg.ToolCallID,
				"content":     msg.Content,
			}}})
		default:
			out = append(out, map[string]any{"role": "user", "content": msg.Content})
		}
	}
	return out
}

func anthropicTools(tools []Tool) []map[string]any {
	out := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		input := json.RawMessage(`{"type":"object","properties":{},"additionalProperties":false}`)
		if len(tool.InputSchema) > 0 {
			input = tool.InputSchema
		}
		out = append(out, map[string]any{
			"name":         tool.Name,
			"description":  tool.Description,
			"input_schema": input,
		})
	}
	return out
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

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

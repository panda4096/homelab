package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/panda4096/homelab/finbrain/servers/internal/llm"
)

const (
	llmProbeSuccessTTL = time.Minute
	llmProbeFailureTTL = 10 * time.Second
)

type llmProbeCache struct {
	checkedAt time.Time
	available bool
	reason    string
}

// LLM status only. The former NL→SQL path (/llm/query) and NL→draft path
// (/llm/parse) are REMOVED: agents never author SQL or bypass the domain layer.
// All NL goes through the skill layer — /agent/plan picks a registered skill and
// the backend executes it (see agent.go). stripCodeFence is shared with the
// planner's JSON extraction.

// llmFor returns the LLM client for a user: their saved (decrypted) config when present, otherwise
// the env-configured default client. The result may be unconfigured (Configured()==false).
func (s *Server) llmFor(ctx context.Context, userID int64) *llm.Client {
	if cfg, err := s.store.GetActiveLLMConfig(ctx, userID); err == nil && cfg.HasKey {
		return llm.NewExplicit(cfg.Provider, cfg.APIKey, cfg.BaseURL, cfg.Model)
	}
	return s.llm
}

// listLLMModels fetches the upstream model list for a draft or existing provider so the user can
// pick from a dropdown instead of typing a model id. Accepts a transient plaintext api_key (for a
// not-yet-saved config) or an existing provider id (uses its stored key).
func (s *Server) listLLMModels(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID       *int64 `json:"id"`
		Provider string `json:"provider"`
		BaseURL  string `json:"base_url"`
		APIKey   string `json:"api_key"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	provider, baseURL, _, _, msg := validateProviderInput("", body.Provider, body.BaseURL, "")
	if msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	// Resolve the key: a transient draft key (body.api_key) takes precedence; otherwise fall back to
	// a stored provider's decrypted key — the given id, or the active provider when none is given
	// (lets the Copilot panel fetch "models of whatever's active" with an empty body). When falling
	// back, adopt that provider's own provider/base_url too.
	key := strings.TrimSpace(body.APIKey)
	if key == "" {
		if body.ID != nil {
			if p, err := s.store.GetLLMProvider(r.Context(), userOf(r), *body.ID); err == nil && p.HasKey {
				key, provider = p.APIKey, p.Provider
				if baseURL == "" {
					baseURL = p.BaseURL
				}
			}
		} else if p, err := s.store.GetActiveLLMConfig(r.Context(), userOf(r)); err == nil && p.HasKey {
			key, provider = p.APIKey, p.Provider
			if baseURL == "" {
				baseURL = p.BaseURL
			}
		}
	}
	if key == "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "请先填写 API Key 再获取模型")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	models, err := llm.NewExplicit(provider, key, baseURL, "").ListModels(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, "llm_unavailable", llmUserMessage(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

func (s *Server) getLLMStatus(w http.ResponseWriter, r *http.Request) {
	client := s.llmFor(r.Context(), userOf(r))
	available, reason := client.Configured(), ""
	if !client.Configured() {
		available = false
		reason = "未配置 LLM API Key"
	} else if r.URL.Query().Get("probe") == "1" {
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()
		available, reason = s.cachedLLMProbe(ctx, userOf(r), client)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": client.Configured(),
		"provider":   client.Provider(),
		"model":      client.Model(),
		"available":  available,
		"error":      reason,
	})
}

func (s *Server) cachedLLMProbe(ctx context.Context, userID int64, client *llm.Client) (bool, string) {
	s.llmProbeMu.Lock()
	if c, ok := s.llmProbe[userID]; ok && time.Since(c.checkedAt) < c.ttl() {
		s.llmProbeMu.Unlock()
		return c.available, c.reason
	}
	s.llmProbeMu.Unlock()

	available, reason := true, ""
	if err := client.Probe(ctx); err != nil {
		available, reason = false, llmUserMessage(err)
	}
	s.setLLMProbeCache(userID, available, reason)
	return available, reason
}

func (s *Server) setLLMProbeCache(userID int64, available bool, reason string) {
	s.llmProbeMu.Lock()
	if s.llmProbe == nil {
		s.llmProbe = map[int64]llmProbeCache{}
	}
	s.llmProbe[userID] = llmProbeCache{checkedAt: time.Now(), available: available, reason: reason}
	s.llmProbeMu.Unlock()
}

func (c llmProbeCache) ttl() time.Duration {
	if c.available {
		return llmProbeSuccessTTL
	}
	return llmProbeFailureTTL
}

func llmUserMessage(err error) string {
	if errors.Is(err, llm.ErrNotConfigured) {
		return "未配置 LLM API Key"
	}
	var upstream llm.UpstreamError
	if errors.As(err, &upstream) {
		msg := strings.ToLower(upstream.Message)
		switch {
		case upstream.StatusCode == http.StatusPaymentRequired || strings.Contains(msg, "insufficient balance"):
			return "模型服务余额不足"
		case upstream.StatusCode == http.StatusUnauthorized || upstream.StatusCode == http.StatusForbidden:
			return "模型服务认证失败"
		case upstream.StatusCode == http.StatusTooManyRequests:
			return "模型服务限流"
		case upstream.StatusCode >= 500:
			return "模型服务暂时不可用"
		case upstream.Message != "":
			return "模型服务错误：" + upstream.Message
		default:
			return "模型服务错误"
		}
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "模型服务连接超时"
	}
	return "模型调用失败"
}

func isLLMServiceError(err error) bool {
	if errors.Is(err, llm.ErrNotConfigured) || errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var upstream llm.UpstreamError
	return errors.As(err, &upstream)
}

func stripCodeFence(raw string) string {
	s := strings.TrimSpace(raw)
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
		if i := strings.IndexByte(s, '\n'); i >= 0 {
			first := strings.TrimSpace(s[:i])
			if first == "" || (!strings.ContainsAny(first, " {}()") && len(first) < 12) {
				s = s[i+1:]
			}
		}
		if i := strings.LastIndex(s, "```"); i >= 0 {
			s = s[:i]
		}
	}
	return strings.TrimSpace(s)
}

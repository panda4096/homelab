package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

// llmConfigResponse is the safe, client-facing view of a user's LLM config — it NEVER includes the
// API key (only whether one is set).
func llmConfigResponse(c store.LLMConfig) map[string]any {
	return map[string]any{
		"provider": orElse(c.Provider, "deepseek"),
		"base_url": c.BaseURL,
		"model":    c.Model,
		"has_key":  c.HasKey,
	}
}

func (s *Server) getLLMConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.store.GetLLMConfig(r.Context(), userOf(r))
	if errors.Is(err, store.ErrNotFound) {
		writeJSON(w, http.StatusOK, llmConfigResponse(store.LLMConfig{Provider: "deepseek"}))
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, llmConfigResponse(cfg))
}

func (s *Server) putLLMConfig(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Provider string  `json:"provider"`
		BaseURL  string  `json:"base_url"`
		Model    string  `json:"model"`
		APIKey   *string `json:"api_key"` // nil = keep existing, "" = clear, value = set
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	provider := strings.ToLower(strings.TrimSpace(body.Provider))
	if provider == "" {
		provider = "deepseek"
	}
	// We currently ship DeepSeek (OpenAI-compatible) only; reject unknown providers to avoid
	// silently mis-routing (anthropic uses a different wire format and isn't user-selectable yet).
	if provider != "deepseek" && provider != "openai" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "provider 仅支持 deepseek")
		return
	}
	baseURL := strings.TrimSpace(body.BaseURL)
	if baseURL != "" && !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "base_url 必须是 http(s) 地址")
		return
	}
	model := strings.TrimSpace(body.Model)
	var apiKey *string
	if body.APIKey != nil {
		trimmed := strings.TrimSpace(*body.APIKey)
		apiKey = &trimmed
	}
	if err := s.store.UpsertLLMConfig(r.Context(), userOf(r), provider, baseURL, model, apiKey); err != nil {
		writeStorageError(w, r, err)
		return
	}
	// A config change invalidates the cached probe result for this user.
	s.llmProbeMu.Lock()
	delete(s.llmProbe, userOf(r))
	s.llmProbeMu.Unlock()
	s.getLLMConfig(w, r)
}

func (s *Server) deleteLLMConfig(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteLLMConfig(r.Context(), userOf(r)); err != nil {
		writeStorageError(w, r, err)
		return
	}
	s.llmProbeMu.Lock()
	delete(s.llmProbe, userOf(r))
	s.llmProbeMu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

func orElse(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

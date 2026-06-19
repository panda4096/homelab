package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

// providerResponse is the safe, client-facing view of an LLM provider — it NEVER includes the API
// key (only whether one is set).
func providerResponse(p store.LLMProvider) map[string]any {
	return map[string]any{
		"id":        p.ID,
		"label":     p.Label,
		"provider":  p.Provider,
		"base_url":  p.BaseURL,
		"model":     p.Model,
		"has_key":   p.HasKey,
		"is_active": p.IsActive,
	}
}

// validateProviderInput normalizes + validates the shared provider fields. Returns (provider,
// baseURL, model, label, errMsg).
func validateProviderInput(label, provider, baseURL, model string) (string, string, string, string, string) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "" {
		provider = "deepseek"
	}
	if provider != "deepseek" && provider != "openai" {
		return "", "", "", "", "provider 仅支持 deepseek / openai"
	}
	baseURL = strings.TrimSpace(baseURL)
	if baseURL != "" && !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
		return "", "", "", "", "base_url 必须是 http(s) 地址"
	}
	model = strings.TrimSpace(model)
	label = strings.TrimSpace(label)
	if label == "" {
		label = provider
	}
	if len([]rune(label)) > 40 {
		return "", "", "", "", "名称需在 40 字以内"
	}
	return provider, baseURL, model, label, ""
}

func (s *Server) getLLMProviders(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListLLMProviders(r.Context(), userOf(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, p := range items {
		out = append(out, providerResponse(p))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (s *Server) createLLMProvider(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Label    string  `json:"label"`
		Provider string  `json:"provider"`
		BaseURL  string  `json:"base_url"`
		Model    string  `json:"model"`
		APIKey   *string `json:"api_key"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	provider, baseURL, model, label, msg := validateProviderInput(body.Label, body.Provider, body.BaseURL, body.Model)
	if msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	key := ""
	if body.APIKey != nil {
		key = strings.TrimSpace(*body.APIKey)
	}
	if _, err := s.store.CreateLLMProvider(r.Context(), userOf(r), label, provider, baseURL, model, key); err != nil {
		writeStorageError(w, r, err)
		return
	}
	s.invalidateLLMProbe(userOf(r))
	s.getLLMProviders(w, r)
}

func (s *Server) updateLLMProvider(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	var body struct {
		Label    string  `json:"label"`
		Provider string  `json:"provider"`
		BaseURL  string  `json:"base_url"`
		Model    string  `json:"model"`
		APIKey   *string `json:"api_key"` // nil = keep existing, "" = clear, value = set
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	provider, baseURL, model, label, msg := validateProviderInput(body.Label, body.Provider, body.BaseURL, body.Model)
	if msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	var apiKey *string
	if body.APIKey != nil {
		trimmed := strings.TrimSpace(*body.APIKey)
		apiKey = &trimmed
	}
	if err := s.store.UpdateLLMProvider(r.Context(), userOf(r), id, label, provider, baseURL, model, apiKey); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "配置不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	s.invalidateLLMProbe(userOf(r))
	s.getLLMProviders(w, r)
}

func (s *Server) deleteLLMProvider(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.DeleteLLMProvider(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "配置不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	s.invalidateLLMProbe(userOf(r))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) activateLLMProvider(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.SetActiveLLMProvider(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "配置不存在")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	s.invalidateLLMProbe(userOf(r))
	s.getLLMProviders(w, r)
}

func (s *Server) invalidateLLMProbe(userID int64) {
	s.llmProbeMu.Lock()
	delete(s.llmProbe, userID)
	s.llmProbeMu.Unlock()
}

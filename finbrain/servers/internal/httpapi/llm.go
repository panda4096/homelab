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

func (s *Server) getLLMStatus(w http.ResponseWriter, r *http.Request) {
	available, reason := s.llm.Configured(), ""
	if !s.llm.Configured() {
		available = false
		reason = "未配置 LLM API Key"
	} else if r.URL.Query().Get("probe") == "1" {
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()
		available, reason = s.cachedLLMProbe(ctx)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": s.llm.Configured(),
		"provider":   s.llm.Provider(),
		"model":      s.llm.Model(),
		"available":  available,
		"error":      reason,
	})
}

func (s *Server) cachedLLMProbe(ctx context.Context) (bool, string) {
	for {
		s.llmProbeMu.Lock()
		if !s.llmProbe.checkedAt.IsZero() && time.Since(s.llmProbe.checkedAt) < s.llmProbe.ttl() {
			available, reason := s.llmProbe.available, s.llmProbe.reason
			s.llmProbeMu.Unlock()
			return available, reason
		}
		if wait := s.llmProbeInFlight; wait != nil {
			s.llmProbeMu.Unlock()
			select {
			case <-wait:
				continue
			case <-ctx.Done():
				return false, llmUserMessage(ctx.Err())
			}
		}
		wait := make(chan struct{})
		s.llmProbeInFlight = wait
		s.llmProbeMu.Unlock()

		available, reason := s.probeLLM(ctx)
		s.llmProbeMu.Lock()
		s.llmProbe = llmProbeCache{checkedAt: time.Now(), available: available, reason: reason}
		s.llmProbeInFlight = nil
		close(wait)
		s.llmProbeMu.Unlock()
		return available, reason
	}
}

func (s *Server) probeLLM(ctx context.Context) (bool, string) {
	if err := s.llm.Probe(ctx); err != nil {
		return false, llmUserMessage(err)
	}
	return true, ""
}

func (s *Server) setLLMProbeCache(available bool, reason string) {
	if !s.llm.Configured() {
		return
	}
	s.llmProbeMu.Lock()
	s.llmProbe = llmProbeCache{checkedAt: time.Now(), available: available, reason: reason}
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

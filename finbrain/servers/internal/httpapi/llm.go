package httpapi

import (
	"net/http"
	"strings"
)

// LLM status only. The former NL→SQL path (/llm/query) and NL→draft path
// (/llm/parse) are REMOVED: agents never author SQL or bypass the domain layer.
// All NL goes through the skill layer — /agent/plan picks a registered skill and
// the backend executes it (see agent.go). stripCodeFence is shared with the
// planner's JSON extraction.

func (s *Server) getLLMStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": s.llm.Configured(),
		"provider":   s.llm.Provider(),
		"model":      s.llm.Model(),
	})
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

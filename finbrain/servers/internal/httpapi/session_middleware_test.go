package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/panda4096/homelab/finbrain/servers/internal/config"
)

func TestMustChangePasswordAllowedPath(t *testing.T) {
	for _, path := range []string{"/api/auth/me", "/api/auth/change-password", "/api/auth/logout"} {
		if !mustChangePasswordAllowedPath(path) {
			t.Fatalf("%s should be allowed while password change is required", path)
		}
	}
	for _, path := range []string{"/api/accounts", "/api/api-keys", "/api/agent/run"} {
		if mustChangePasswordAllowedPath(path) {
			t.Fatalf("%s should be blocked while password change is required", path)
		}
	}
}

func TestUserIDFromContextFailsClosed(t *testing.T) {
	if got := userIDFromContext(httptest.NewRequest(http.MethodGet, "/", nil).Context()); got != 0 {
		t.Fatalf("userIDFromContext without middleware = %d, want 0", got)
	}
}

func TestSessionMiddlewareDevDefaultInjectsUserOne(t *testing.T) {
	s := &Server{cfg: &config.Config{Env: "development"}}
	var got int64
	h := s.sessionMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = userIDFromContext(r.Context())
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/accounts", nil))
	if got != 1 {
		t.Fatalf("dev default user id = %d, want 1", got)
	}
}

package httpapi

import "testing"

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

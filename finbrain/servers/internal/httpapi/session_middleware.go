package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

const sessionCookieName = "fb_session"

func (s *Server) sessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		plain := sessionTokenFromRequest(r)
		if plain == "" {
			if agentAPIKeyFromRequest(r) != "" && strings.HasPrefix(r.URL.Path, "/api/agent") {
				next.ServeHTTP(w, r)
				return
			}
			if s.cfg.IsDev() {
				ctx := context.WithValue(r.Context(), ctxUserID, int64(1))
				ctx = context.WithValue(ctx, ctxDevDefault, true)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			writeError(w, http.StatusUnauthorized, "unauthorized", "请先登录")
			return
		}
		sess, err := s.store.ResolveSession(r.Context(), sha256hex(plain), time.Now())
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "会话已失效，请重新登录")
			return
		}
		if err != nil {
			writeInternal(w, r, err)
			return
		}
		u, err := s.store.GetUser(r.Context(), sess.UserID)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusUnauthorized, "unauthorized", "会话已失效，请重新登录")
			return
		}
		if err != nil {
			writeInternal(w, r, err)
			return
		}
		if u.MustChangePassword && !mustChangePasswordAllowedPath(r.URL.Path) {
			writeError(w, http.StatusForbidden, "password_change_required", "请先修改临时密码")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxUserID, sess.UserID)))
	})
}

func mustChangePasswordAllowedPath(path string) bool {
	switch path {
	case "/api/auth/me", "/api/auth/change-password", "/api/auth/logout":
		return true
	default:
		return false
	}
}

func sessionTokenFromRequest(r *http.Request) string {
	if c, err := r.Cookie(sessionCookieName); err == nil && strings.HasPrefix(c.Value, "fbs_") {
		return c.Value
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(auth, "Bearer ") {
		token := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		if strings.HasPrefix(token, "fbs_") {
			return token
		}
	}
	return ""
}

func agentAPIKeyFromRequest(r *http.Request) string {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		return ""
	}
	token := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	if strings.HasPrefix(token, "fbk_") {
		return token
	}
	return ""
}

func userOf(r *http.Request) int64 {
	return userIDFromContext(r.Context())
}

func userIDFromContext(ctx context.Context) int64 {
	if id, ok := ctx.Value(ctxUserID).(int64); ok && id > 0 {
		return id
	}
	return 1
}

func isDevDefaultUser(r *http.Request) bool {
	v, _ := r.Context().Value(ctxDevDefault).(bool)
	return v
}

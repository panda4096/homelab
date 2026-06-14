package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	authpkg "github.com/panda4096/homelab/finbrain/servers/internal/auth"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

const sessionTTL = 30 * 24 * time.Hour

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	username, ok := normalizeUsername(body.Username)
	if !ok {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "用户名需为 3-64 个非空白字符")
		return
	}
	if !validPassword(body.Password) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "密码至少 8 位")
		return
	}
	hash, err := authpkg.HashPassword(body.Password)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	u, err := s.store.CreateUser(r.Context(), username, username, hash)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "用户名已存在")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"user": u})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	username, ok := normalizeUsername(body.Username)
	if !ok || body.Password == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "用户名或密码错误")
		return
	}
	identity, err := s.store.GetPasswordIdentity(r.Context(), username)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "用户名或密码错误")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	if !authpkg.VerifyPassword(body.Password, identity.Secret) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "用户名或密码错误")
		return
	}
	token, sess, err := s.createSession(r, identity.UserID)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	setSessionCookie(w, s.cfg.IsDev(), token, sess.ExpiresAt)
	identity.User.MustChangePassword = identity.MustChangePassword
	writeJSON(w, http.StatusOK, map[string]any{"user": identity.User})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if token := sessionTokenFromRequest(r); token != "" {
		if err := s.store.RevokeSession(r.Context(), sha256hex(token)); err != nil && !errors.Is(err, store.ErrNotFound) {
			writeInternal(w, r, err)
			return
		}
	}
	clearSessionCookie(w, s.cfg.IsDev())
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, err := s.store.GetUser(r.Context(), userOf(r))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "请先登录")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	if isDevDefaultUser(r) {
		u.MustChangePassword = false
	}
	prefs, err := s.store.GetPreferences(r.Context(), u.ID)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": u, "timezone": prefs.Timezone})
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if !validPassword(body.NewPassword) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "新密码至少 8 位")
		return
	}
	u, err := s.store.GetUser(r.Context(), userOf(r))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "请先登录")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	identity, err := s.store.GetPasswordIdentityByUserID(r.Context(), u.ID)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	if !authpkg.VerifyPassword(body.CurrentPassword, identity.Secret) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "当前密码错误")
		return
	}
	hash, err := authpkg.HashPassword(body.NewPassword)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	if err := s.store.SetPassword(r.Context(), u.ID, hash, false); err != nil {
		writeInternal(w, r, err)
		return
	}
	if token := sessionTokenFromRequest(r); token != "" {
		if err := s.store.RevokeUserSessionsExcept(r.Context(), u.ID, sha256hex(token)); err != nil {
			writeInternal(w, r, err)
			return
		}
	} else if err := s.store.RevokeUserSessions(r.Context(), u.ID); err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) createSession(r *http.Request, userID int64) (string, store.Session, error) {
	token, err := newSessionToken()
	if err != nil {
		return "", store.Session{}, err
	}
	sess, err := s.store.CreateSession(r.Context(), userID, sha256hex(token), time.Now().Add(sessionTTL))
	if err != nil {
		return "", store.Session{}, err
	}
	return token, sess, nil
}

func newSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "fbs_" + hex.EncodeToString(b), nil
}

func setSessionCookie(w http.ResponseWriter, isDev bool, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   int(time.Until(expiresAt).Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   !isDev,
	})
}

func clearSessionCookie(w http.ResponseWriter, isDev bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   !isDev,
	})
}

func normalizeUsername(username string) (string, bool) {
	username = strings.ToLower(strings.TrimSpace(username))
	if len(username) < 3 || len(username) > 64 || strings.ContainsAny(username, " \t\r\n") {
		return "", false
	}
	return username, true
}

func validPassword(password string) bool {
	return len(password) >= 8 && len(password) <= 256
}

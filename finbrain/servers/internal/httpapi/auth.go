package httpapi

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	authpkg "github.com/panda4096/homelab/finbrain/servers/internal/auth"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

const maxAvatarBytes = 512 * 1024

const sessionTTL = 30 * 24 * time.Hour

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	ip, now := authClientIP(r), time.Now()
	if wait, ok := s.authLimiter.allowAttempt([]string{"register:ip:" + ip}, 10, authIPWindow, now); !ok {
		writeAuthRateLimited(w, wait)
		return
	}
	username, ok := normalizeUsername(body.Username)
	if !ok {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "用户名需为 3-64 个非空白字符")
		return
	}
	if wait, ok := s.authLimiter.allowAttempt([]string{"register:user:" + username}, 3, authUserWindow, now); !ok {
		writeAuthRateLimited(w, wait)
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
	u.Username = username
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
	ip, now := authClientIP(r), time.Now()
	if wait, ok := s.authLimiter.allowAttempt([]string{"login:ip:" + ip}, 30, authIPWindow, now); !ok {
		writeAuthRateLimited(w, wait)
		return
	}
	username, ok := normalizeUsername(body.Username)
	if !ok || body.Password == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "用户名或密码错误")
		return
	}
	loginKeys := authRateKeys("login", ip, username)
	if wait, locked := s.authLimiter.locked(loginKeys, now); locked {
		writeAuthRateLimited(w, wait)
		return
	}
	if wait, ok := s.authLimiter.allowAttempt([]string{"login:user:" + username}, 10, authUserWindow, now); !ok {
		writeAuthRateLimited(w, wait)
		return
	}
	identity, err := s.store.GetPasswordIdentity(r.Context(), username)
	if errors.Is(err, store.ErrNotFound) {
		authpkg.VerifyPasswordDummy(body.Password)
		s.authLimiter.recordFailure(loginKeys, now)
		writeError(w, http.StatusUnauthorized, "unauthorized", "用户名或密码错误")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	if !authpkg.VerifyPassword(body.Password, identity.Secret) {
		s.authLimiter.recordFailure(loginKeys, now)
		writeError(w, http.StatusUnauthorized, "unauthorized", "用户名或密码错误")
		return
	}
	s.authLimiter.recordSuccess(loginKeys)
	if oldToken := sessionTokenFromRequest(r); oldToken != "" {
		if err := s.store.RevokeSession(r.Context(), sha256hex(oldToken)); err != nil && !errors.Is(err, store.ErrNotFound) {
			writeInternal(w, r, err)
			return
		}
	}
	token, sess, err := s.createSession(r, identity.UserID)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	setSessionCookie(w, s.cfg.IsDev(), token, sess.ExpiresAt)
	clearLogoutMarker(w, s.cfg.IsDev()) // a real login cancels any prior dev "stay logged out" marker
	identity.User.MustChangePassword = identity.MustChangePassword
	identity.User.Username = identity.Identifier
	writeJSON(w, http.StatusOK, map[string]any{"user": identity.User})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if token := sessionTokenFromRequest(r); token != "" {
		// Best-effort server-side revoke. Even if it fails (e.g. a transient DB error), we MUST
		// still clear the cookie below — otherwise the HttpOnly cookie survives and the user is
		// silently re-authenticated on next /auth/me, so "logout" wouldn't stick.
		if err := s.store.RevokeSession(r.Context(), sha256hex(token)); err != nil && !errors.Is(err, store.ErrNotFound) {
			log.Printf("logout: revoke session failed (clearing cookie anyway): %v", err)
		}
	}
	clearSessionCookie(w, s.cfg.IsDev())
	setLogoutMarker(w, s.cfg.IsDev()) // dev: keep the dev-default user from silently re-authing
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
	// A forced first-login change (must_change_password) is already authenticated via the temp
	// password the user just logged in with, so we don't re-require it. A normal change (from
	// Settings) still re-verifies the current password as a re-auth safeguard.
	if !u.MustChangePassword && !authpkg.VerifyPassword(body.CurrentPassword, identity.Secret) {
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

// updateProfile updates the current user's display name (UI nickname only — the login
// username is unchanged). Self-service; scoped to the session user.
func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DisplayName string `json:"display_name"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	name := strings.TrimSpace(body.DisplayName)
	if name == "" || len([]rune(name)) > 64 {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "名称需为 1-64 个字符")
		return
	}
	u, err := s.store.UpdateUserDisplayName(r.Context(), userOf(r), name)
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
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

// uploadAvatar stores the current user's avatar. The body is the raw image bytes with an
// image/png or image/jpeg Content-Type; the frontend center-crops + downscales before upload.
func (s *Server) uploadAvatar(w http.ResponseWriter, r *http.Request) {
	ct := strings.ToLower(strings.TrimSpace(strings.SplitN(r.Header.Get("Content-Type"), ";", 2)[0]))
	if ct != "image/png" && ct != "image/jpeg" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "头像仅支持 PNG 或 JPEG")
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxAvatarBytes))
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "头像文件过大（上限 512KB）")
		return
	}
	if len(data) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "头像内容为空")
		return
	}
	// Validate the bytes really decode as the declared raster type (rejects SVG/HTML/garbage).
	if _, format, derr := image.Decode(bytes.NewReader(data)); derr != nil || (format != "png" && format != "jpeg") {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "头像不是有效的图片")
		return
	}
	updatedAt, err := s.store.SetUserAvatar(r.Context(), userOf(r), ct, data)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "请先登录")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"avatar_updated_at": updatedAt})
}

// getAvatar serves the current user's avatar bytes (auth-gated; nosniff to neutralise any
// content-type confusion). Returns 404 when the user has no avatar.
func (s *Server) getAvatar(w http.ResponseWriter, r *http.Request) {
	mime, data, err := s.store.GetUserAvatar(r.Context(), userOf(r))
	if errors.Is(err, store.ErrNotFound) {
		http.Error(w, "no avatar", http.StatusNotFound)
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
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

// setLogoutMarker / clearLogoutMarker drive the dev-only "stay logged out" flag: dev otherwise
// defaults to user 1 when there's no session, which would silently re-authenticate right after a
// logout. The marker makes an explicit 退出 stick until the next real login. (Inert in prod —
// prod has no dev-default fallback.)
func setLogoutMarker(w http.ResponseWriter, isDev bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     loggedOutCookieName,
		Value:    "1",
		Path:     "/",
		MaxAge:   30 * 24 * 3600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   !isDev,
	})
}

func clearLogoutMarker(w http.ResponseWriter, isDev bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     loggedOutCookieName,
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

func writeAuthRateLimited(w http.ResponseWriter, wait time.Duration) {
	if wait < time.Second {
		wait = time.Second
	}
	seconds := int((wait + time.Second - 1) / time.Second)
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	writeError(w, http.StatusTooManyRequests, "rate_limited", "认证请求过于频繁，请稍后再试")
}

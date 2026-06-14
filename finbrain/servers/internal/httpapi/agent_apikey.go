package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

type ctxKey string

const (
	ctxRequestID  ctxKey = "fb.reqid"
	ctxActor      ctxKey = "fb.actor"
	ctxSource     ctxKey = "fb.source"
	ctxScopes     ctxKey = "fb.scopes"
	ctxUserID     ctxKey = "fb.uid"
	ctxDevDefault ctxKey = "fb.dev_default"
)

func actorOf(r *http.Request) string {
	if v, ok := r.Context().Value(ctxActor).(string); ok && v != "" {
		return v
	}
	if id := userOf(r); id > 0 {
		return "user:" + strconv.FormatInt(id, 10)
	}
	return "user:0"
}
func sourceOf(r *http.Request) string {
	if v, ok := r.Context().Value(ctxSource).(string); ok && v != "" {
		return v
	}
	return "agent"
}

func sha256hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func newAPIKeySecret() (plain, hash, prefix string, err error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", "", "", err
	}
	plain = "fbk_" + hex.EncodeToString(b)
	return plain, sha256hex(plain), plain[:12], nil
}

// agentAuthMiddleware identifies the caller of /agent routes: an API key (external
// agent) via Authorization: Bearer fbk_..., else the dev/owner. It records actor/
// source/scopes in context for the audit log and write-scope checks. The owner
// (UI Copilot) needs no key in dev (the existing authMiddleware governs access).
func (s *Server) agentAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		actor, source, scopes := actorOf(r), "agent", "read_write"
		if secret := agentAPIKeyFromRequest(r); secret != "" {
			k, err := s.store.ResolveAPIKey(r.Context(), sha256hex(secret))
			if err != nil {
				writeError(w, http.StatusUnauthorized, "unauthorized", "无效或已吊销的 API Key")
				return
			}
			actor, source, scopes = "apikey:"+k.Name, "apikey", k.Scopes
			ctx := context.WithValue(r.Context(), ctxUserID, k.UserID)
			r = r.WithContext(ctx)
		}
		ctx := context.WithValue(r.Context(), ctxActor, actor)
		ctx = context.WithValue(ctx, ctxSource, source)
		ctx = context.WithValue(ctx, ctxScopes, scopes)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func callerScopes(r *http.Request) string {
	if v, ok := r.Context().Value(ctxScopes).(string); ok && v != "" {
		return v
	}
	return "read_write"
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (w *statusRecorder) WriteHeader(c int) {
	w.status = c
	w.ResponseWriter.WriteHeader(c)
}

// mutationAuditMiddleware records every human/UI mutation (POST/PATCH/PUT/DELETE)
// to the unified audit log. /agent/* is excluded — those get richer skill-level
// audit rows instead.
func (s *Server) mutationAuditMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead ||
			strings.HasPrefix(r.URL.Path, "/api/agent") {
			next.ServeHTTP(w, r)
			return
		}
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		switch r.Method {
		case http.MethodPost, http.MethodPatch, http.MethodPut, http.MethodDelete:
			method, path := r.Method, r.URL.Path
			status := "ok"
			if rec.status >= 400 {
				status = "error"
			}
			_ = s.store.InsertAuditEvent(r.Context(), userOf(r), store.AuditEvent{
				RequestID: requestID(r), Actor: actorOf(r), Source: "ui",
				Status: status, HTTPMethod: &method, HTTPPath: &path,
			})
		}
	})
}

// ---- API key CRUD ----

func (s *Server) listAPIKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := s.store.ListAPIKeys(r.Context(), userOf(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, keys)
}

func (s *Server) createAPIKey(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name   string `json:"name"`
		Scopes string `json:"scopes"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "name is required")
		return
	}
	if msg := validateTextLen("name", body.Name, maxNameLen); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	scopes := body.Scopes
	if scopes != "read" && scopes != "read_write" {
		scopes = "read"
	}
	plain, hash, prefix, err := newAPIKeySecret()
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	key, err := s.store.CreateAPIKey(r.Context(), userOf(r), body.Name, hash, prefix, scopes)
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	// secret is returned exactly once
	writeJSON(w, http.StatusOK, map[string]any{"key": key, "secret": plain})
}

func (s *Server) deleteAPIKey(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid id")
		return
	}
	if err := s.store.RevokeAPIKey(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "API Key 不存在或已吊销")
		return
	} else if err != nil {
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- audit read ----

func (s *Server) listAuditEvents(w http.ResponseWriter, r *http.Request) {
	source := strings.TrimSpace(r.URL.Query().Get("source"))
	events, err := s.store.ListAuditEvents(r.Context(), userOf(r), source, queryLimit(r))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, events)
}

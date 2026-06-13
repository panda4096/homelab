// Package httpapi is the HTTP transport layer: chi router, middleware, and
// JSON handlers. Error responses use the envelope defined in
// docs/IMPLEMENTATION_PLAN.md §2.1.
package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5/pgconn"
)

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError emits { "error": { code, message } } with the given status.
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": apiError{Code: code, Message: message}})
}

func writeInternal(w http.ResponseWriter, r *http.Request, err error) {
	log.Printf("internal error: method=%s path=%s err=%v", r.Method, r.URL.Path, err)
	writeError(w, http.StatusInternalServerError, "internal", "内部错误")
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusBadRequest, "invalid_request", "request body too large")
			return false
		}
		writeError(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return false
	}
	return true
}

func maxBodyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		next.ServeHTTP(w, r)
	})
}

func isUniqueViolation(err error) bool {
	return pgErrorCode(err, "23505")
}

func isForeignKeyViolation(err error) bool {
	return pgErrorCode(err, "23503")
}

func isStringDataRightTruncation(err error) bool {
	return pgErrorCode(err, "22001")
}

func pgErrorCode(err error, code string) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == code
}

func writeStorageError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case isForeignKeyViolation(err):
		writeError(w, http.StatusConflict, "conflict", "该数据仍被其他记录引用或引用不存在")
	case isStringDataRightTruncation(err):
		writeError(w, http.StatusBadRequest, "invalid_request", "请求字段超出长度限制")
	default:
		writeInternal(w, r, err)
	}
}

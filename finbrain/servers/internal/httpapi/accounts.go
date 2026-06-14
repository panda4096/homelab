package httpapi

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/panda4096/homelab/finbrain/servers/internal/domain"
	"github.com/panda4096/homelab/finbrain/servers/internal/store"
)

var currencyRe = regexp.MustCompile(`^[A-Z]{3}$`)

func (s *Server) location(ctx context.Context) *time.Location {
	loc := s.cfg.Location
	if s.store == nil {
		return loc
	}
	if prefs, err := s.store.GetPreferences(ctx, userIDFromContext(ctx)); err == nil {
		if userLoc, err := time.LoadLocation(prefs.Timezone); err == nil {
			loc = userLoc
		}
	}
	return loc
}

func (s *Server) today(ctx context.Context) string {
	return domain.TodayString(s.location(ctx))
}

func pathID(r *http.Request, key string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, key), 10, 64)
}

func (s *Server) listAccounts(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListAccounts(r.Context(), userOf(r), s.today(r.Context()))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) getAccount(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid account id")
		return
	}
	a, err := s.store.GetAccount(r.Context(), userOf(r), id, s.today(r.Context()))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "account not found")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) createAccount(w http.ResponseWriter, r *http.Request) {
	var a store.Account
	if !decodeJSON(w, r, &a) {
		return
	}
	a.Name = strings.TrimSpace(a.Name)
	a.Currency = strings.ToUpper(strings.TrimSpace(a.Currency))
	a.Kind = strings.TrimSpace(a.Kind)
	if msg := validateAccount(a); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	if msg := validateAccountText(a); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "validation_failed", msg)
		return
	}
	if _, err := s.store.GetInstitution(r.Context(), userOf(r), a.InstitutionID); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "institution_id 不存在")
		return
	} else if err != nil {
		writeInternal(w, r, err)
		return
	}
	out, err := s.store.CreateAccount(r.Context(), userOf(r), a)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该机构下已存在同名账户")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) patchAccount(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid account id")
		return
	}
	cur, err := s.store.GetAccount(r.Context(), userOf(r), id, s.today(r.Context()))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "account not found")
		return
	}
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	// institution_id and currency are intentionally NOT patchable. Both define how
	// historical snapshots are interpreted; to change either, recreate the account.
	var body struct {
		Name         *string `json:"name"`
		Currency     *string `json:"currency"`
		Kind         *string `json:"kind"`
		DisplayOrder *int    `json:"display_order"`
		Note         *string `json:"note"`
		IsArchived   *bool   `json:"is_archived"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.Name != nil {
		cur.Name = strings.TrimSpace(*body.Name)
	}
	if body.Currency != nil {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "currency 创建后不可修改")
		return
	}
	if body.Kind != nil {
		cur.Kind = strings.TrimSpace(*body.Kind)
	}
	if body.DisplayOrder != nil {
		cur.DisplayOrder = *body.DisplayOrder
	}
	if body.Note != nil {
		cur.Note = body.Note
	}
	if body.IsArchived != nil {
		cur.IsArchived = *body.IsArchived
	}
	if msg := validateAccount(cur); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", msg)
		return
	}
	if msg := validateAccountText(cur); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, "validation_failed", msg)
		return
	}
	out, err := s.store.UpdateAccount(r.Context(), userOf(r), cur)
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该机构下已存在同名账户")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) deleteAccount(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid account id")
		return
	}
	if err := s.store.DeleteAccountIfEmpty(r.Context(), userOf(r), id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "account not found")
		return
	} else if errors.Is(err, store.ErrInUse) {
		writeError(w, http.StatusConflict, "conflict", "账户已有记录，只能归档不能删除")
		return
	} else if err != nil {
		if isForeignKeyViolation(err) {
			writeError(w, http.StatusConflict, "conflict", "账户仍被其他记录引用,无法删除")
			return
		}
		writeStorageError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// createAccountsFromTemplate accepts an existing institution_id, or institution_name to create one.
func (s *Server) createAccountsFromTemplate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TemplateID      int64  `json:"template_id"`
		InstitutionID   int64  `json:"institution_id"`
		InstitutionName string `json:"institution_name"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	if body.TemplateID == 0 {
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "template_id is required")
		return
	}
	instID := body.InstitutionID
	switch {
	case instID > 0:
		if _, err := s.store.GetInstitution(r.Context(), userOf(r), instID); errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "institution_id 不存在")
			return
		} else if err != nil {
			writeInternal(w, r, err)
			return
		}
	case strings.TrimSpace(body.InstitutionName) != "":
		body.InstitutionName = strings.TrimSpace(body.InstitutionName)
		if msg := validateTextLen("institution_name", body.InstitutionName, maxNameLen); msg != "" {
			writeError(w, http.StatusUnprocessableEntity, "validation_failed", msg)
			return
		}
		inst, err := s.store.GetOrCreateInstitutionByName(r.Context(), userOf(r), body.InstitutionName)
		if err != nil {
			writeStorageError(w, r, err)
			return
		}
		instID = inst.ID
	default:
		writeError(w, http.StatusUnprocessableEntity, "business_rule_violated", "institution_id 或 institution_name 必填其一")
		return
	}

	out, err := s.store.CreateAccountsFromTemplate(r.Context(), userOf(r), body.TemplateID, instID)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "template not found")
		return
	}
	if isUniqueViolation(err) {
		writeError(w, http.StatusConflict, "conflict", "该机构下已存在同名账户")
		return
	}
	if err != nil {
		writeStorageError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) listAccountBalanceSnapshots(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid account id")
		return
	}
	items, err := s.store.ListBalanceSnapshots(r.Context(), userOf(r), id)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) listAccountPositionSnapshots(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid account id")
		return
	}
	items, err := s.store.ListPositionSnapshots(r.Context(), userOf(r), id)
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) listAccountPositions(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "validation_failed", "invalid account id")
		return
	}
	items, err := s.store.ListAccountPositions(r.Context(), userOf(r), id, s.today(r.Context()))
	if err != nil {
		writeInternal(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func validateAccount(a store.Account) string {
	if a.Name == "" {
		return "name is required"
	}
	if a.InstitutionID == 0 {
		return "institution_id is required"
	}
	if !currencyRe.MatchString(a.Currency) {
		return "currency must be a 3-letter ISO code (e.g. CNY)"
	}
	if a.Kind == "" {
		return "kind is required"
	}
	return ""
}

func validateAccountText(a store.Account) string {
	if msg := validateTextLen("name", a.Name, maxNameLen); msg != "" {
		return msg
	}
	if msg := validateTextLen("kind", a.Kind, maxKindLen); msg != "" {
		return msg
	}
	return validateOptionalTextLen("note", a.Note, maxNoteLen)
}

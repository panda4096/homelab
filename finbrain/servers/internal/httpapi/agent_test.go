package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// exec drives a skill endpoint handler directly (guard paths don't touch the DB).
func exec(t *testing.T, apply bool, body string) *httptest.ResponseRecorder {
	t.Helper()
	s := &Server{}
	r := httptest.NewRequest(http.MethodPost, "/api/agent/x", strings.NewReader(body))
	w := httptest.NewRecorder()
	if apply {
		s.applyAgentSkill(w, r)
	} else {
		s.runAgentSkill(w, r)
	}
	return w
}

func TestCatalogShape(t *testing.T) {
	s := &Server{}
	cat := s.catalog()
	if len(cat) < 17 {
		t.Fatalf("expected >=17 skills, got %d", len(cat))
	}
	byName := map[string]Skill{}
	for _, sk := range cat {
		byName[sk.Name] = sk
		if sk.Type != "read" && sk.Type != "draft" && sk.Type != "write" {
			t.Errorf("skill %s has bad type %q", sk.Name, sk.Type)
		}
		if len(sk.InputSchema) == 0 {
			t.Errorf("skill %s missing input_schema", sk.Name)
		}
	}
	// every write skill must require confirmation
	for _, sk := range cat {
		if sk.Type == "write" && !sk.RequiresConfirmation {
			t.Errorf("write skill %s must require confirmation", sk.Name)
		}
	}
	for _, want := range []string{"accounts.list", "portfolio.getSnapshot", "entry.draftBalanceSnapshot", "entry.applyBalanceSnapshot"} {
		if _, ok := byName[want]; !ok {
			t.Errorf("missing expected skill %s", want)
		}
	}
}

func TestUnknownSkillRejected(t *testing.T) {
	w := exec(t, false, `{"skill":"evil.dropTables","params":{}}`)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unknown skill: got %d, want 422", w.Code)
	}
}

func TestWriteSkillRejectedOnRun(t *testing.T) {
	// apply-type skill must NOT run via /agent/run
	w := exec(t, false, `{"skill":"entry.applyBalanceSnapshot","params":{}}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("write via /run: got %d, want 400", w.Code)
	}
}

func TestReadSkillRejectedOnApply(t *testing.T) {
	w := exec(t, true, `{"skill":"accounts.list","params":{}}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("read via /apply: got %d, want 400", w.Code)
	}
}

func TestWriteNeedsConfirmation(t *testing.T) {
	// apply write skill without confirm must be rejected before any DB write
	w := exec(t, true, `{"skill":"entry.applyBalanceSnapshot","params":{"account_id":1,"balance":"1"}}`)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("apply without confirm: got %d, want 422", w.Code)
	}
}

func TestAPIKeySecretShape(t *testing.T) {
	plain, hash, prefix := newAPIKeySecret()
	if !strings.HasPrefix(plain, "fbk_") {
		t.Errorf("secret should start with fbk_, got %q", plain)
	}
	if prefix != plain[:12] {
		t.Errorf("prefix %q != first 12 of secret", prefix)
	}
	if hash != sha256hex(plain) || hash == plain {
		t.Errorf("hash must be sha256 of secret, not the secret")
	}
	// distinct each call
	p2, _, _ := newAPIKeySecret()
	if p2 == plain {
		t.Errorf("secrets must be unique")
	}
}

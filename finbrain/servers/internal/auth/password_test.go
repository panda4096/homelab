package auth

import "testing"

func TestHashPasswordVerifies(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword returned error: %v", err)
	}
	if hash == "correct horse battery staple" {
		t.Fatal("hash must not equal plaintext")
	}
	if !VerifyPassword("correct horse battery staple", hash) {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword("wrong", hash) {
		t.Fatal("wrong password verified")
	}
}

func TestVerifyPasswordRejectsNonArgon2ID(t *testing.T) {
	if VerifyPassword("pw", "abc123") {
		t.Fatal("expected invalid hash to be rejected")
	}
	if VerifyPassword("pw", "$argon2i$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA") {
		t.Fatal("expected non-argon2id hash to be rejected")
	}
}

func TestVerifyPasswordDummyAlwaysRejectsButRuns(t *testing.T) {
	if VerifyPasswordDummy("anything") {
		t.Fatal("dummy verifier must never authenticate")
	}
}

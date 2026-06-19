package crypto

import "testing"

func TestEncryptRoundTrip(t *testing.T) {
	for _, plain := range []string{"", "sk-deepseek-abc123", "中文密钥🔑", "a longer api key with spaces and symbols !@#$%^&*()"} {
		enc, err := Encrypt([]byte(plain))
		if err != nil {
			t.Fatalf("encrypt %q: %v", plain, err)
		}
		if enc == plain && plain != "" {
			t.Fatalf("ciphertext equals plaintext for %q", plain)
		}
		got, err := Decrypt(enc)
		if err != nil {
			t.Fatalf("decrypt %q: %v", plain, err)
		}
		if string(got) != plain {
			t.Fatalf("round-trip mismatch: got %q want %q", string(got), plain)
		}
	}
}

func TestEncryptNonceIsRandom(t *testing.T) {
	a, _ := Encrypt([]byte("same"))
	b, _ := Encrypt([]byte("same"))
	if a == b {
		t.Fatalf("expected distinct ciphertexts for the same plaintext (random nonce)")
	}
}

func TestDecryptRejectsTamperedOrGarbage(t *testing.T) {
	if _, err := Decrypt("not-base64-@@@"); err == nil {
		t.Fatalf("expected error decoding garbage")
	}
	enc, _ := Encrypt([]byte("secret"))
	tampered := "A" + enc[1:] // flip the first base64 char
	if _, err := Decrypt(tampered); err == nil {
		t.Fatalf("expected GCM auth failure on tampered ciphertext")
	}
}

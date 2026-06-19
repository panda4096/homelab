// Package crypto provides symmetric encryption for secrets stored at rest (currently the per-user
// LLM API key). It uses AES-256-GCM with a HARDCODED key derived from a fixed passphrase.
//
// SECURITY NOTE: the key is hardcoded by design for this single-owner homelab — this is
// obfuscation-at-rest, NOT strong secrecy. Anyone with both the source/binary and the database can
// decrypt. It protects against a casual DB dump leaking plaintext keys, nothing more. To rotate,
// change the passphrase and have users re-save their keys.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

// secretKey is a 32-byte AES-256 key. SHA-256 of the passphrase guarantees the exact key length
// regardless of the passphrase, avoiding fragile manual byte-counting.
var secretKey = sha256.Sum256([]byte("finbrain-llm-apikey-encryption-v1 (hardcoded; single-owner homelab)"))

func aead() (cipher.AEAD, error) {
	block, err := aes.NewCipher(secretKey[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// Encrypt seals plaintext with AES-256-GCM and returns base64(nonce || ciphertext+tag).
func Encrypt(plaintext []byte) (string, error) {
	gcm, err := aead()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt reverses Encrypt.
func Decrypt(encoded string) ([]byte, error) {
	gcm, err := aead()
	if err != nil {
		return nil, err
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	if len(raw) < gcm.NonceSize() {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	return gcm.Open(nil, nonce, ct, nil)
}

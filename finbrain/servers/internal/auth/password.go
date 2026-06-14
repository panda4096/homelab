package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	passwordHashMemoryKB = 64 * 1024
	passwordHashTime     = 3
	passwordHashThreads  = 1
	passwordHashKeyLen   = 32
	passwordSaltLen      = 16
)

// HashPassword returns a PHC-style argon2id hash. Passwords must never use the
// sha256 helper used for opaque tokens and API keys.
func HashPassword(password string) (string, error) {
	salt := make([]byte, passwordSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, passwordHashTime, passwordHashMemoryKB, passwordHashThreads, passwordHashKeyLen)
	return fmt.Sprintf(
		"$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		passwordHashMemoryKB,
		passwordHashTime,
		passwordHashThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

// VerifyPassword checks a plaintext password against a PHC-style argon2id hash.
func VerifyPassword(password, encoded string) bool {
	params, salt, want, ok := parseHash(encoded)
	if !ok {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, params.time, params.memoryKB, params.threads, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

type hashParams struct {
	memoryKB uint32
	time     uint32
	threads  uint8
}

func parseHash(encoded string) (hashParams, []byte, []byte, bool) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return hashParams{}, nil, nil, false
	}
	params, ok := parseParams(parts[3])
	if !ok {
		return hashParams{}, nil, nil, false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) == 0 {
		return hashParams{}, nil, nil, false
	}
	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(hash) == 0 {
		return hashParams{}, nil, nil, false
	}
	return params, salt, hash, true
}

func parseParams(s string) (hashParams, bool) {
	var out hashParams
	for _, part := range strings.Split(s, ",") {
		k, v, ok := strings.Cut(part, "=")
		if !ok {
			return hashParams{}, false
		}
		n, err := strconv.ParseUint(v, 10, 32)
		if err != nil || n == 0 {
			return hashParams{}, false
		}
		switch k {
		case "m":
			out.memoryKB = uint32(n)
		case "t":
			out.time = uint32(n)
		case "p":
			if n > 255 {
				return hashParams{}, false
			}
			out.threads = uint8(n)
		default:
			return hashParams{}, false
		}
	}
	if out.memoryKB == 0 || out.time == 0 || out.threads == 0 {
		return hashParams{}, false
	}
	return out, true
}

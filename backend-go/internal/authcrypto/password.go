// Package authcrypto mirrors the password side of backend-python/auth.py:
// Argon2id hashes (argon2-cffi's encoded form) and, for legacy accounts,
// bcrypt hashes verified like bcrypt 4.x does.
package authcrypto

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

// bcryptMaxPassword is bcrypt's input limit: bcrypt 4.x silently ignores
// what follows, x/crypto refuses it, so Go truncates first.
const bcryptMaxPassword = 72

// VerifyPassword mirrors auth.verify_password.
func VerifyPassword(password, hash string) bool {
	switch {
	case hash == "":
		return false
	case strings.HasPrefix(hash, "$argon2"):
		return verifyArgon2(password, hash)
	case strings.HasPrefix(hash, "$2a$"), strings.HasPrefix(hash, "$2b$"), strings.HasPrefix(hash, "$2y$"):
		secret := []byte(password)
		if len(secret) > bcryptMaxPassword {
			secret = secret[:bcryptMaxPassword]
		}
		// A malformed legacy hash is a mismatch. (bcrypt 4.2.1 panics in
		// Rust on some, which Python turns into a 500.)
		return bcrypt.CompareHashAndPassword([]byte(hash), secret) == nil
	}
	return false
}

// verifyArgon2 checks "$argon2{id,i}$v=19$m=…,t=…,p=…$salt$hash" the way
// argon2-cffi's PasswordHasher.verify does (type and cost from the hash).
func verifyArgon2(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[2] != "v=19" {
		return false
	}
	var memory, iterations uint64
	var threads uint64
	for _, field := range strings.Split(parts[3], ",") {
		key, value, ok := strings.Cut(field, "=")
		if !ok {
			return false
		}
		n, err := strconv.ParseUint(value, 10, 32)
		if err != nil {
			return false
		}
		switch key {
		case "m":
			memory = n
		case "t":
			iterations = n
		case "p":
			threads = n
		default:
			return false
		}
	}
	if memory == 0 || iterations == 0 || threads == 0 || threads > 255 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) < 8 {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) < 4 {
		return false
	}
	var got []byte
	switch parts[1] {
	case "argon2id":
		got = argon2.IDKey([]byte(password), salt, uint32(iterations), uint32(memory), uint8(threads), uint32(len(want)))
	case "argon2i":
		got = argon2.Key([]byte(password), salt, uint32(iterations), uint32(memory), uint8(threads), uint32(len(want)))
	default:
		return false
	}
	return subtle.ConstantTimeCompare(got, want) == 1
}

// Argon2id parameters of auth._ARGON2 (OWASP's 19 MiB, t=2, p=1 baseline).
const (
	argonTime    = 2
	argonMemory  = 19_456
	argonThreads = 1
	argonKeyLen  = 32
	argonSaltLen = 16
)

// HashPassword mirrors auth.hash_password: Argon2id in argon2-cffi's
// encoded form, so Python verifies what Go stores and vice versa.
func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	return hashWithSalt(password, salt), nil
}

func hashWithSalt(password string, salt []byte) string {
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key))
}

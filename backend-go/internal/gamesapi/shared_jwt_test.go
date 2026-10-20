package gamesapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"time"
)

// longToken is a shared test-only JWT fixture. Admin and identity tests use
// this too; it must not be owned by retired Chronicles run API tests.
func longToken(subject string) string {
	enc := base64.RawURLEncoding
	header := enc.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claims, _ := json.Marshal(map[string]any{"sub": subject, "sv": 0, "exp": time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC).Unix()})
	payload := enc.EncodeToString(claims)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(header + "." + payload))
	return header + "." + payload + "." + enc.EncodeToString(mac.Sum(nil))
}

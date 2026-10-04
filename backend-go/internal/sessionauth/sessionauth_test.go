package sessionauth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"testing"
	"time"
)

func signedToken(subject, purpose string, version int64, expires time.Time, secret string) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(
		`{"sub":%q,"purpose":%q,"sv":%d,"exp":%d}`,
		subject, purpose, version, expires.Unix(),
	)))
	unsigned := header + "." + payload
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(unsigned))
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestVerifySession(t *testing.T) {
	now := time.Date(2026, 10, 4, 20, 0, 0, 0, time.UTC)
	const secret = "01234567890123456789012345678901"
	raw := signedToken("alice", "session", 7, now.Add(time.Hour), secret)

	subject, version, err := VerifySession(raw, []byte(secret), now)
	if err != nil {
		t.Fatal(err)
	}
	if subject != "alice" || version != 7 {
		t.Fatalf("subject=%q version=%d", subject, version)
	}
	if got := VerifiedSubject("Bearer "+raw, []byte(secret), now); got != "alice" {
		t.Fatalf("VerifiedSubject=%q", got)
	}
}

func TestVerifyRejectsExpiredWrongPurposeAndSignature(t *testing.T) {
	now := time.Date(2026, 10, 4, 20, 0, 0, 0, time.UTC)
	const secret = "01234567890123456789012345678901"
	tests := []string{
		signedToken("alice", "session", 0, now.Add(-time.Second), secret),
		signedToken("alice", "reset-password", 0, now.Add(time.Hour), secret),
		signedToken("alice", "session", 0, now.Add(time.Hour), "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"),
	}
	for _, raw := range tests {
		if _, err := Verify(raw, []byte(secret), now); err == nil {
			t.Fatal("expected invalid token")
		}
	}
}

package sessionauth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"
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

// Tokens PyJWT 2.15 produced for auth.create_token at the same instant.
func TestSignIsByteIdenticalToPyJWT(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	now := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	for username, want := range map[string]string{
		"alice": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsInB1cnBvc2UiOiJzZXNzaW9uIiwic3YiOjMsImV4cCI6MTc5Mzc5MzYwMH0.j_hwcd9CVLR9mTzl3Azlwm9xs3fxQbzBEj11hyK1fak",
		"ñandú": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJcdTAwZjFhbmRcdTAwZmEiLCJwdXJwb3NlIjoic2Vzc2lvbiIsInN2IjowLCJleHAiOjE3OTM3OTM2MDB9.fPxhhIkhFz3jNwSNMXu4g18djM26BzifuyPMdfzBFRo",
	} {
		sv := int64(0)
		if username == "alice" {
			sv = 3
		}
		got, err := Sign(username, sv, secret, now)
		if err != nil || got != want {
			t.Errorf("%s: %s (%v)", username, got, err)
		}
		subject, version, err := VerifySession(got, secret, now)
		if err != nil || subject != username || version != sv {
			t.Errorf("round trip %s: %s %d %v", username, subject, version, err)
		}
	}
}

// auth.create_password_reset_token for the same instant and hash.
func TestPasswordResetTokenIsPyJWTs(t *testing.T) {
	secret := []byte(strings.Repeat("s", 32))
	now := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	hash := "$argon2id$v=19$m=19456,t=2,p=1$abc$def"
	want := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsInB1cnBvc2UiOiJwYXNzd29yZF9yZXNldCIsInB3ZCI6IjAyMWY1YmQxY2JkM2VjYTA2N2QwOGY4MiIsImV4cCI6MTc5MTIwMzQwMH0.Mt8AusyAKdh-tuazt_Px7dQhoaNcybHCyTu57uMwFxc"
	got, err := SignPasswordReset("alice", hash, secret, now)
	if err != nil || got != want {
		t.Fatalf("token %s %v", got, err)
	}
	if sub := UnverifiedSubject(got); sub != "alice" {
		t.Fatalf("unverified %q", sub)
	}
	if sub, ok := VerifyPasswordReset(got, hash, secret, now.Add(29*time.Minute)); !ok || sub != "alice" {
		t.Fatal("valid link rejected")
	}
	for name, check := range map[string]func() bool{
		"expired":        func() bool { _, ok := VerifyPasswordReset(got, hash, secret, now.Add(30*time.Minute)); return ok },
		"password moved": func() bool { _, ok := VerifyPasswordReset(got, hash+"x", secret, now); return ok },
		"other secret":   func() bool { _, ok := VerifyPasswordReset(got, hash, []byte("x"), now); return ok },
		"session token": func() bool {
			session, _ := Sign("alice", 0, secret, now)
			_, ok := VerifyPasswordReset(session, hash, secret, now)
			return ok
		},
	} {
		if check() {
			t.Errorf("%s accepted", name)
		}
	}
	if UnverifiedSubject("garbage") != "" {
		t.Fatal("garbage subject")
	}
}

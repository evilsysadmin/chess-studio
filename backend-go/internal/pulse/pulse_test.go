package pulse

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fakeStore struct {
	exists   bool
	version  int64
	revision string
	authErr  error
	revErr   error
}

func (f *fakeStore) AuthState(context.Context, string) (bool, int64, error) {
	return f.exists, f.version, f.authErr
}

func (f *fakeStore) Revision(context.Context, string, time.Time) (string, error) {
	return f.revision, f.revErr
}

func TestPulseReturnsNativeRevisionForValidSession(t *testing.T) {
	now := time.Date(2026, 10, 1, 20, 0, 0, 0, time.UTC)
	store := &fakeStore{exists: true, version: 3, revision: "abc123"}
	h, err := NewHandler(HandlerConfig{
		Store:          store,
		JWTSecret:      "01234567890123456789012345678901",
		AllowedOrigins: []string{"https://staging.chess.test"},
		Now:            func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/lobby/pulse", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 3, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	req.Header.Set("Origin", "https://staging.chess.test")
	req.Header.Set("X-Request-ID", "req-123")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Native"); got != "lobby-pulse" {
		t.Fatalf("native header=%q", got)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "https://staging.chess.test" {
		t.Fatalf("cors origin=%q", got)
	}
	if got := rr.Header().Get("X-Request-ID"); got != "req-123" {
		t.Fatalf("request id=%q", got)
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["revision"] != "abc123" || body["source"] != "go" || body["pollAfterMs"] != float64(3000) {
		t.Fatalf("unexpected body: %#v", body)
	}
}

func TestPulseRejectsRevokedSessionVersion(t *testing.T) {
	now := time.Date(2026, 10, 1, 20, 0, 0, 0, time.UTC)
	h, err := NewHandler(HandlerConfig{
		Store:     &fakeStore{exists: true, version: 4, revision: "unused"},
		JWTSecret: "01234567890123456789012345678901",
		Now:       func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/lobby/pulse", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 3, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d want=401 body=%s", rr.Code, rr.Body.String())
	}
}

func TestPulseRejectsExpiredOrWrongPurposeTokens(t *testing.T) {
	now := time.Date(2026, 10, 1, 20, 0, 0, 0, time.UTC)
	h, err := NewHandler(HandlerConfig{
		Store:     &fakeStore{exists: true, version: 0, revision: "unused"},
		JWTSecret: "01234567890123456789012345678901",
		Now:       func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{
		signedToken(t, "alice", 0, now.Add(-time.Second), "session", "01234567890123456789012345678901"),
		signedToken(t, "alice", 0, now.Add(time.Hour), "password_reset", "01234567890123456789012345678901"),
	} {
		req := httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/lobby/pulse", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("status=%d want=401 body=%s", rr.Code, rr.Body.String())
		}
	}
}

func TestPulseOptionsHandlesCORSWithoutAuthentication(t *testing.T) {
	h, err := NewHandler(HandlerConfig{
		Store:          &fakeStore{},
		JWTSecret:      "01234567890123456789012345678901",
		AllowedOrigins: []string{"https://staging.chess.test"},
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodOptions, "http://edge/api/pvp/lobby/pulse", nil)
	req.Header.Set("Origin", "https://staging.chess.test")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d want=204", rr.Code)
	}
	if got := rr.Header().Get("Access-Control-Allow-Headers"); got == "" {
		t.Fatal("missing Access-Control-Allow-Headers")
	}
}

func TestPulseStorageFailureFailsClosed(t *testing.T) {
	h, err := NewHandler(HandlerConfig{
		Store:     &fakeStore{authErr: errors.New("mongo down")},
		JWTSecret: "01234567890123456789012345678901",
	})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	req := httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/lobby/pulse", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 0, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want=503 body=%s", rr.Code, rr.Body.String())
	}
}

func signedToken(t *testing.T, subject string, version int64, expires time.Time, purpose, secret string) string {
	t.Helper()
	header, err := json.Marshal(map[string]any{"alg": "HS256", "typ": "JWT"})
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(map[string]any{
		"sub":     subject,
		"purpose": purpose,
		"sv":      version,
		"exp":     expires.Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	left := base64.RawURLEncoding.EncodeToString(header)
	right := base64.RawURLEncoding.EncodeToString(payload)
	unsigned := left + "." + right
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(unsigned))
	return unsigned + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

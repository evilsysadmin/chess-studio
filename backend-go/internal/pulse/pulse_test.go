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
	exists    bool
	version   int64
	revision  string
	match     matchPulseState
	member    rosterRow
	authErr   error
	revErr    error
	matchErr  error
	joinErr   error
	leaveErr  error
	leftUsers []string
}

func (f *fakeStore) AuthState(context.Context, string) (bool, int64, error) {
	return f.exists, f.version, f.authErr
}

func (f *fakeStore) Revision(context.Context, string, time.Time) (string, error) {
	return f.revision, f.revErr
}

func (f *fakeStore) MatchState(context.Context, string, string, time.Time) (matchPulseState, error) {
	return f.match, f.matchErr
}

func (f *fakeStore) JoinRoster(context.Context, string, time.Time) (rosterRow, error) {
	return f.member, f.joinErr
}

func (f *fakeStore) LeaveRoster(_ context.Context, username string, _ time.Time) error {
	f.leftUsers = append(f.leftUsers, username)
	return f.leaveErr
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


func TestMatchPulseReturnsRevisionAndLifecycleHint(t *testing.T) {
	now := time.Date(2026, 10, 1, 20, 0, 0, 0, time.UTC)
	store := &fakeStore{
		exists:  true,
		version: 2,
		match: matchPulseState{Found: true, Revision: 7, Status: "active", LifecycleDue: true},
	}
	h, err := NewHandler(HandlerConfig{Store: store, JWTSecret: "01234567890123456789012345678901", Now: func() time.Time { return now }})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/matches/m-7/pulse", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 2, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["revision"] != float64(7) || body["status"] != "active" || body["lifecycleDue"] != true || body["pollAfterMs"] != float64(1250) {
		t.Fatalf("unexpected body: %#v", body)
	}
}

func TestMatchPulseNotFoundIsExplicit(t *testing.T) {
	now := time.Date(2026, 10, 1, 20, 0, 0, 0, time.UTC)
	h, err := NewHandler(HandlerConfig{
		Store:     &fakeStore{exists: true, version: 1},
		JWTSecret: "01234567890123456789012345678901",
		Now:       func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/matches/missing/pulse", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 1, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status=%d want=404 body=%s", rr.Code, rr.Body.String())
	}
}

func TestMatchLifecycleDueAtClockBoundary(t *testing.T) {
	now := time.Date(2026, 10, 1, 20, 0, 10, 0, time.UTC)
	row := matchRow{Status: "active", Turn: "w", WhiteClockMS: 5000, TurnStartedAt: now.Add(-5 * time.Second)}
	if !matchLifecycleDue(row, now) {
		t.Fatal("expected lifecycle due when running clock reaches zero")
	}
	row.WhiteClockMS = 6000
	if matchLifecycleDue(row, now) {
		t.Fatal("did not expect lifecycle due before clock expiry")
	}
}


func TestNativeRosterJoinAndLeave(t *testing.T) {
	now := time.Date(2026, 10, 1, 20, 0, 0, 0, time.UTC)
	store := &fakeStore{
		exists:  true,
		version: 5,
		member: rosterRow{
			Username: "alice",
			Rating: 1210,
			Tier: "Intermedio",
			JoinedAt: now.Add(-time.Minute),
		},
	}
	h, err := NewHandler(HandlerConfig{
		Store: store,
		JWTSecret: "01234567890123456789012345678901",
		EnableRoster: true,
		Now: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	token := signedToken(t, "alice", 5, now.Add(time.Hour), "session", "01234567890123456789012345678901")

	join := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/roster", nil)
	join.Header.Set("Authorization", "Bearer "+token)
	joinRR := httptest.NewRecorder()
	h.ServeHTTP(joinRR, join)
	if joinRR.Code != http.StatusOK {
		t.Fatalf("join status=%d body=%s", joinRR.Code, joinRR.Body.String())
	}
	if got := joinRR.Header().Get("X-Chess-Pvp-Native"); got != "roster" {
		t.Fatalf("native header=%q", got)
	}
	var body map[string]any
	if err := json.Unmarshal(joinRR.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	member, ok := body["member"].(map[string]any)
	if !ok || member["username"] != "alice" || member["rating"] != float64(1210) || member["isSelf"] != true {
		t.Fatalf("unexpected member: %#v", body["member"])
	}

	leave := httptest.NewRequest(http.MethodDelete, "http://edge/api/pvp/roster", nil)
	leave.Header.Set("Authorization", "Bearer "+token)
	leaveRR := httptest.NewRecorder()
	h.ServeHTTP(leaveRR, leave)
	if leaveRR.Code != http.StatusNoContent {
		t.Fatalf("leave status=%d body=%s", leaveRR.Code, leaveRR.Body.String())
	}
	if len(store.leftUsers) != 1 || store.leftUsers[0] != "alice" {
		t.Fatalf("leave calls=%v", store.leftUsers)
	}
}

func TestNativeRosterJoinRateLimit(t *testing.T) {
	now := time.Date(2026, 10, 1, 20, 0, 0, 0, time.UTC)
	store := &fakeStore{
		exists: true,
		version: 1,
		member: rosterRow{Username: "alice", Rating: 400, Tier: "Principiante", JoinedAt: now},
	}
	h, err := NewHandler(HandlerConfig{
		Store: store,
		JWTSecret: "01234567890123456789012345678901",
		EnableRoster: true,
		Now: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	token := signedToken(t, "alice", 1, now.Add(time.Hour), "session", "01234567890123456789012345678901")
	for i := 0; i < rosterJoinLimit; i++ {
		req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/roster", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("request %d status=%d body=%s", i+1, rr.Code, rr.Body.String())
		}
	}
	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/roster", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Fatalf("status=%d want=429 body=%s", rr.Code, rr.Body.String())
	}
	if rr.Header().Get("Retry-After") == "" {
		t.Fatal("missing Retry-After")
	}
}

func TestRatingNormalizationMatchesPythonContract(t *testing.T) {
	for _, tc := range []struct {
		value any
		want int64
	}{
		{nil, 400},
		{int64(0), 400},
		{int64(50), 100},
		{int64(400), 400},
		{int64(1200), 1200},
		{int64(20000), 10000},
	} {
		if got := normalizedRating(tc.value); got != tc.want {
			t.Fatalf("normalizedRating(%v)=%d want=%d", tc.value, got, tc.want)
		}
	}
}

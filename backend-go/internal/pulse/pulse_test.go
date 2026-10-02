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
	"strings"
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
	chatErr   error
	challengeErr error
	cancelChallenge challengeRow
	declineChallenge challengeRow
	cancelFound bool
	declineFound bool
	cancelMatch cancelMatchRow
	cancelResult cancelMatchResult
	cancelMatchErr error
	leftUsers []string
	chatRows  []chatMessageRow
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

func (f *fakeStore) AppendLobbyChat(_ context.Context, username, text string, now time.Time) (chatMessageRow, error) {
	if f.chatErr != nil { return chatMessageRow{}, f.chatErr }
	row := chatMessageRow{ID: "chat-1", Username: username, Text: text, Kind: "message", CreatedAt: now}
	f.chatRows = append(f.chatRows, row)
	return row, nil
}

func (f *fakeStore) CancelChallenge(context.Context, string, string, time.Time) (challengeRow, bool, error) {
	return f.cancelChallenge, f.cancelFound, f.challengeErr
}

func (f *fakeStore) DeclineChallenge(context.Context, string, string, time.Time) (challengeRow, bool, error) {
	return f.declineChallenge, f.declineFound, f.challengeErr
}

func (f *fakeStore) CancelStartingMatch(context.Context, string, string, time.Time) (cancelMatchRow, cancelMatchResult, error) {
	return f.cancelMatch, f.cancelResult, f.cancelMatchErr
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
		match: matchPulseState{Found: true, Revision: 7, Status: "active", LifecycleDue: true, OpponentPresence: "reconnecting"},
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
	if body["revision"] != float64(7) || body["status"] != "active" || body["lifecycleDue"] != true || body["opponentPresence"] != "reconnecting" || body["pollAfterMs"] != float64(1250) {
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

func TestMatchOpponentPresenceBandsMatchPythonContract(t *testing.T) {
	now := time.Date(2026, 10, 1, 20, 0, 20, 0, time.UTC)
	row := matchRow{Status: "active"}
	if got := matchOpponentPresence(row, now.Add(-3*time.Second), now); got != "online" {
		t.Fatalf("presence=%q want=online", got)
	}
	if got := matchOpponentPresence(row, now.Add(-8*time.Second), now); got != "reconnecting" {
		t.Fatalf("presence=%q want=reconnecting", got)
	}
	if got := matchOpponentPresence(row, now.Add(-13*time.Second), now); got != "disconnected" {
		t.Fatalf("presence=%q want=disconnected", got)
	}
	unrated := false
	row.Rated = &unrated
	if got := matchOpponentPresence(row, time.Time{}, now); got != "online" {
		t.Fatalf("synthetic presence=%q want=online", got)
	}
}

func TestDisconnectLifecycleOnlyEscalatesAtAuthoritativeBoundaries(t *testing.T) {
	now := time.Date(2026, 10, 1, 20, 1, 0, 0, time.UTC)
	row := matchRow{Status: "active"}
	callerSeen := now.Add(-time.Second)

	if !disconnectLifecycleDue(row, callerSeen, "disconnected", time.Time{}, now) {
		t.Fatal("missing grace must reconcile through Python")
	}
	grace := now.Add(-30 * time.Second)
	if disconnectLifecycleDue(row, callerSeen, "disconnected", grace, now) {
		t.Fatal("active grace should stay on the Go pulse")
	}
	grace = now.Add(-disconnectGrace)
	if !disconnectLifecycleDue(row, callerSeen, "disconnected", grace, now) {
		t.Fatal("expired grace must reconcile through Python")
	}
	if !disconnectLifecycleDue(row, now.Add(-13*time.Second), "disconnected", now.Add(-10*time.Second), now) {
		t.Fatal("returning observer must restart grace through Python")
	}
	if disconnectLifecycleDue(row, callerSeen, "reconnecting", time.Time{}, now) {
		t.Fatal("reconnecting rival should not mutate lifecycle")
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


func TestNativeLobbyChatMatchesPythonContract(t *testing.T) {
	now := time.Date(2026, 10, 2, 8, 0, 0, 123000000, time.UTC)
	store := &fakeStore{exists: true, version: 6}
	h, err := NewHandler(HandlerConfig{Store: store, JWTSecret: "01234567890123456789012345678901", EnableChat: true, Now: func() time.Time { return now }})
	if err != nil { t.Fatal(err) }
	token := signedToken(t, "alice", 6, now.Add(time.Hour), "session", "01234567890123456789012345678901")
	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/lobby/chat", strings.NewReader("{\"text\":\"  hola   mundo  \"}"))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
	if got := rr.Header().Get("X-Chess-Pvp-Native"); got != "lobby-chat" { t.Fatalf("native header=%q", got) }
	if len(store.chatRows) != 1 || store.chatRows[0].Text != "hola mundo" || store.chatRows[0].Username != "alice" { t.Fatalf("chat rows=%#v", store.chatRows) }
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil { t.Fatal(err) }
	msg, ok := body["message"].(map[string]any)
	if !ok || msg["id"] != "chat-1" || msg["username"] != "alice" || msg["text"] != "hola mundo" || msg["kind"] != "message" || msg["isSelf"] != true {
		t.Fatalf("unexpected message=%#v", body["message"])
	}
}

func TestNativeLobbyChatValidationAndRateLimit(t *testing.T) {
	now := time.Date(2026, 10, 2, 8, 0, 0, 0, time.UTC)
	store := &fakeStore{exists: true, version: 1}
	h, err := NewHandler(HandlerConfig{Store: store, JWTSecret: "01234567890123456789012345678901", EnableChat: true, Now: func() time.Time { return now }})
	if err != nil { t.Fatal(err) }
	token := signedToken(t, "alice", 1, now.Add(time.Hour), "session", "01234567890123456789012345678901")

	bad := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/lobby/chat", strings.NewReader("{\"text\":\"   \"}"))
	bad.Header.Set("Authorization", "Bearer "+token)
	badRR := httptest.NewRecorder()
	h.ServeHTTP(badRR, bad)
	if badRR.Code != http.StatusUnprocessableEntity { t.Fatalf("blank status=%d body=%s", badRR.Code, badRR.Body.String()) }

	for i := 0; i < lobbyChatLimit-1; i++ {
		req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/lobby/chat", strings.NewReader("{\"text\":\"hola\"}"))
		req.Header.Set("Authorization", "Bearer "+token)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK { t.Fatalf("request %d status=%d body=%s", i+1, rr.Code, rr.Body.String()) }
	}
	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/lobby/chat", strings.NewReader("{\"text\":\"uno más\"}"))
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests { t.Fatalf("rate status=%d want=429 body=%s", rr.Code, rr.Body.String()) }
	if rr.Header().Get("Retry-After") == "" { t.Fatal("missing Retry-After") }
}

func TestNativeLobbyChatDisabledReturnsNotFound(t *testing.T) {
	now := time.Date(2026, 10, 2, 8, 0, 0, 0, time.UTC)
	h, err := NewHandler(HandlerConfig{Store: &fakeStore{exists: true, version: 1}, JWTSecret: "01234567890123456789012345678901", Now: func() time.Time { return now }})
	if err != nil { t.Fatal(err) }
	token := signedToken(t, "alice", 1, now.Add(time.Hour), "session", "01234567890123456789012345678901")
	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/lobby/chat", strings.NewReader("{\"text\":\"hola\"}"))
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound { t.Fatalf("status=%d want=404 body=%s", rr.Code, rr.Body.String()) }
}


func TestNativeChallengeCancelAndDeclineParity(t *testing.T) {
	now := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	base := challengeRow{
		ID: "c-1", Challenger: "alice", Opponent: "bob",
		ChallengerRating: 1200, OpponentRating: 1300,
		CreatedAt: now.Add(-10*time.Second), ResolvedAt: now,
	}
	store := &fakeStore{exists: true, version: 3, cancelFound: true, declineFound: true}
	store.cancelChallenge = base
	store.cancelChallenge.Status = "cancelled"
	store.declineChallenge = base
	store.declineChallenge.Status = "declined"
	h, err := NewHandler(HandlerConfig{
		Store: store,
		JWTSecret: "01234567890123456789012345678901",
		EnableChallengeResolution: true,
		Now: func() time.Time { return now },
	})
	if err != nil { t.Fatal(err) }

	aliceToken := signedToken(t, "alice", 3, now.Add(time.Hour), "session", "01234567890123456789012345678901")
	cancelReq := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-1/cancel", nil)
	cancelReq.Header.Set("Authorization", "Bearer "+aliceToken)
	cancelRR := httptest.NewRecorder()
	h.ServeHTTP(cancelRR, cancelReq)
	if cancelRR.Code != http.StatusOK { t.Fatalf("cancel status=%d body=%s", cancelRR.Code, cancelRR.Body.String()) }
	var cancelBody map[string]any
	if err := json.Unmarshal(cancelRR.Body.Bytes(), &cancelBody); err != nil { t.Fatal(err) }
	cancelChallenge, ok := cancelBody["challenge"].(map[string]any)
	if !ok || cancelChallenge["status"] != "cancelled" || cancelChallenge["direction"] != "outgoing" || cancelChallenge["matchId"] != nil {
		t.Fatalf("cancel challenge=%#v", cancelBody["challenge"])
	}

	bobToken := signedToken(t, "bob", 3, now.Add(time.Hour), "session", "01234567890123456789012345678901")
	declineReq := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-1/decline", nil)
	declineReq.Header.Set("Authorization", "Bearer "+bobToken)
	declineRR := httptest.NewRecorder()
	h.ServeHTTP(declineRR, declineReq)
	if declineRR.Code != http.StatusOK { t.Fatalf("decline status=%d body=%s", declineRR.Code, declineRR.Body.String()) }
	var declineBody map[string]any
	if err := json.Unmarshal(declineRR.Body.Bytes(), &declineBody); err != nil { t.Fatal(err) }
	declined, ok := declineBody["challenge"].(map[string]any)
	if !ok || declined["status"] != "declined" || declined["direction"] != "incoming" {
		t.Fatalf("decline challenge=%#v", declineBody["challenge"])
	}
}

func TestNativeChallengeResolutionPreservesNotFoundSemantics(t *testing.T) {
	now := time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)
	h, err := NewHandler(HandlerConfig{
		Store: &fakeStore{exists: true, version: 1},
		JWTSecret: "01234567890123456789012345678901",
		EnableChallengeResolution: true,
		Now: func() time.Time { return now },
	})
	if err != nil { t.Fatal(err) }
	token := signedToken(t, "alice", 1, now.Add(time.Hour), "session", "01234567890123456789012345678901")
	for _, tc := range []struct{ suffix, detail string }{
		{"cancel", "Reto saliente pendiente no encontrado."},
		{"decline", "Reto pendiente no encontrado."},
	} {
		req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-missing/"+tc.suffix, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusNotFound || !strings.Contains(rr.Body.String(), tc.detail) {
			t.Fatalf("%s status=%d body=%s", tc.suffix, rr.Code, rr.Body.String())
		}
	}
}

func TestNativeMatchHandoffCancelPreservesPythonSemantics(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	endReason := "handoff_cancelled"
	store := &fakeStore{
		exists: true,
		version: 2,
		cancelResult: cancelMatchOK,
		cancelMatch: cancelMatchRow{
			ID: "m-1", White: "alice", Black: "bob", FEN: "start-fen", Turn: "w",
			Status: "cancelled", EndReason: &endReason, Revision: 4,
			CreatedAt: now.Add(-time.Minute), UpdatedAt: now,
			ReadyDeadline: now.Add(20 * time.Second),
		},
	}
	h, err := NewHandler(HandlerConfig{
		Store: store,
		JWTSecret: "01234567890123456789012345678901",
		EnableMatchHandoffCancel: true,
		Now: func() time.Time { return now },
	})
	if err != nil { t.Fatal(err) }

	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/cancel-starting", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 2, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
	if got := rr.Header().Get("X-Chess-Pvp-Native"); got != "match-handoff-cancel" {
		t.Fatalf("native header=%q", got)
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil { t.Fatal(err) }
	match, ok := body["match"].(map[string]any)
	if !ok { t.Fatalf("match=%#v", body["match"]) }
	if match["status"] != "cancelled" || match["endReason"] != "handoff_cancelled" || match["youAre"] != "w" || match["yourTurn"] != false {
		t.Fatalf("unexpected match=%#v", match)
	}
	clock, ok := match["clock"].(map[string]any)
	if !ok || clock["id"] != "10+0" || clock["whiteMs"] != float64(600000) || clock["runningColor"] != nil {
		t.Fatalf("clock=%#v", match["clock"])
	}
	if match["ratingChange"] != nil || match["result"] != nil || match["opponentDisconnectDeadline"] != nil {
		t.Fatalf("terminal metadata=%#v", match)
	}
}

func TestNativeMatchHandoffCancelPreservesConflictAndNotFoundSemantics(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	cases := []struct {
		name string
		result cancelMatchResult
		status int
		detail string
	}{
		{"missing", cancelMatchNotFound, http.StatusNotFound, "Partida 1v1 no encontrada."},
		{"active", cancelMatchWrongState, http.StatusConflict, "El duelo ya ha empezado y no puede cancelarse como entrada."},
		{"race", cancelMatchRevisionConflict, http.StatusConflict, "El duelo cambió mientras cancelábamos la entrada."},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h, err := NewHandler(HandlerConfig{
				Store: &fakeStore{exists: true, version: 1, cancelResult: tc.result},
				JWTSecret: "01234567890123456789012345678901",
				EnableMatchHandoffCancel: true,
				Now: func() time.Time { return now },
			})
			if err != nil { t.Fatal(err) }
			req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-x/cancel-starting", nil)
			req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 1, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != tc.status || !strings.Contains(rr.Body.String(), tc.detail) {
				t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
			}
		})
	}
}

func TestCancelledResidentMatchKeepsPythonIdentityAndVirtualPresence(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	rated := false
	row := cancelMatchRow{
		ID: "m-resident", White: "alice", Black: "marta_stein", FEN: "start-fen",
		Turn: "w", Status: "cancelled", Rated: &rated, Revision: 2,
	}
	match := publicCancelledMatch(row, "alice", now, true)
	if match["blackDisplayName"] != "Marta Stein" || match["blackActorKind"] != "resident" || match["blackActorLabel"] != "RESIDENTE · IA" {
		t.Fatalf("resident identity=%#v", match)
	}
	if match["opponentPresence"] != "online" || match["opponentSeenAt"] == nil {
		t.Fatalf("resident presence=%#v", match)
	}
}

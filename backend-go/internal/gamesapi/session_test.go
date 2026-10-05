package gamesapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
)

type fakeEmails struct {
	email any
	err   error
}

func (f fakeEmails) Email(context.Context, string) (any, error) { return f.email, f.err }

type fakeBeats struct {
	beats   []presence.Heartbeat
	logouts int
	err     error
}

func (f *fakeBeats) Beat(_ *http.Request, _ string, beat presence.Heartbeat) error {
	f.beats = append(f.beats, beat)
	return f.err
}

func (f *fakeBeats) Logout(*http.Request, string) error {
	f.logouts++
	return f.err
}

func newSessionFixture(t *testing.T, emails fakeEmails) (*SessionHandler, *fakeBeats) {
	t.Helper()
	beats := &fakeBeats{}
	h, err := NewSession(SessionConfig{
		Config:               Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Emails:               emails,
		Sessions:             beats,
		AdminUsernames:       []string{" Alice "},
		EmailRecoveryEnabled: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	return h, beats
}

func sessionDo(t *testing.T, h *SessionHandler, method, path, body, ct, user string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if ct != "" {
		r.Header.Set("Content-Type", ct)
	}
	if user != "" {
		r.Header.Set("Authorization", "Bearer "+token(t, user, 0))
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestMeAnswersInPythonsShape(t *testing.T) {
	h, _ := newSessionFixture(t, fakeEmails{email: "alice@example.test"})
	w := sessionDo(t, h, http.MethodGet, MePattern, "", "", "alice")
	if w.Code != http.StatusOK || w.Body.String() != `{"username":"alice","isAdmin":true,"email":"alice@example.test","emailRecoveryEnabled":true}` {
		t.Fatalf("me: %d %s", w.Code, w.Body)
	}
	h, _ = newSessionFixture(t, fakeEmails{})
	if w := sessionDo(t, h, http.MethodGet, MePattern, "", "", "bob"); w.Body.String() != `{"username":"bob","isAdmin":false,"email":null,"emailRecoveryEnabled":true}` {
		t.Fatalf("no email: %s", w.Body)
	}
	if w := sessionDo(t, h, http.MethodGet, MePattern, "", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", w.Code)
	}
	h, _ = newSessionFixture(t, fakeEmails{err: errors.New("down")})
	if w := sessionDo(t, h, http.MethodGet, MePattern, "", "", "bob"); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("storage: %d", w.Code)
	}
}

func TestActivityHeartbeatSanitisesLikePython(t *testing.T) {
	h, beats := newSessionFixture(t, fakeEmails{})
	for _, body := range []string{
		``,
		`null`,
		`{"activity":"Partida","foreground":"yes","release":" v16.6dm46j "}`,
		`{"activity":"Hackeando","foreground":0,"release":"16.6"}`,
		`{"extra":1}`,
	} {
		if w := sessionDo(t, h, http.MethodPost, ActivityPattern, body, jsonCT, "alice"); w.Code != http.StatusNoContent {
			t.Fatalf("%q: %d %s", body, w.Code, w.Body)
		}
	}
	if len(beats.beats) != 5 {
		t.Fatalf("beats %+v", beats.beats)
	}
	full := beats.beats[2]
	if full.Activity != "Partida" || full.Foreground == nil || !*full.Foreground || full.Release != "v16.6dm46j" {
		t.Fatalf("full %+v", full)
	}
	dropped := beats.beats[3]
	if dropped.Activity != "" || dropped.Release != "" || dropped.Foreground == nil || *dropped.Foreground {
		t.Fatalf("dropped %+v", dropped)
	}
	for _, tc := range []struct{ body, typ string }{
		{`[]`, "model_attributes_type"},
		{`{"activity":1}`, "string_type"},
		{`{"activity":"` + strings.Repeat("x", 41) + `"}`, "string_too_long"},
		{`{"foreground":2}`, "bool_parsing"},
		{`{"foreground":[]}`, "bool_type"},
		{`{"release":"` + strings.Repeat("v", 33) + `"}`, "string_too_long"},
	} {
		w := sessionDo(t, h, http.MethodPost, ActivityPattern, tc.body, jsonCT, "alice")
		if w.Code != http.StatusUnprocessableEntity || !strings.Contains(w.Body.String(), `"type":"`+tc.typ+`"`) {
			t.Errorf("%s: %d %s", tc.body, w.Code, w.Body)
		}
	}
	if w := sessionDo(t, h, http.MethodPost, ActivityPattern, `{`, jsonCT, ""); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("malformed before auth: %d", w.Code)
	}
	beats.err = presence.ErrUnavailable
	if w := sessionDo(t, h, http.MethodPost, ActivityPattern, ``, "", "bob"); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("storage: %d", w.Code)
	}
}

func TestLogoutNeverFailsAndHasItsOwnLimit(t *testing.T) {
	h, beats := newSessionFixture(t, fakeEmails{})
	beats.err = errors.New("down")
	for i := 0; i < 30; i++ {
		if w := sessionDo(t, h, http.MethodPost, LogoutPattern, "", "", "alice"); w.Code != http.StatusNoContent {
			t.Fatalf("logout %d: %d", i, w.Code)
		}
	}
	if w := sessionDo(t, h, http.MethodPost, LogoutPattern, "", "", "alice"); w.Code != http.StatusTooManyRequests {
		t.Fatalf("31st: %d", w.Code)
	}
	if w := sessionDo(t, h, http.MethodPost, ActivityPattern, "", "", "alice"); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("activity has its own bucket: %d", w.Code)
	}
	if beats.logouts != 30 {
		t.Fatalf("logouts %d", beats.logouts)
	}
}

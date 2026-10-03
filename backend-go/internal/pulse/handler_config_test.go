package pulse

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengeaccept"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchresign"
)

// cmd/pvp-edge passes nil service pointers for disabled routes. They must
// behave as absent dependencies (404), not as present ones that panic.
func TestDisabledRoutesWithTypedNilDependenciesReturnNotFound(t *testing.T) {
	now := time.Date(2026, 10, 3, 10, 0, 0, 0, time.UTC)
	const secret = "01234567890123456789012345678901"
	var accept *challengeaccept.Service
	var resign *matchresign.Service
	var moves *MoveStore
	var lobby *MongoStore
	h, err := NewHandler(HandlerConfig{
		Store:           &fakeStore{exists: true, version: 2},
		LobbyReadStore:  lobby,
		ChallengeAccept: accept,
		MatchResign:     resign,
		MatchMoveStore:  moves,
		JWTSecret:       secret,
		Now:             func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/api/pvp/lobby"},
		{http.MethodPost, "/api/pvp/challenges/c-1/accept"},
		{http.MethodPost, "/api/pvp/matches/m-1/resign"},
		{http.MethodPost, "/api/pvp/matches/m-1/move"},
	} {
		req := httptest.NewRequest(tc.method, "http://edge"+tc.path, nil)
		req.Header.Set("Authorization", "Bearer "+signedToken(t, "bob", 2, now.Add(time.Hour), "session", secret))
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusNotFound {
			t.Errorf("%s %s: status=%d want 404", tc.method, tc.path, rr.Code)
		}
	}
}

func TestPresentKeepsRealValues(t *testing.T) {
	var none lobbyReadStore
	if present(none) != nil {
		t.Fatal("nil interface changed")
	}
	store := &MongoStore{}
	if got := present[lobbyReadStore](store); got == nil {
		t.Fatal("real value dropped")
	}
	var typedNil *MongoStore
	if got := present[lobbyReadStore](typedNil); got != nil {
		t.Fatal("typed nil kept")
	}
}

func TestUnknownPathIsNotTheLobbyPulse(t *testing.T) {
	now := time.Date(2026, 10, 3, 10, 0, 0, 0, time.UTC)
	const secret = "01234567890123456789012345678901"
	h, err := NewHandler(HandlerConfig{
		Store: &fakeStore{exists: true, version: 2}, JWTSecret: secret,
		Now: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/somewhere-else", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "bob", 2, now.Add(time.Hour), "session", secret))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s; unknown GETs used to fall through to the lobby revision", rr.Code, rr.Body.String())
	}
}

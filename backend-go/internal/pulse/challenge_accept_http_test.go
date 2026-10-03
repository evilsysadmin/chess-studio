package pulse

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengeaccept"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type fakeChallengeAcceptService struct {
	result      challengeaccept.Result
	err         error
	calls       int
	challengeID string
	username    string
	synthetic   bool
}

func (f *fakeChallengeAcceptService) Accept(_ context.Context, challengeID, username string, synthetic bool) (challengeaccept.Result, error) {
	f.calls++
	f.challengeID = challengeID
	f.username = username
	f.synthetic = synthetic
	return f.result, f.err
}

func TestNativeChallengeAcceptReturnsHandoffAndBestEffortSystemMessage(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 30, 0, 0, time.UTC)
	match := challengeaccept.Match{
		ID:            "challenge-1",
		White:         "alice",
		Black:         "bob",
		WhiteRating:   1200,
		BlackRating:   1300,
		FEN:           challengeaccept.StartingFEN,
		Turn:          "w",
		Status:        "starting",
		Rated:         true,
		WhiteClockMS:  challengeaccept.InitialClockMS,
		BlackClockMS:  challengeaccept.InitialClockMS,
		ReadyDeadline: now.Add(challengeaccept.ReadyTimeout),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	service := &fakeChallengeAcceptService{result: challengeaccept.Result{
		Match: match, AcceptedNow: true, Challenger: "alice",
	}}
	store := &fakeStore{exists: true, version: 2}
	h, err := NewHandler(HandlerConfig{
		Store:           store,
		JWTSecret:       "01234567890123456789012345678901",
		ChallengeAccept: service,
		Now:             func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/challenge-1/accept", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "bob", 2, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Native"); got != "challenge-accept" {
		t.Fatalf("native header=%q", got)
	}
	if len(store.systemMessages) != 1 || store.systemMessages[0] != "bob aceptó el reto de alice." {
		t.Fatalf("system messages=%#v", store.systemMessages)
	}
	var body struct {
		Match map[string]any `json:"match"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Match["id"] != "challenge-1" || body.Match["status"] != "starting" || body.Match["youAre"] != "b" {
		t.Fatalf("unexpected match DTO: %#v", body.Match)
	}
}

func TestNativeChallengeAcceptUsesCanonicalFullMatchWhenAvailable(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 30, 0, 0, time.UTC)
	service := &fakeChallengeAcceptService{result: challengeaccept.Result{
		Match: challengeaccept.Match{ID: "match-1", White: "alice", Black: "bob", Status: "active"},
	}}
	whiteRating, blackRating := int64(1200), int64(1300)
	whiteClock, blackClock := int64(590000), int64(580000)
	rated := true
	store := &fakeStore{
		exists:       true,
		version:      2,
		handoffFound: true,
		handoffMatch: cancelMatchRow{
			ID: "match-1", White: "alice", Black: "bob", WhiteRating: &whiteRating, BlackRating: &blackRating,
			FEN: challengeaccept.StartingFEN, Turn: "b", Status: "active", WhiteClockMS: &whiteClock,
			BlackClockMS: &blackClock, Rated: &rated, Revision: 7, History: []bson.M{{"uci": "e2e4"}},
		},
	}
	h, _ := NewHandler(HandlerConfig{
		Store: store, JWTSecret: "01234567890123456789012345678901", ChallengeAccept: service,
		Now: func() time.Time { return now },
	})
	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-1/accept", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "bob", 2, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body struct {
		Match map[string]any `json:"match"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Match["revision"] != float64(7) {
		t.Fatalf("canonical revision missing: %#v", body.Match)
	}
	history, ok := body.Match["history"].([]any)
	if !ok || len(history) != 1 {
		t.Fatalf("canonical history missing: %#v", body.Match["history"])
	}
}

func TestNativeChallengeAcceptMapsDomainConflicts(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 30, 0, 0, time.UTC)
	tests := []struct {
		name   string
		err    error
		status int
		detail string
	}{
		{"not found", challengeaccept.ErrChallengeNotFound, 404, "Reto pendiente no encontrado."},
		{"opponent busy", challengeaccept.ErrOpponentBusy, 409, "El rival ya está entrando o jugando otro duelo."},
		{"self busy", challengeaccept.ErrSelfBusy, 409, "Ya tienes un duelo 1v1 en curso."},
		{"opponent unavailable", challengeaccept.ErrOpponentUnavailable, 409, "El rival ya no está disponible."},
		{"self unavailable", challengeaccept.ErrSelfUnavailable, 409, "Ya no figuras en el roster."},
		{"changed", challengeaccept.ErrChallengeChanged, 409, "El reto ya no está disponible."},
		{"storage", errors.New("mongo down"), 503, "No se pudo aceptar el reto 1v1."},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeStore{exists: true, version: 0}
			service := &fakeChallengeAcceptService{err: tc.err}
			h, _ := NewHandler(HandlerConfig{
				Store: store, JWTSecret: "01234567890123456789012345678901",
				ChallengeAccept: service, Now: func() time.Time { return now },
			})
			req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-1/accept", nil)
			req.Header.Set("Authorization", "Bearer "+signedToken(t, "bob", 0, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != tc.status {
				t.Fatalf("status=%d want=%d body=%s", rr.Code, tc.status, rr.Body.String())
			}
			var body map[string]any
			if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body["detail"] != tc.detail {
				t.Fatalf("detail=%#v want=%q", body["detail"], tc.detail)
			}
		})
	}
}

func TestChallengeAcceptDisabledIsNotHandledByNativePulse(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 30, 0, 0, time.UTC)
	h, _ := NewHandler(HandlerConfig{
		Store: &fakeStore{exists: true}, JWTSecret: "01234567890123456789012345678901",
		Now: func() time.Time { return now },
	})
	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-1/accept", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "bob", 0, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status=%d want=404 body=%s", rr.Code, rr.Body.String())
	}
}

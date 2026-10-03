package pulse

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchresign"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvprating"
)

type fakeMatchResignService struct {
	match   matchresign.Match
	outcome matchresign.Outcome
	err     error
	calls   int
	matchID string
	user    string
}

func (f *fakeMatchResignService) Resign(_ context.Context, matchID, username string) (matchresign.Match, matchresign.Outcome, error) {
	f.calls++
	f.matchID = matchID
	f.user = username
	return f.match, f.outcome, f.err
}

type fakeRatingSettlementService struct {
	result *pvprating.Settlement
	err    error
	calls  int
	match  pvprating.Match
}

func (f *fakeRatingSettlementService) Settle(_ context.Context, match pvprating.Match) (*pvprating.Settlement, error) {
	f.calls++
	f.match = match
	return f.result, f.err
}

func finishedRatedRow(now time.Time) cancelMatchRow {
	whiteRating := int64(1200)
	blackRating := int64(1350)
	whiteClock := int64(598500)
	blackClock := int64(600000)
	rated := true
	result := "0-1"
	endReason := "resignation"
	return cancelMatchRow{
		ID: "m-1", White: "alice", Black: "bob",
		WhiteRating: &whiteRating, BlackRating: &blackRating,
		FEN: "8/8/8/8/8/8/8/8 w - - 0 1", Turn: "w",
		Status: "finished", Result: &result, EndReason: &endReason,
		WhiteClockMS: &whiteClock, BlackClockMS: &blackClock,
		Rated: &rated, Revision: 8, CreatedAt: now.Add(-time.Minute), UpdatedAt: now,
	}
}

func TestNativeResignSettlesRatingAndReturnsPythonCompatibleTerminalDTO(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 30, 0, 0, time.UTC)
	resign := &fakeMatchResignService{outcome: matchresign.OutcomeOK}
	rating := &fakeRatingSettlementService{result: &pvprating.Settlement{White: 1191, Black: 1359}}
	store := &fakeStore{
		exists: true, version: 4,
		handoffFound: true, handoffMatch: finishedRatedRow(now),
	}
	h, err := NewHandler(HandlerConfig{
		Store: store, JWTSecret: "01234567890123456789012345678901",
		MatchResign: resign, RatingSettlement: rating,
		Now: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/resign", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 4, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Native"); got != "match-resign" {
		t.Fatalf("native=%q", got)
	}
	if resign.calls != 1 || resign.matchID != "m-1" || resign.user != "alice" {
		t.Fatalf("resign=%#v", resign)
	}
	if rating.calls != 1 {
		t.Fatalf("rating calls=%d", rating.calls)
	}
	if rating.match.ID != "m-1" || rating.match.Status != "finished" || rating.match.Result != "0-1" ||
		rating.match.WhiteRating != 1200 || rating.match.BlackRating != 1350 || !rating.match.Rated {
		t.Fatalf("rating match=%#v", rating.match)
	}

	var body struct {
		Match map[string]any `json:"match"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Match["status"] != "finished" || body.Match["result"] != "0-1" || body.Match["endReason"] != "resignation" {
		t.Fatalf("terminal dto=%#v", body.Match)
	}
	change, ok := body.Match["ratingChange"].(map[string]any)
	if !ok {
		t.Fatalf("ratingChange=%#v", body.Match["ratingChange"])
	}
	if change["before"] != float64(1200) || change["after"] != float64(1191) || change["delta"] != float64(-9) {
		t.Fatalf("ratingChange=%#v", change)
	}
}

func TestNativeResignRatingChangeForBlackViewer(t *testing.T) {
	row := finishedRatedRow(time.Now().UTC())
	change, ok := ratingChangePayload(row, "bob").(map[string]any)
	if !ok {
		t.Fatalf("change=%#v", ratingChangePayload(row, "bob"))
	}
	if change["before"] != int64(1350) || change["after"] != int64(1359) || change["delta"] != int64(9) {
		t.Fatalf("change=%#v", change)
	}
}

func TestNativeResignSkipsRatingChangeForUnratedMatch(t *testing.T) {
	row := finishedRatedRow(time.Now().UTC())
	unrated := false
	row.Rated = &unrated
	if got := ratingChangePayload(row, "alice"); got != nil {
		t.Fatalf("ratingChange=%#v want nil", got)
	}
}

func TestNativeResignMapsDomainOutcomes(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 30, 0, 0, time.UTC)
	tests := []struct {
		name    string
		outcome matchresign.Outcome
		err     error
		status  int
		detail  string
	}{
		{"missing", matchresign.OutcomeNotFound, nil, 404, "Partida 1v1 no encontrada."},
		{"finished", matchresign.OutcomeWrongState, nil, 409, "La partida ya ha terminado."},
		{"race", matchresign.OutcomeRevisionConflict, nil, 409, "La partida cambió mientras registrábamos la rendición."},
		{"storage", "", errors.New("mongo down"), 503, "No se pudo actualizar la partida 1v1."},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h, _ := NewHandler(HandlerConfig{
				Store: &fakeStore{exists: true}, JWTSecret: "01234567890123456789012345678901",
				MatchResign: &fakeMatchResignService{outcome: tc.outcome, err: tc.err},
				Now:         func() time.Time { return now },
			})
			req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/resign", nil)
			req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 0, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != tc.status {
				t.Fatalf("status=%d want=%d body=%s", rr.Code, tc.status, rr.Body.String())
			}
			var body map[string]any
			_ = json.Unmarshal(rr.Body.Bytes(), &body)
			if body["detail"] != tc.detail {
				t.Fatalf("detail=%#v want=%q", body["detail"], tc.detail)
			}
		})
	}
}

func TestNativeResignReturnsRetryableFailureWhenSettlementFailsAfterCommit(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 30, 0, 0, time.UTC)
	boom := errors.New("mongo down")
	h, _ := NewHandler(HandlerConfig{
		Store:            &fakeStore{exists: true, handoffFound: true, handoffMatch: finishedRatedRow(now)},
		JWTSecret:        "01234567890123456789012345678901",
		MatchResign:      &fakeMatchResignService{outcome: matchresign.OutcomeOK},
		RatingSettlement: &fakeRatingSettlementService{err: boom},
		Now:              func() time.Time { return now },
	})
	req := httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/resign", nil)
	req.Header.Set("Authorization", "Bearer "+signedToken(t, "alice", 0, now.Add(time.Hour), "session", "01234567890123456789012345678901"))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

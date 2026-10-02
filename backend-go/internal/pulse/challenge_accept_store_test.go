package pulse

import (
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengeaccept"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestChallengeAcceptStagedDocumentMatchesPythonSagaSchema(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	match := challengeaccept.Match{
		ID:            "challenge-1",
		White:         "alice",
		Black:         "bob",
		WhiteRating:   1200,
		BlackRating:   1300,
		FEN:           challengeaccept.StartingFEN,
		Turn:          "w",
		Status:        "starting",
		Revision:      0,
		Rated:         true,
		WhiteClockMS:  challengeaccept.InitialClockMS,
		BlackClockMS:  challengeaccept.InitialClockMS,
		ReadyDeadline: now.Add(challengeaccept.ReadyTimeout),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	doc := challengeAcceptStagedDocument(match, "challenge-1")

	for key, want := range map[string]any{
		"_id":              "challenge-1",
		"challenge_id":     "challenge-1",
		"acceptance_state": "staged",
		"white":            "alice",
		"black":            "bob",
		"status":           "starting",
		"turn":             "w",
		"rated":            true,
	} {
		if got := doc[key]; got != want {
			t.Fatalf("%s=%#v want=%#v", key, got, want)
		}
	}
	if got, ok := doc["history"].(bson.A); !ok || len(got) != 0 {
		t.Fatalf("history=%#v want empty BSON array", doc["history"])
	}
	if doc["start_at"] != (*time.Time)(nil) || doc["turn_started_at"] != (*time.Time)(nil) {
		t.Fatalf("starting match must not have running timestamps: %#v", doc)
	}
}

func TestChallengeAcceptDomainMatchPreservesHandoffFields(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	start := now.Add(5 * time.Second)
	rated := false
	whiteRating := int64(900)
	blackRating := int64(1100)
	whiteClock := int64(599000)
	blackClock := int64(598000)
	row := cancelMatchRow{
		ID:           "match-1",
		White:        "alice",
		Black:        "bob",
		WhiteRating:  &whiteRating,
		BlackRating:  &blackRating,
		FEN:          challengeaccept.StartingFEN,
		Turn:         "w",
		Status:       "active",
		Revision:     3,
		Rated:        &rated,
		WhiteClockMS: &whiteClock,
		BlackClockMS: &blackClock,
		WhiteReady:   true,
		BlackReady:   true,
		StartAt:      start,
		ReadyDeadline: now.Add(30 * time.Second),
		TurnStartedAt: start,
		CreatedAt:    now,
		UpdatedAt:    start,
	}
	got := challengeAcceptDomainMatch(row)
	if got.ID != row.ID || got.White != row.White || got.Black != row.Black || got.Revision != 3 {
		t.Fatalf("identity/state drift: %#v", got)
	}
	if got.Rated || got.WhiteRating != whiteRating || got.BlackRating != blackRating {
		t.Fatalf("rating drift: %#v", got)
	}
	if got.StartAt == nil || !got.StartAt.Equal(start) || got.TurnStartedAt == nil || !got.TurnStartedAt.Equal(start) {
		t.Fatalf("timestamp drift: %#v", got)
	}
	if got.WhiteClockMS != whiteClock || got.BlackClockMS != blackClock {
		t.Fatalf("clock drift: %#v", got)
	}
}

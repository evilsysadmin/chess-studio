package pulse

import (
	"crypto/sha256"
	"encoding/hex"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengecreate"
)

func TestChallengePairKeyIsStableAndUnordered(t *testing.T) {
	wantRaw := sha256.Sum256([]byte("alice\x00bob"))
	want := hex.EncodeToString(wantRaw[:])
	if got := challengePairKey("alice", "bob"); got != want {
		t.Fatalf("key=%q want=%q", got, want)
	}
	if got := challengePairKey("bob", "alice"); got != want {
		t.Fatalf("reverse key=%q want=%q", got, want)
	}
}

func TestChallengeCreateDocumentMatchesPythonSchema(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 0, 0, 0, time.UTC)
	challenge := challengecreate.Challenge{
		ID:               "c-1",
		Challenger:       "alice",
		Opponent:         "bob",
		ChallengerRating: 1200,
		OpponentRating:   1350,
		Status:           "pending",
		CreatedAt:        now,
	}
	doc := challengeCreateDocument(challenge, "pair")
	for key, want := range map[string]any{
		"_id": "c-1",
		"challenger": "alice",
		"opponent": "bob",
		"challenger_rating": int64(1200),
		"opponent_rating": int64(1350),
		"status": "pending",
		"pair_key": "pair",
	} {
		if got := doc[key]; got != want {
			t.Fatalf("%s=%#v want=%#v", key, got, want)
		}
	}
	if got, ok := doc["created_at"].(time.Time); !ok || !got.Equal(now) {
		t.Fatalf("created_at=%#v want=%v", doc["created_at"], now)
	}
}

func TestChallengeCreateDomainRowPreservesRatingsAndIdentity(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 0, 0, 0, time.UTC)
	row := challengeAcceptDoc{
		ID: "winner",
		Challenger: "bob",
		Opponent: "alice",
		ChallengerRating: 1350,
		OpponentRating: 1200,
		Status: "pending",
		CreatedAt: now,
	}
	got := challengeCreateDomainRow(row)
	if got.ID != "winner" || got.Challenger != "bob" || got.Opponent != "alice" {
		t.Fatalf("identity drift: %#v", got)
	}
	if got.ChallengerRating != 1350 || got.OpponentRating != 1200 || !got.CreatedAt.Equal(now) {
		t.Fatalf("row drift: %#v", got)
	}
}

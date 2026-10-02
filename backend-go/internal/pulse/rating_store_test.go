package pulse

import (
	"testing"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvprating"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestRatingUpdateFilterMatchesPythonCAS(t *testing.T) {
	filter := ratingUpdateFilter("alice", "m-1", 1200)
	if filter["_id"] != "alice" {
		t.Fatalf("_id=%#v", filter["_id"])
	}
	if got := filter["pvp_last_settled_match"]; got == nil {
		t.Fatalf("missing settled-match guard: %#v", filter)
	}
	preds, ok := filter["$or"].(bson.A)
	if !ok || len(preds) != 1 {
		t.Fatalf("rating predicates=%#v", filter["$or"])
	}
	if preds[0].(bson.M)["pvp_rating"] != int64(1200) {
		t.Fatalf("predicate=%#v", preds[0])
	}
}

func TestRatingUpdateFilterAllowsMissingDefaultRating(t *testing.T) {
	filter := ratingUpdateFilter("alice", "m-1", 0)
	preds, ok := filter["$or"].(bson.A)
	if !ok || len(preds) != 2 {
		t.Fatalf("rating predicates=%#v", filter["$or"])
	}
	if preds[0].(bson.M)["pvp_rating"] != pvprating.DefaultRating {
		t.Fatalf("default predicate=%#v", preds[0])
	}
	missing, ok := preds[1].(bson.M)["pvp_rating"].(bson.M)
	if !ok || missing["$exists"] != false {
		t.Fatalf("missing-rating predicate=%#v", preds[1])
	}
}

func TestRatingUpdateDocumentClampsTargetAndIncrementsGames(t *testing.T) {
	update := ratingUpdateDocument("m-9", 20000)
	set := update["$set"].(bson.M)
	if set["pvp_rating"] != pvprating.MaxRating {
		t.Fatalf("rating=%#v", set["pvp_rating"])
	}
	if set["pvp_last_settled_match"] != "m-9" {
		t.Fatalf("match=%#v", set["pvp_last_settled_match"])
	}
	inc := update["$inc"].(bson.M)
	if inc["pvp_rating_games"] != 1 {
		t.Fatalf("inc=%#v", inc)
	}
}

package pulse

// Integration tests against a real MongoDB. The unit tests next to each store
// pin filters and update documents; these prove the same writes behave on the
// server: revision CAS, idempotent retries, the unique pending-pair index and
// decoding of documents written by the Python authority (pymongo stores small
// ints as int32 and writes explicit nulls).
//
// They run when PVP_MONGO_TEST_URL points at a disposable server. CI sets
// PVP_MONGO_TEST_REQUIRED=1 so a missing server fails instead of skipping.

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengeaccept"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengecreate"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchdisconnect"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchmove"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvpclock"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const startingFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

var unsafeDBChars = regexp.MustCompile(`[^a-zA-Z0-9_]`)

// integrationStore returns a store bound to a fresh database with the indexes
// the Python authority declares (backend-python/pvp_store.py _ensure_indexes).
func integrationStore(t *testing.T) *MongoStore {
	t.Helper()
	uri := strings.TrimSpace(os.Getenv("PVP_MONGO_TEST_URL"))
	if uri == "" {
		if os.Getenv("PVP_MONGO_TEST_REQUIRED") == "1" {
			t.Fatal("PVP_MONGO_TEST_REQUIRED=1 but PVP_MONGO_TEST_URL is empty")
		}
		t.Skip("PVP_MONGO_TEST_URL not set; skipping MongoDB integration test")
	}
	suffix := make([]byte, 4)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	name := unsafeDBChars.ReplaceAllString(t.Name(), "_")
	if len(name) > 40 {
		name = name[:40]
	}
	database := fmt.Sprintf("pvp_it_%s_%s", name, hex.EncodeToString(suffix))

	ctx := context.Background()
	store, err := NewMongoStore(ctx, MongoConfig{URL: uri, Database: database, QueryTimeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() {
		_ = store.db.Drop(context.Background())
		_ = store.Close(context.Background())
	})

	_, err = store.db.Collection("pvp_challenges").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "pair_key", Value: 1}},
		Options: options.Index().
			SetName("pvp_pending_pair_unique").
			SetUnique(true).
			SetPartialFilterExpression(bson.M{"status": "pending", "pair_key": bson.M{"$type": "string"}}),
	})
	if err != nil {
		t.Fatalf("index: %v", err)
	}
	return store
}

// pythonMatch is an active match as pvp_api.py/pvp_store.py would persist it.
func pythonMatch(id string, now time.Time) bson.M {
	return bson.M{
		"_id":              id,
		"white":            "alice",
		"black":            "bob",
		"white_rating":     int32(400),
		"black_rating":     int32(400),
		"fen":              startingFEN,
		"turn":             "w",
		"status":           "active",
		"result":           nil,
		"history":          bson.A{},
		"revision":         int32(2),
		"rated":            true,
		"white_clock_ms":   int32(pvpclock.InitialMS),
		"black_clock_ms":   int32(pvpclock.InitialMS),
		"white_ready":      true,
		"black_ready":      true,
		"start_at":         now.Add(-time.Minute),
		"ready_deadline":   now.Add(-time.Minute),
		"turn_started_at":  now.Add(-time.Second),
		"end_reason":       nil,
		"created_at":       now.Add(-2 * time.Minute),
		"updated_at":       now.Add(-time.Second),
		"challenge_id":     "c-" + id,
		"acceptance_state": "active",
	}
}

func insertDoc(t *testing.T, store *MongoStore, collection string, doc bson.M) {
	t.Helper()
	if _, err := store.db.Collection(collection).InsertOne(context.Background(), doc); err != nil {
		t.Fatalf("insert %s: %v", collection, err)
	}
}

func fetchDoc(t *testing.T, store *MongoStore, collection, id string) bson.M {
	t.Helper()
	var doc bson.M
	if err := store.db.Collection(collection).FindOne(context.Background(), bson.M{"_id": id}).Decode(&doc); err != nil {
		t.Fatalf("fetch %s/%s: %v", collection, id, err)
	}
	return doc
}

func itNow() time.Time {
	// Mongo keeps millisecond precision; compare like with like.
	return time.Now().UTC().Truncate(time.Millisecond)
}

func TestMongoDecodesPythonShapedMatch(t *testing.T) {
	store := integrationStore(t)
	now := itNow()
	doc := pythonMatch("m-legacy", now)
	delete(doc, "black_clock_ms") // documents from before clocks were persisted
	doc["turn_started_at"] = nil
	insertDoc(t, store, "pvp_matches", doc)

	match, found, err := NewMoveStore(store).GetMatch(context.Background(), "m-legacy")
	if err != nil || !found {
		t.Fatalf("found=%v err=%v", found, err)
	}
	if match.WhiteClockMS != pvpclock.InitialMS {
		t.Fatalf("int32 clock decoded as %d", match.WhiteClockMS)
	}
	if match.BlackClockMS != pvpclock.InitialMS {
		t.Fatalf("missing clock fell back to %d, want %d", match.BlackClockMS, pvpclock.InitialMS)
	}
	if match.Result != nil || match.EndReason != nil || !match.TurnStartedAt.IsZero() {
		t.Fatalf("nulls drifted: result=%v reason=%v turn=%v", match.Result, match.EndReason, match.TurnStartedAt)
	}
	if match.Revision != 2 || !match.StartAt.Equal(now.Add(-time.Minute)) {
		t.Fatalf("revision=%d start=%v", match.Revision, match.StartAt)
	}
}

func TestMongoMoveCommitIsRevisionCAS(t *testing.T) {
	store := integrationStore(t)
	moves := NewMoveStore(store)
	now := itNow()
	insertDoc(t, store, "pvp_matches", pythonMatch("m-1", now))
	staged := pythonMatch("m-staged", now)
	staged["acceptance_state"] = "staged"
	insertDoc(t, store, "pvp_matches", staged)

	update := matchmove.Update{
		ExpectedRevision: 2,
		FEN:              "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
		Turn:             "b",
		Status:           "active",
		History:          []matchmove.HistoryEntry{{Ply: 1, UCI: "e2e4", SAN: "e4", By: "alice", At: now}},
		WhiteClockMS:     pvpclock.InitialMS - 1000,
		BlackClockMS:     pvpclock.InitialMS,
		TurnStartedAt:    now,
		UpdatedAt:        now,
	}

	// Two writers race on the same revision: exactly one may commit.
	var wg sync.WaitGroup
	var mu sync.Mutex
	committed := 0
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, ok, err := moves.Commit(context.Background(), "m-1", update)
			if err != nil {
				t.Errorf("commit: %v", err)
				return
			}
			if ok {
				mu.Lock()
				committed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if committed != 1 {
		t.Fatalf("committed=%d want exactly 1", committed)
	}

	match, _, err := moves.GetMatch(context.Background(), "m-1")
	if err != nil {
		t.Fatal(err)
	}
	if match.Revision != 3 || match.Turn != "b" || len(match.History) != 1 || match.History[0].UCI != "e2e4" {
		t.Fatalf("after commit: %#v", match)
	}
	if !match.History[0].At.Equal(now) || match.WhiteClockMS != pvpclock.InitialMS-1000 {
		t.Fatalf("history/clock drift: %#v", match)
	}

	if _, found, _ := moves.GetMatch(context.Background(), "m-staged"); found {
		t.Fatal("staged match visible to gameplay reads")
	}
	if _, ok, _ := moves.Commit(context.Background(), "m-staged", update); ok {
		t.Fatal("move committed on a staged match")
	}
}

func TestMongoTerminalWritesFinishOnce(t *testing.T) {
	ctx := context.Background()
	store := integrationStore(t)
	now := itNow()

	type finisher func(id string, rev int64) (bool, error)
	cases := map[string]struct {
		reason string
		finish finisher
	}{
		"resignation": {"resignation", func(id string, rev int64) (bool, error) {
			_, ok, err := NewResignStore(store).FinishResignation(ctx, id, rev, "0-1", 1000, -5, now)
			return ok, err
		}},
		"timeout": {"timeout", func(id string, rev int64) (bool, error) {
			_, ok, err := NewTimeoutStore(store).FinishTimeout(ctx, id, rev, "0-1", -5, 1000, now)
			return ok, err
		}},
		"disconnect": {"disconnect", func(id string, rev int64) (bool, error) {
			_, ok, err := NewDisconnectStore(store).FinishDisconnect(ctx, id, rev, "0-1", 1000, 1000, now)
			return ok, err
		}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			id := "m-" + name
			insertDoc(t, store, "pvp_matches", pythonMatch(id, now))

			if ok, err := tc.finish(id, 1); err != nil || ok {
				t.Fatalf("stale revision finished: ok=%v err=%v", ok, err)
			}
			if ok, err := tc.finish(id, 2); err != nil || !ok {
				t.Fatalf("finish: ok=%v err=%v", ok, err)
			}
			if ok, err := tc.finish(id, 3); err != nil || ok {
				t.Fatalf("finished twice: ok=%v err=%v", ok, err)
			}

			doc := fetchDoc(t, store, "pvp_matches", id)
			if doc["status"] != "finished" || doc["result"] != "0-1" || intFromBSON(doc["revision"]) != 3 {
				t.Fatalf("doc=%v", doc)
			}
			if doc["turn_started_at"] != nil {
				t.Fatalf("turn clock left running: %v", doc["turn_started_at"])
			}
			for _, field := range []string{"white_clock_ms", "black_clock_ms"} {
				if intFromBSON(doc[field]) < 0 {
					t.Fatalf("%s persisted negative: %v", field, doc[field])
				}
			}
		})
	}
}

func TestMongoDisconnectGraceDoesNotBumpRevision(t *testing.T) {
	ctx := context.Background()
	store := integrationStore(t)
	disconnects := NewDisconnectStore(store)
	now := itNow()
	insertDoc(t, store, "pvp_matches", pythonMatch("m-grace", now))

	first, ok, err := disconnects.BeginGrace(ctx, "m-grace", matchdisconnect.White, now, false)
	if err != nil || !ok {
		t.Fatalf("begin: ok=%v err=%v", ok, err)
	}
	// A second call without restart keeps the original start of the grace window.
	_, ok, err = disconnects.BeginGrace(ctx, "m-grace", matchdisconnect.White, now.Add(10*time.Second), false)
	if err != nil || !ok {
		t.Fatalf("repeat: ok=%v err=%v", ok, err)
	}
	doc := fetchDoc(t, store, "pvp_matches", "m-grace")
	started, _ := doc["white_disconnect_grace_started_at"].(bson.DateTime)
	if !started.Time().Equal(now) {
		t.Fatalf("grace start moved to %v, want %v", started.Time(), now)
	}
	if first.Revision != 2 || intFromBSON(doc["revision"]) != 2 {
		t.Fatalf("presence bookkeeping bumped revision: domain=%d doc=%v", first.Revision, doc["revision"])
	}
}

func TestMongoCreateChallengeKeepsOnePendingPerPair(t *testing.T) {
	ctx := context.Background()
	store := integrationStore(t)
	now := itNow()

	var wg sync.WaitGroup
	results := make([]challengecreate.Challenge, 8)
	created := make([]bool, 8)
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			// Alternate directions: alice→bob and bob→alice are the same pair.
			challenger, opponent := "alice", "bob"
			if i%2 == 1 {
				challenger, opponent = opponent, challenger
			}
			row, ok, err := store.CreateChallenge(ctx, challengecreate.Challenge{
				ID: fmt.Sprintf("c-%d", i), Challenger: challenger, Opponent: opponent,
				ChallengerRating: 400, OpponentRating: 400, Status: "pending", CreatedAt: now,
			}, now)
			if err != nil {
				t.Errorf("create %d: %v", i, err)
				return
			}
			results[i], created[i] = row, ok
		}(i)
	}
	wg.Wait()

	winners := 0
	for i := range results {
		if created[i] {
			winners++
		}
		if results[i].ID != results[0].ID {
			t.Fatalf("callers disagree on the pending challenge: %q vs %q", results[i].ID, results[0].ID)
		}
	}
	if winners != 1 {
		t.Fatalf("created=%d want exactly 1", winners)
	}
	pending, err := store.db.Collection("pvp_challenges").CountDocuments(ctx, bson.M{"status": "pending"})
	if err != nil || pending != 1 {
		t.Fatalf("pending=%d err=%v", pending, err)
	}
}

func TestMongoCreateChallengeSeesPythonPending(t *testing.T) {
	ctx := context.Background()
	store := integrationStore(t)
	now := itNow()
	insertDoc(t, store, "pvp_challenges", bson.M{
		"_id": "c-py", "challenger": "bob", "opponent": "alice",
		"challenger_rating": int32(410), "opponent_rating": int32(390),
		"status": "pending", "created_at": now.Add(-time.Second),
		"pair_key": challengePairKey("bob", "alice"),
	})

	row, created, err := store.CreateChallenge(ctx, challengecreate.Challenge{
		ID: "c-go", Challenger: "alice", Opponent: "bob", Status: "pending", CreatedAt: now,
	}, now)
	if err != nil || created || row.ID != "c-py" || row.ChallengerRating != 410 {
		t.Fatalf("row=%#v created=%v err=%v", row, created, err)
	}
}

func acceptMatch(id string, now time.Time) challengeaccept.Match {
	return challengeaccept.Match{
		ID: id, White: "alice", Black: "bob", WhiteRating: 400, BlackRating: 400,
		FEN: startingFEN, Turn: "w", Status: "starting", Rated: true,
		WhiteClockMS: pvpclock.InitialMS, BlackClockMS: pvpclock.InitialMS,
		ReadyDeadline: now.Add(pvpclock.ReadyTimeout), CreatedAt: now, UpdatedAt: now,
	}
}

func TestMongoCommitAcceptanceSagaIsIdempotent(t *testing.T) {
	ctx := context.Background()
	store := integrationStore(t)
	now := itNow()
	insertDoc(t, store, "pvp_challenges", bson.M{
		"_id": "c-1", "challenger": "alice", "opponent": "bob",
		"challenger_rating": int32(400), "opponent_rating": int32(400),
		"status": "pending", "created_at": now.Add(-time.Second),
		"pair_key": challengePairKey("alice", "bob"),
	})

	// The wrong user cannot accept, and the staged match it wrote is removed.
	if _, ok, err := store.CommitAcceptance(ctx, "c-1", "mallory", acceptMatch("c-1", now), now); err != nil || ok {
		t.Fatalf("foreign accept: ok=%v err=%v", ok, err)
	}
	if n, _ := store.db.Collection("pvp_matches").CountDocuments(ctx, bson.M{}); n != 0 {
		t.Fatalf("staged match leaked after rejected accept: %d", n)
	}

	match, ok, err := store.CommitAcceptance(ctx, "c-1", "bob", acceptMatch("c-1", now), now)
	if err != nil || !ok {
		t.Fatalf("accept: ok=%v err=%v", ok, err)
	}
	if match.Status != "starting" || match.WhiteClockMS != pvpclock.InitialMS || match.StartAt != nil {
		t.Fatalf("match=%#v", match)
	}

	// A retry after a crash between the steps resumes on the same documents.
	if _, ok, err := store.CommitAcceptance(ctx, "c-1", "bob", acceptMatch("c-1", now), now); err != nil || !ok {
		t.Fatalf("retry: ok=%v err=%v", ok, err)
	}
	challenge := fetchDoc(t, store, "pvp_challenges", "c-1")
	if challenge["status"] != "accepted" || challenge["match_id"] != "c-1" {
		t.Fatalf("challenge=%v", challenge)
	}
	stored := fetchDoc(t, store, "pvp_matches", "c-1")
	if stored["acceptance_state"] != "active" || stored["start_at"] != nil {
		t.Fatalf("stored=%v", stored)
	}
	if n, _ := store.db.Collection("pvp_matches").CountDocuments(ctx, bson.M{}); n != 1 {
		t.Fatalf("matches=%d want 1", n)
	}
}

func TestMongoCommitAcceptanceRejectsExpiredChallenge(t *testing.T) {
	ctx := context.Background()
	store := integrationStore(t)
	now := itNow()
	insertDoc(t, store, "pvp_challenges", bson.M{
		"_id": "c-old", "challenger": "alice", "opponent": "bob",
		"status": "pending", "created_at": now.Add(-challengeTTL - time.Second),
		"pair_key": challengePairKey("alice", "bob"),
	})
	if _, ok, err := store.CommitAcceptance(ctx, "c-old", "bob", acceptMatch("c-old", now), now); err != nil || ok {
		t.Fatalf("expired accept: ok=%v err=%v", ok, err)
	}
	if n, _ := store.db.Collection("pvp_matches").CountDocuments(ctx, bson.M{}); n != 0 {
		t.Fatalf("staged match leaked after expired accept: %d", n)
	}
}

func TestMongoApplyRatingSettlesEachMatchOnce(t *testing.T) {
	ctx := context.Background()
	store := integrationStore(t)
	// A user who never played rated PvP has no pvp_rating field at all.
	insertDoc(t, store, "users", bson.M{"_id": "alice"})

	if ok, err := store.ApplyRating(ctx, "alice", "m-1", 400, 416); err != nil || !ok {
		t.Fatalf("first settlement: ok=%v err=%v", ok, err)
	}
	// Retrying the same match is acknowledged without counting it again.
	if ok, err := store.ApplyRating(ctx, "alice", "m-1", 400, 416); err != nil || !ok {
		t.Fatalf("retry: ok=%v err=%v", ok, err)
	}
	// A different match computed from a stale rating must not apply.
	if ok, err := store.ApplyRating(ctx, "alice", "m-2", 400, 430); err != nil || ok {
		t.Fatalf("stale settlement applied: ok=%v err=%v", ok, err)
	}
	user := fetchDoc(t, store, "users", "alice")
	if intFromBSON(user["pvp_rating"]) != 416 || user["pvp_last_settled_match"] != "m-1" || intFromBSON(user["pvp_rating_games"]) != 1 {
		t.Fatalf("user=%v", user)
	}
	if ok, err := store.ApplyRating(ctx, "ghost", "m-1", 400, 416); err != nil || ok {
		t.Fatalf("missing user: ok=%v err=%v", ok, err)
	}
}

func TestMongoPingFailsAfterClose(t *testing.T) {
	store := integrationStore(t)
	if err := store.Ping(context.Background()); err != nil {
		t.Fatalf("ping: %v", err)
	}
	if err := store.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := store.Ping(context.Background()); err == nil {
		t.Fatal("ping succeeded on a closed client")
	}
}

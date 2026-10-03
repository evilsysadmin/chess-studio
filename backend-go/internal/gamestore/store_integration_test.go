package gamestore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gameops"
)

// The store tests run against a disposable MongoDB (PVP_MONGO_TEST_URL, set
// by CI's pvp-go workflow with PVP_MONGO_TEST_REQUIRED=1).
func testStore(t *testing.T) *Store {
	t.Helper()
	uri := strings.TrimSpace(os.Getenv("PVP_MONGO_TEST_URL"))
	if uri == "" {
		if os.Getenv("PVP_MONGO_TEST_REQUIRED") == "1" {
			t.Fatal("PVP_MONGO_TEST_REQUIRED=1 but PVP_MONGO_TEST_URL is empty")
		}
		t.Skip("PVP_MONGO_TEST_URL not set; skipping MongoDB integration test")
	}
	client, err := mongo.Connect(options.Client().ApplyURI(uri).SetServerSelectionTimeout(5 * time.Second))
	if err != nil {
		t.Fatal(err)
	}
	suffix := make([]byte, 4)
	_, _ = rand.Read(suffix)
	db := client.Database("games_it_" + hex.EncodeToString(suffix))
	t.Cleanup(func() {
		_ = db.Drop(context.Background())
		_ = client.Disconnect(context.Background())
	})
	// Same index Python declares in db.py.
	if _, err := db.Collection(Collection).Indexes().CreateOne(context.Background(), mongo.IndexModel{
		Keys: bson.D{{Key: "owner", Value: 1}, {Key: "updatedAt", Value: -1}},
	}); err != nil {
		t.Fatal(err)
	}
	return New(db, 5*time.Second)
}

func ptr[T any](v T) *T { return &v }

func sampleGame(owner string, moves ...string) Game {
	return Game{
		Owner:      ptr(owner),
		Moves:      moves,
		Difficulty: int32(50),
		HumanColor: "w",
		LastMove:   &LastMove{From: "e2", To: "e4", By: "human", Piece: ptr("p")},
	}
}

// pythonDoc is a document exactly as game_api.create_game + pymongo store it.
func pythonDoc(id, owner string, updated time.Time) bson.D {
	return bson.D{
		{Key: "_id", Value: id},
		{Key: "owner", Value: owner},
		{Key: "moves", Value: bson.A{"e4", "e5"}},
		{Key: "difficulty", Value: int32(73)},
		{Key: "humanColor", Value: "b"},
		{Key: "handicap", Value: nil},
		{Key: "initialFen", Value: nil},
		{Key: "lastMove", Value: bson.D{
			{Key: "from", Value: "e7"}, {Key: "to", Value: "e5"}, {Key: "by", Value: "human"},
			{Key: "captured", Value: false}, {Key: "piece", Value: "p"}, {Key: "promotion", Value: nil},
		}},
		{Key: "createOperation", Value: nil},
		{Key: "futureField", Value: bson.D{{Key: "kept", Value: true}}},
		{Key: "updatedAt", Value: bson.NewDateTimeFromTime(updated)},
	}
}

func rawDoc(t *testing.T, s *Store, id string) bson.M {
	t.Helper()
	var doc bson.M
	if err := s.col.FindOne(context.Background(), bson.D{{Key: "_id", Value: id}}).Decode(&doc); err != nil {
		t.Fatal(err)
	}
	return doc
}

func TestPythonDocumentRoundTripsThroughGo(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.col.InsertOne(ctx, pythonDoc("py-1", "alice", time.Now())); err != nil {
		t.Fatal(err)
	}
	game, found, err := s.GetForOwner(ctx, "py-1", "alice")
	if err != nil || !found {
		t.Fatalf("get: %v %v", found, err)
	}
	if game.Difficulty != int32(73) || game.HumanColor != "b" || game.LastMove.Piece == nil || *game.LastMove.Piece != "p" {
		t.Fatalf("decoded %+v", game)
	}
	expected := game.Moves
	game.Moves = append(append([]string{}, expected...), "Nf3")
	key := "op-12345678"
	game.OperationLedger = gameops.Remember(game.OperationLedger, &key, "fp", "move")
	ok, err := s.UpdateIfMoves(ctx, "py-1", game, expected)
	if err != nil || !ok {
		t.Fatalf("cas: %v %v", ok, err)
	}
	doc := rawDoc(t, s, "py-1")
	if _, isInt := doc["difficulty"].(int32); !isInt {
		t.Errorf("difficulty changed BSON type: %T", doc["difficulty"])
	}
	if doc["futureField"] == nil {
		t.Error("unknown field dropped by a Go rewrite")
	}
	for _, field := range []string{"handicap", "initialFen", "createOperation"} {
		if v, present := doc[field]; !present || v != nil {
			t.Errorf("%s should stay an explicit null, got %v (present=%v)", field, v, present)
		}
	}
	if _, isArray := doc["operationLedger"].(bson.A); !isArray {
		t.Errorf("operationLedger=%T", doc["operationLedger"])
	}
}

func TestCreateOnceRaceHasOneWinner(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	id := gameops.DeterministicGameID("alice", "op-12345678")
	var wg sync.WaitGroup
	results := make([]bool, 8)
	errs := make([]error, 8)
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, results[i], errs[i] = s.CreateOnce(ctx, id, sampleGame("alice"))
		}(i)
	}
	wg.Wait()
	created := 0
	for i, c := range results {
		if errs[i] != nil {
			t.Fatal(errs[i])
		}
		if c {
			created++
		}
	}
	if created != 1 {
		t.Fatalf("created=%d, want exactly 1", created)
	}
	game, created2, err := s.CreateOnce(ctx, id, sampleGame("bob"))
	if err != nil || created2 || *game.Owner != "alice" {
		t.Fatalf("retry must read the winner: %v %v %v", created2, err, game.Owner)
	}
	if doc := rawDoc(t, s, id); !reflect.DeepEqual(doc["moves"], bson.A{}) {
		t.Fatalf("empty moves must be an array, got %#v", doc["moves"])
	}
}

func TestUpdateIfMovesRejectsStaleHistory(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Create(ctx, "g1", sampleGame("alice")); err != nil {
		t.Fatal(err)
	}
	// Empty history: nil and [] both mean "no moves yet".
	if ok, err := s.UpdateIfMoves(ctx, "g1", sampleGame("alice", "e4"), nil); err != nil || !ok {
		t.Fatalf("first move: %v %v", ok, err)
	}
	if ok, _ := s.UpdateIfMoves(ctx, "g1", sampleGame("alice", "d4"), nil); ok {
		t.Fatal("second writer with the stale empty history must lose")
	}
	if ok, _ := s.UpdateIfMoves(ctx, "g1", sampleGame("alice", "e4", "e5"), []string{"e4", "e5"}); ok {
		t.Fatal("a history that never existed must not match")
	}
	if ok, _ := s.UpdateIfMoves(ctx, "missing", sampleGame("alice", "e4"), nil); ok {
		t.Fatal("CAS must never upsert")
	}
	game, _, _ := s.Get(ctx, "g1")
	if !reflect.DeepEqual(game.Moves, []string{"e4"}) {
		t.Fatalf("moves=%v", game.Moves)
	}
	if _, found, _ := s.Get(ctx, "missing"); found {
		t.Fatal("upserted")
	}
}

func TestOwnershipScoping(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	_, _ = s.Create(ctx, "mine", sampleGame("alice"))
	_, _ = s.Create(ctx, "theirs", sampleGame("bob"))
	if _, err := s.col.InsertOne(ctx, bson.D{{Key: "_id", Value: "legacy"}, {Key: "moves", Value: bson.A{}}}); err != nil {
		t.Fatal(err)
	}
	if _, found, _ := s.GetForOwner(ctx, "theirs", "alice"); found {
		t.Fatal("other owner's game leaked")
	}
	legacy, found, _ := s.GetForOwner(ctx, "legacy", "alice")
	if !found || legacy.Owner != nil {
		t.Fatal("ownerless legacy game must be returned so the API can answer 409")
	}
	if doc, found, _ := s.GetDocumentForOwner(ctx, "legacy", "alice"); !found || doc["owner"] != nil {
		t.Fatal("raw read must also return the ownerless legacy game")
	}
	if _, found, _ := s.GetDocumentForOwner(ctx, "theirs", "alice"); found {
		t.Fatal("raw read leaked another owner's game")
	}
	// A document the typed decode rejects (moves is not a list) is still read
	// raw, so the API answers Python's 409 instead of a false 503.
	if _, err := s.col.InsertOne(ctx, bson.D{{Key: "_id", Value: "damaged"}, {Key: "owner", Value: "alice"}, {Key: "moves", Value: "e4"}}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.GetForOwner(ctx, "damaged", "alice"); err == nil {
		t.Fatal("expected the typed read to fail on a damaged document")
	}
	if doc, found, err := s.GetDocumentForOwner(ctx, "damaged", "alice"); err != nil || !found || doc["moves"] != "e4" {
		t.Fatalf("raw read of damaged doc: %v %v %v", doc, found, err)
	}
	_, _ = s.Delete(ctx, "damaged")
	if ok, _ := s.DeleteForOwner(ctx, "theirs", "alice"); ok {
		t.Fatal("deleted another owner's game")
	}
	if ok, _ := s.DeleteForOwner(ctx, "mine", "alice"); !ok {
		t.Fatal("own delete failed")
	}
	_, _ = s.Create(ctx, "b2", sampleGame("bob"))
	if n, _ := s.DeleteByOwner(ctx, "bob"); n != 2 {
		t.Fatalf("deleted %d", n)
	}
	if ok, _ := s.Delete(ctx, "legacy"); !ok {
		t.Fatal("delete legacy")
	}
}

func TestSummariesMatchPythonShape(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	base := time.Date(2026, 10, 3, 7, 0, 0, 0, time.UTC)
	for i := range 23 {
		doc := pythonDoc("py-"+string(rune('a'+i)), "alice", base.Add(time.Duration(i)*time.Minute+123*time.Millisecond))
		if _, err := s.col.InsertOne(ctx, doc); err != nil {
			t.Fatal(err)
		}
	}
	_, _ = s.col.InsertOne(ctx, pythonDoc("other", "bob", base.Add(time.Hour)))
	_, _ = s.col.InsertOne(ctx, bson.D{{Key: "_id", Value: "bare"}, {Key: "owner", Value: "carol"}})

	summaries, err := s.ListSummariesByOwner(ctx, "alice", DefaultSummaryLimit)
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) != DefaultSummaryLimit {
		t.Fatalf("len=%d", len(summaries))
	}
	first := summaries[0]
	if first.ID != "py-w" || *first.UpdatedAt != "2026-10-03T07:22:00.123000" || first.Ply != 2 || first.Difficulty != int32(73) {
		t.Fatalf("first=%+v updated=%s", first, *first.UpdatedAt)
	}
	if n, _ := s.ListSummariesByOwner(ctx, "alice", 500); len(n) != 23 {
		t.Fatalf("clamped limit returned %d", len(n))
	}
	if n, _ := s.ListSummariesByOwner(ctx, "alice", -4); len(n) != 1 {
		t.Fatalf("limit floor returned %d", len(n))
	}
	bare, _ := s.ListSummariesByOwner(ctx, "carol", DefaultSummaryLimit)
	if len(bare) != 1 || bare[0].UpdatedAt != nil || bare[0].Difficulty != nil || bare[0].HumanColor != nil || bare[0].Ply != 0 {
		t.Fatalf("bare=%+v", bare)
	}
}

func TestUnavailableIsTyped(t *testing.T) {
	s := testStore(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := s.Get(ctx, "x"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err=%v", err)
	}
}

func TestCreateOnceOnlyReadsBackOnDuplicateKey(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Create(ctx, "dup", sampleGame("alice")); err != nil {
		t.Fatal(err)
	}
	// An insert that fails for any reason other than the duplicate id (here a
	// document over the 16MB BSON limit) must surface, not replay the winner.
	huge := sampleGame("alice")
	huge.Extra = bson.M{"blob": strings.Repeat("x", 17<<20)}
	if _, _, err := s.CreateOnce(ctx, "dup", huge); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err=%v", err)
	}
}

func TestUpdateUpsertsAndSummaryLimitCaps(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Update(ctx, "fresh", sampleGame("dora")); err != nil {
		t.Fatal(err)
	}
	if _, found, _ := s.Get(ctx, "fresh"); !found {
		t.Fatal("update_game upserts")
	}
	docs := make([]any, 0, 60)
	for i := range 60 {
		docs = append(docs, pythonDoc(hex.EncodeToString([]byte{byte(i)}), "dora", time.Now()))
	}
	if _, err := s.col.InsertMany(ctx, docs); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.ListSummariesByOwner(ctx, "dora", 500); len(got) != maxSummaryLimit {
		t.Fatalf("limit not capped: %d", len(got))
	}
}

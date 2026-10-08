package gamesapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	chess "github.com/corentings/chess/v2"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamestore"
)

// Against a disposable MongoDB (PVP_MONGO_TEST_URL, set by Quality's
// required Go lane with PVP_MONGO_TEST_REQUIRED=1): a game Python created is
// moved and undone by Go and keeps Python's document shape.
func integrationDB(t *testing.T) *mongo.Database {
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
	db := client.Database("games_writes_it_" + hex.EncodeToString(suffix))
	t.Cleanup(func() {
		_ = db.Drop(context.Background())
		_ = client.Disconnect(context.Background())
	})
	return db
}

// lockedCPU is safe for concurrent requests.
type lockedCPU struct {
	mu    sync.Mutex
	calls int
}

func (c *lockedCPU) MoveForGame(context.Context, []*chess.Position, float64) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls++
	return "e7e5", nil
}

func TestMoveAndUndoKeepPythonDocumentsAgainstMongo(t *testing.T) {
	db := integrationDB(t)
	col := db.Collection(gamestore.Collection)
	created := time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC)
	if _, err := col.InsertOne(context.Background(), bson.D{
		{Key: "_id", Value: "py-game"}, {Key: "owner", Value: "alice"}, {Key: "moves", Value: bson.A{}},
		{Key: "difficulty", Value: int32(64)}, {Key: "humanColor", Value: "w"}, {Key: "handicap", Value: nil},
		{Key: "initialFen", Value: nil}, {Key: "lastMove", Value: nil}, {Key: "createOperation", Value: nil},
		{Key: "futureField", Value: bson.D{{Key: "kept", Value: true}}},
		{Key: "updatedAt", Value: bson.NewDateTimeFromTime(created)},
	}); err != nil {
		t.Fatal(err)
	}
	cpu := &lockedCPU{}
	h, err := NewWrites(WriteConfig{
		Config: Config{Accounts: fakeAccounts{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }, RatePerMinute: 1000},
		Store:  gamestore.New(db, 5*time.Second),
		CPU:    cpu,
	})
	if err != nil {
		t.Fatal(err)
	}
	post := func(path, payload, key string) int {
		r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(payload))
		r.Header.Set("Authorization", "Bearer "+token(t, "alice", 0))
		if key != "" {
			r.Header.Set("Idempotency-Key", key)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}

	// Concurrent retries of one move: one CAS wins, the others replay.
	var wg sync.WaitGroup
	codes := make([]int, 6)
	for i := range codes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes[i] = post("/api/games/py-game/move", `{"from":"e2","to":"e4"}`, "it-move-key-01")
		}(i)
	}
	wg.Wait()
	for _, code := range codes {
		if code != http.StatusOK {
			t.Fatalf("codes=%v", codes)
		}
	}
	var doc bson.M
	if err := col.FindOne(context.Background(), bson.D{{Key: "_id", Value: "py-game"}}).Decode(&doc); err != nil {
		t.Fatal(err)
	}
	moves := doc["moves"].(bson.A)
	if len(moves) != 2 || moves[0] != "e4" || moves[1] != "e5" {
		t.Fatalf("moves=%v", moves)
	}
	if doc["difficulty"] != int32(64) || doc["futureField"] == nil {
		t.Fatalf("doc lost Python fields: %v", doc)
	}
	if _, ok := doc["updatedAt"].(bson.DateTime); !ok {
		t.Fatalf("updatedAt=%T", doc["updatedAt"])
	}
	last := plain(doc["lastMove"]).(map[string]any)
	if last["by"] != "cpu" || last["from"] != "e7" || last["piece"] != "p" || last["promotion"] != nil {
		t.Fatalf("lastMove=%v", last)
	}
	ledger := plain(doc["operationLedger"]).([]any)
	if len(ledger) != 1 {
		t.Fatalf("ledger=%v", ledger)
	}

	if code := post("/api/games/py-game/undo", ``, ""); code != http.StatusOK {
		t.Fatalf("undo=%d", code)
	}
	doc = bson.M{}
	if err := col.FindOne(context.Background(), bson.D{{Key: "_id", Value: "py-game"}}).Decode(&doc); err != nil {
		t.Fatal(err)
	}
	if len(doc["moves"].(bson.A)) != 0 || doc["lastMove"] != nil {
		t.Fatalf("after undo=%v", doc)
	}
}

func TestCreateRetriesShareOneGameAgainstMongo(t *testing.T) {
	db := integrationDB(t)
	h, err := NewWrites(WriteConfig{
		Config: Config{Accounts: fakeAccounts{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }, RatePerMinute: 1000},
		Store:  gamestore.New(db, 15*time.Second),
		CPU:    &lockedCPU{},
	})
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	codes := make([]int, 6)
	responses := make([]string, len(codes))
	for i := range codes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			r := httptest.NewRequest(http.MethodPost, "/api/games", strings.NewReader(`{"difficulty": 40, "color": "w"}`))
			r.Header.Set("Authorization", "Bearer "+token(t, "alice", 0))
			r.Header.Set("Idempotency-Key", "it-create-key-1")
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			codes[i] = w.Code
			responses[i] = w.Body.String()
		}(i)
	}
	wg.Wait()
	for _, code := range codes {
		if code != http.StatusCreated {
			t.Fatalf("codes=%v responses=%v", codes, responses)
		}
	}
	count, err := db.Collection(gamestore.Collection).CountDocuments(context.Background(), bson.D{})
	if err != nil || count != 1 {
		t.Fatalf("games=%d err=%v", count, err)
	}
	var doc bson.M
	if err := db.Collection(gamestore.Collection).FindOne(context.Background(), bson.D{}).Decode(&doc); err != nil {
		t.Fatal(err)
	}
	if doc["difficulty"] != int32(40) || doc["owner"] != "alice" || doc["handicap"] != nil || doc["initialFen"] != nil {
		t.Fatalf("doc=%v", doc)
	}
}

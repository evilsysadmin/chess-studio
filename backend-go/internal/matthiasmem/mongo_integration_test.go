package matthiasmem

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// Against a disposable MongoDB (PVP_MONGO_TEST_URL, required in Quality's Go
// lane): the writes corpus replayed through the real Store, so $inc, $push
// with $slice and the upserts are Mongo's own, must leave Python's documents.
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
	db := client.Database("matthiasmem_it_" + hex.EncodeToString(suffix))
	t.Cleanup(func() {
		_ = db.Drop(context.Background())
		_ = client.Disconnect(context.Background())
	})
	return db
}

func TestStoreReplaysTheWritesCorpusInMongo(t *testing.T) {
	db := integrationDB(t)
	store := New(db, 5*time.Second)
	ctx := context.Background()
	data, err := os.ReadFile("testdata/python_matthias_writes_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Players []struct {
			Seed json.RawMessage `json:"seed"`
			Ops  []writeOp       `json:"ops"`
		} `json:"players"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	same := func(where string, want, got any) {
		t.Helper()
		if !pydoc.Equal(want, got) {
			t.Fatalf("%s:\n got %s\nwant %s", where, encode(t, got), encode(t, want))
		}
	}
	for pi, player := range corpus.Players {
		user := fmt.Sprintf("player-%d", pi)
		withID := func(v any) any {
			if d, ok := v.(bson.D); ok {
				return pydoc.Set(pydoc.Copy(d), "_id", user)
			}
			return v
		}
		if seed, ok := decodeAny(t, player.Seed).(bson.D); ok {
			if _, err := db.Collection("matthias_memory").InsertOne(ctx, withID(seed)); err != nil {
				t.Fatal(err)
			}
		}
		for oi, op := range player.Ops {
			where := fmt.Sprintf("player %d op %d (%s)", pi, oi, op.Op)
			now, _ := time.Parse(time.RFC3339Nano, op.Now)
			facts, _ := decodeAny(t, op.Facts).(bson.D)
			switch op.Op {
			case "audience", "portrait":
				if err := store.ObserveFacts(ctx, user, facts, now); err != nil {
					t.Fatalf("%s observe: %v", where, err)
				}
				result, err := store.ObserveEpisodes(ctx, user, facts, now)
				if err != nil {
					t.Fatalf("%s episodes: %v", where, err)
				}
				same(where+" episodes", decodeAny(t, op.Episodes.Result), result)
				fallthrough
			case "narrative_context":
				merged, err := store.Context(ctx, user, facts, now)
				if err != nil {
					t.Fatalf("%s context: %v", where, err)
				}
				episodic, _ := pydoc.Get(merged, "episodic")
				same(where+" context", decodeAny(t, op.Context.Result), pydoc.Delete(pydoc.Copy(merged), "episodic"))
				same(where+" episodic context", decodeAny(t, op.EpisodicContext.Result), episodic)
			case "record":
				recorded, err := store.RecordConsultation(ctx, user, decodeAny(t, op.Kind), decodeAny(t, op.Text), facts, decodeAny(t, op.ConsultationID), now)
				if err != nil {
					t.Fatalf("%s record: %v", where, err)
				}
				same(where+" record", decodeAny(t, op.Recorded.Result), recorded)
			case "replay":
				replay, err := store.Replay(ctx, user, decodeAny(t, op.ConsultationID))
				if err != nil {
					t.Fatalf("%s replay: %v", where, err)
				}
				var got any
				if replay != nil {
					got = replay
				}
				same(where+" replay", decodeAny(t, op.Replay.Result), got)
			case "position":
				recorded, err := store.RecordEmblematicPosition(ctx, user, facts, now)
				if err != nil {
					t.Fatalf("%s position: %v", where, err)
				}
				same(where+" position", decodeAny(t, op.Recorded.Result), recorded)
			}
			if len(op.Doc) > 0 {
				doc, err := store.Memory(ctx, user)
				if err != nil {
					t.Fatal(err)
				}
				var got any
				if doc != nil {
					got = doc
				}
				same(where+" doc", withID(decodeAny(t, op.Doc)), got)
			}
		}
	}
}

func TestDailyReservationInMongo(t *testing.T) {
	db := integrationDB(t)
	store := New(db, 5*time.Second)
	ctx := context.Background()
	now := time.Date(2026, 10, 5, 21, 30, 0, 0, time.UTC) // 23:30 in Madrid
	first, err := store.Reserve(ctx, "alice", now)
	if err != nil || !first.Claimed || len(first.Reservation) != 24 {
		t.Fatalf("first reserve: %+v %v", first, err)
	}
	second, err := store.Reserve(ctx, "alice", now)
	if err != nil || second.Claimed || encode(t, second.Status) != `{"day":"2026-10-05","used":false,"pending":true,"questionKind":null,"text":null}` {
		t.Fatalf("a second tab must not claim: %+v %v", second, err)
	}
	store.Release(ctx, "alice", "someone-else", now)
	if _, err := store.Commit(ctx, "alice", "someone-else", "tactics", "x", now); err != ErrReservationLost {
		t.Fatalf("foreign commit: %v", err)
	}
	committed, err := store.Commit(ctx, "alice", first.Reservation, "tactics", strings.Repeat("é", 950), now)
	if err != nil || len([]rune(get(committed, "text").(string))) != 900 {
		t.Fatalf("commit: %v", err)
	}
	row, _ := store.Daily(ctx, "alice")
	if status := DailyStatus(row, MadridDay(now)); get(status, "used") != true || get(status, "questionKind") != "tactics" {
		t.Fatalf("status after commit: %s", encode(t, status))
	}
	if again, _ := store.Reserve(ctx, "alice", now); again.Claimed {
		t.Fatal("a used day must not be reserved again")
	}
	tomorrow := now.Add(time.Hour) // 00:30 in Madrid: a new day
	next, err := store.Reserve(ctx, "alice", tomorrow)
	if err != nil || !next.Claimed {
		t.Fatalf("next day: %+v %v", next, err)
	}
	store.Release(ctx, "alice", next.Reservation, tomorrow)
	if row, _ := store.Daily(ctx, "alice"); row != nil {
		t.Fatalf("release must delete our pending reservation: %s", encode(t, row))
	}
}

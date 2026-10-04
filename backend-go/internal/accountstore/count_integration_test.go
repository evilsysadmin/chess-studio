package accountstore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Against a disposable MongoDB (PVP_MONGO_TEST_URL): users written the way
// users_store writes them (last_activity as Python ISO strings, with and
// without microseconds) are counted exactly as count_online_users counts.
func TestCountOnlineMatchesPythonsQuery(t *testing.T) {
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
	db := client.Database("accountstore_it_" + hex.EncodeToString(suffix))
	t.Cleanup(func() {
		_ = db.Drop(context.Background())
		_ = client.Disconnect(context.Background())
	})
	ctx := context.Background()
	users := []any{
		bson.D{{Key: "_id", Value: "fresh"}, {Key: "last_activity", Value: "2026-10-04T12:00:00.250000+00:00"}},
		bson.D{{Key: "_id", Value: "exact"}, {Key: "last_activity", Value: "2026-10-04T11:57:30+00:00"}},
		bson.D{{Key: "_id", Value: "stale"}, {Key: "last_activity", Value: "2026-10-04T11:57:29.999999+00:00"}},
		bson.D{{Key: "_id", Value: "offline"}, {Key: "last_activity", Value: "2026-10-04T12:00:00+00:00"}, {Key: "presence_online", Value: false}},
		bson.D{{Key: "_id", Value: "admin"}, {Key: "last_activity", Value: "2026-10-04T12:00:00+00:00"}, {Key: "presence_online", Value: true}},
		bson.D{{Key: "_id", Value: "never"}},
	}
	if _, err := db.Collection("users").InsertMany(ctx, users); err != nil {
		t.Fatal(err)
	}
	store := New(db, time.Second)
	since := "2026-10-04T11:57:30+00:00"
	if got, err := store.CountOnline(ctx, since, nil); err != nil || got != 3 {
		t.Fatalf("count %d err %v", got, err)
	}
	if got, err := store.CountOnline(ctx, since, []string{"admin"}); err != nil || got != 2 {
		t.Fatalf("without admin %d err %v", got, err)
	}
}

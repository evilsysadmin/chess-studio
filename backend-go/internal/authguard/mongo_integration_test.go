package authguard

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

// Against a disposable MongoDB (PVP_MONGO_TEST_URL): Go continues a guard
// document pymongo wrote (aware datetimes stored as BSON dates, int32
// counters, the TTL index Python already declared).
func TestMongoGuardContinuesPythonDocuments(t *testing.T) {
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
	db := client.Database("authguard_it_" + hex.EncodeToString(suffix))
	t.Cleanup(func() {
		_ = db.Drop(context.Background())
		_ = client.Disconnect(context.Background())
	})
	ctx := context.Background()
	col := db.Collection(LoginIdentity.Collection)
	if _, err := col.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "updated_at", Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(86400).SetName(LoginIdentity.IndexName),
	}); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Millisecond)
	if _, err := col.InsertOne(ctx, bson.D{
		{Key: "_id", Value: "id1"}, {Key: "_guard_version", Value: int32(4)},
		{Key: "window_started_at", Value: now.Add(-time.Minute)}, {Key: "failures", Value: int32(19)},
		{Key: "blocked_until", Value: nil}, {Key: "updated_at", Value: now.Add(-time.Minute)},
	}); err != nil {
		t.Fatal(err)
	}
	g := New(LoginIdentity, NewMongo(db, LoginIdentity, 2*time.Second))
	g.logf = func(string) {}
	retry, err := g.RecordFailure(ctx, "id1")
	if err != nil || retry < 299 || retry > 300 {
		t.Fatalf("20th failure: retry %d %v", retry, err)
	}
	var doc struct {
		Version  int32     `bson:"_guard_version"`
		Failures int32     `bson:"failures"`
		Blocked  time.Time `bson:"blocked_until"`
	}
	if err := col.FindOne(ctx, bson.D{{Key: "_id", Value: "id1"}}).Decode(&doc); err != nil {
		t.Fatal(err)
	}
	if doc.Version != 5 || doc.Failures != 20 || doc.Blocked.IsZero() {
		t.Fatalf("doc %+v", doc)
	}
	if retry, err := g.RetryAfter(ctx, "id1"); err != nil || retry < 299 {
		t.Fatalf("retry after %d %v", retry, err)
	}
	if err := g.Clear(ctx, "id1"); err != nil {
		t.Fatal(err)
	}
	if retry, _ := g.RecordFailure(ctx, "id2"); retry != 0 {
		t.Fatalf("first failure of a new identity: %d", retry)
	}
}

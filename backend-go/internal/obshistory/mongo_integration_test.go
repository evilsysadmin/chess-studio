package obshistory

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Against a disposable MongoDB (PVP_MONGO_TEST_URL): a bucket Python already
// wrote (int32 _id and counters, as pymongo encodes them) receives Go's
// deltas in place, with $max keeping the larger maximum.
func TestMongoStoreMergesIntoPythonBuckets(t *testing.T) {
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
	db := client.Database("obshistory_it_" + hex.EncodeToString(suffix))
	t.Cleanup(func() {
		_ = db.Drop(context.Background())
		_ = client.Disconnect(context.Background())
	})
	ctx := context.Background()
	bucket := int64(1_790_000_100 - 1_790_000_100%BucketSeconds)
	if _, err := db.Collection(CollectionName).InsertOne(ctx, bson.D{
		{Key: "_id", Value: int32(bucket)},
		{Key: "bucket_start", Value: time.Unix(bucket, 0).UTC()},
		{Key: "schema", Value: int32(1)},
		{Key: "presence", Value: bson.D{{Key: "samples", Value: int32(2)}, {Key: "online_sum", Value: int32(5)}, {Key: "online_max", Value: 4.0}}},
	}); err != nil {
		t.Fatal(err)
	}
	store, err := NewMongoStore(db)
	if err != nil {
		t.Fatal(err)
	}
	r := New(store)
	at := time.Unix(bucket+10, 0)
	r.now = func() time.Time { return at }
	r.RecordPresence(3)
	r.RecordPresence(7)
	r.RecordHTTP("GET", "/api/status", 200, 12, "")
	if err := r.Flush(ctx); err != nil {
		t.Fatal(err)
	}
	var doc struct {
		ID       int64 `bson:"_id"`
		Presence struct {
			Samples   int64   `bson:"samples"`
			OnlineSum int64   `bson:"online_sum"`
			OnlineMax float64 `bson:"online_max"`
		} `bson:"presence"`
		HTTP struct {
			Samples int64 `bson:"samples"`
		} `bson:"http"`
	}
	count, _ := db.Collection(CollectionName).CountDocuments(ctx, bson.D{})
	if count != 1 {
		t.Fatalf("Go created a second bucket document: %d", count)
	}
	if err := db.Collection(CollectionName).FindOne(ctx, bson.D{}).Decode(&doc); err != nil {
		t.Fatal(err)
	}
	if doc.ID != bucket || doc.Presence.Samples != 4 || doc.Presence.OnlineSum != 15 || doc.Presence.OnlineMax != 7 || doc.HTTP.Samples != 1 {
		t.Fatalf("merged bucket %+v", doc)
	}
}

// The read corpus against real collections: what pymongo and the Go driver
// hand back (int32/int64/double, field order, natural order) must merge and
// summarize the same.
func TestHistoryMatchesPythonCorpusInMongo(t *testing.T) {
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
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	ctx := context.Background()
	now, scenarios := loadHistoryCorpus(t)
	replayed := 0
	for i, s := range scenarios {
		legacy, current := decodeBuckets(t, s.Legacy), decodeBuckets(t, s.Current)
		if !s.Database || hasCursorMarker(current) {
			continue
		}
		suffix := make([]byte, 4)
		_, _ = rand.Read(suffix)
		db := client.Database("obshistory_read_" + hex.EncodeToString(suffix))
		for name, docs := range map[string][]bson.D{LegacyCollectionName: legacy, CollectionName: current} {
			for _, doc := range docs {
				if _, err := db.Collection(name).InsertOne(ctx, doc); err != nil {
					t.Fatalf("scenario %d: %v", i, err)
				}
			}
		}
		for j, c := range s.Cases {
			got, err := History(ctx, NewMongoReader(db), nil, c.From, c.To, now)
			checkHistoryCase(t, fmt.Sprintf("mongo scenario %d case %d", i, j), c, got, err)
		}
		_ = db.Drop(ctx)
		replayed++
	}
	if replayed < 50 {
		t.Fatalf("only %d scenarios replayed", replayed)
	}
}

func hasCursorMarker(docs []bson.D) bool {
	for _, doc := range docs {
		if raises, _ := pydoc.Get(doc, cursorRaises); raises == true {
			return true
		}
	}
	return false
}

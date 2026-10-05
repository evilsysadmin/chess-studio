package profilestore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// Against a disposable MongoDB (PVP_MONGO_TEST_URL): concurrent PATCHes of
// different keys on a profile pymongo wrote never lose an update (each one
// either lands or ends unavailable, as in Python), and types survive.
func TestMongoProfileConcurrentPatches(t *testing.T) {
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
	db := client.Database("profilestore_it_" + hex.EncodeToString(suffix))
	t.Cleanup(func() {
		_ = db.Drop(context.Background())
		_ = client.Disconnect(context.Background())
	})
	ctx := context.Background()
	if _, err := db.Collection(CollectionName).InsertOne(ctx, bson.D{
		{Key: "_id", Value: "alice"},
		{Key: "data", Value: bson.D{{Key: "rating", Value: int32(1000)}}},
		{Key: metaKey, Value: bson.D{{Key: "key_revisions", Value: bson.D{{Key: "rating", Value: int32(3)}}}, {Key: "write_revision", Value: int32(7)}}},
	}); err != nil {
		t.Fatal(err)
	}
	store := New(NewMongo(db, 2*time.Second))
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := fmt.Sprintf("k%d", i)
			_, conflict, err := store.Patch(ctx, "alice", bson.D{{Key: key, Value: int32(i)}}, bson.D{})
			if err == nil && conflict != nil {
				err = fmt.Errorf("%s conflicted: %v", key, conflict.Conflicts)
			}
			errs <- err
		}(i)
	}
	wg.Wait()
	close(errs)
	failures := 0
	for err := range errs {
		if err != nil {
			failures++ // five CAS attempts can lose under contention: Python's 503
		}
	}
	profile, found, err := store.Get(ctx, "alice")
	if err != nil || !found {
		t.Fatal(err)
	}
	data, _ := pydoc.Get(profile, "data")
	if got := len(data.(bson.D)); got != 1+8-failures {
		t.Fatalf("data keys %d with %d failures: %v", got, failures, data)
	}
	rating, _ := pydoc.Get(data.(bson.D), "rating")
	if _, ok := rating.(int32); !ok {
		t.Fatalf("rating type %T", rating)
	}
	if failures == 8 {
		t.Fatal("no PATCH landed")
	}
	// A brand-new profile is created with insert, never an upsert.
	if _, conflict, err := store.Patch(ctx, "bob", bson.D{{Key: "x", Value: true}}, bson.D{}); err != nil || conflict != nil {
		t.Fatal(err, conflict)
	}
	saved, err := store.Save(ctx, "bob", bson.D{{Key: "data", Value: bson.D{{Key: "x", Value: int32(1)}}}})
	if err != nil {
		t.Fatal(err)
	}
	revs, _ := pydoc.Get(saved, "revisions")
	if x, _ := pydoc.Get(revs.(bson.D), "x"); x != int32(1) {
		t.Fatalf("True -> 1 is not a change in Python: %v", revs)
	}
}

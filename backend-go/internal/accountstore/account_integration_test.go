package accountstore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// Against a disposable MongoDB (PVP_MONGO_TEST_URL): account writes keep
// users_store's document shape and its unique partial email index.
func TestAccountLifecycleOnMongo(t *testing.T) {
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
	db := client.Database("accounts_it_" + hex.EncodeToString(suffix))
	t.Cleanup(func() {
		_ = db.Drop(context.Background())
		_ = client.Disconnect(context.Background())
	})
	ctx := context.Background()
	// Python declared the index first.
	if _, err := db.Collection("users").Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("uniq_recovery_email").
			SetPartialFilterExpression(bson.D{{Key: "email", Value: bson.D{{Key: "$type", Value: "string"}}}}),
	}); err != nil {
		t.Fatal(err)
	}
	// A legacy account without email does not collide with another one.
	if _, err := db.Collection("users").InsertOne(ctx, bson.D{{Key: "_id", Value: "legacy"}, {Key: "password_hash", Value: "x"}}); err != nil {
		t.Fatal(err)
	}
	s := New(db, 2*time.Second)
	if err := s.Create(ctx, "alice", "h1", "alice@x.io", "2026-10-05T12:00:00+00:00"); err != nil {
		t.Fatal(err)
	}
	if err := s.Create(ctx, "noemail", "h", "", "2026-10-05T12:00:00+00:00"); err != nil {
		t.Fatal(err)
	}
	if err := s.Create(ctx, "alice", "h2", "", "t"); !errors.Is(err, ErrUserExists) {
		t.Fatalf("duplicate username: %v", err)
	}
	if err := s.Create(ctx, "bob", "h2", "alice@x.io", "t"); !errors.Is(err, ErrEmailExists) {
		t.Fatalf("duplicate email: %v", err)
	}
	var doc bson.D
	_ = db.Collection("users").FindOne(ctx, bson.M{"_id": "alice"}).Decode(&doc)
	keys := []string{}
	for _, e := range doc {
		keys = append(keys, e.Key)
	}
	if strings.Join(keys, ",") != "_id,password_hash,session_version,created_at,last_activity,email" {
		t.Fatalf("document shape %v", keys)
	}
	version, found, err := s.UpdatePassword(ctx, "alice", "h3")
	if err != nil || !found || version != 1 {
		t.Fatalf("password: %d %v %v", version, found, err)
	}
	if exists, v, _ := s.AuthState(ctx, "alice"); !exists || v != 1 {
		t.Fatalf("auth state %v %d", exists, v)
	}
	if _, found, _ := s.UpdatePassword(ctx, "ghost", "h"); found {
		t.Fatal("ghost password updated")
	}
	if err := s.UpdateEmail(ctx, "noemail", "alice@x.io"); !errors.Is(err, ErrEmailExists) {
		t.Fatalf("email taken: %v", err)
	}
	if err := s.UpdateEmail(ctx, "noemail", "n@x.io"); err != nil {
		t.Fatal(err)
	}
	if owner, found, _ := s.EmailOwner(ctx, "n@x.io"); !found || owner != "noemail" {
		t.Fatalf("owner %s %v", owner, found)
	}
	if deleted, err := s.Delete(ctx, "alice"); err != nil || !deleted {
		t.Fatal(err)
	}
	if deleted, _ := s.Delete(ctx, "alice"); deleted {
		t.Fatal("deleted twice")
	}
}

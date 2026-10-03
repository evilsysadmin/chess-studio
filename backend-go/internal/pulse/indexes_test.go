package pulse

import (
	"context"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// The index set is a shared contract with the Python authority until it is
// retired: both must declare exactly the same names.
func TestIndexNamesMatchPythonAuthority(t *testing.T) {
	source, err := os.ReadFile("../../../backend-python/pvp_store.py")
	if err != nil {
		t.Fatal(err)
	}
	body := string(source)
	start := strings.Index(body, "async def _ensure_indexes(")
	if start < 0 {
		t.Fatal("_ensure_indexes not found in pvp_store.py")
	}
	end := strings.Index(body[start+1:], "\nasync def ")
	if end > 0 {
		body = body[start : start+1+end]
	} else {
		body = body[start:]
	}
	var python []string
	for _, match := range regexp.MustCompile(`name="([a-z0-9_]+)"`).FindAllStringSubmatch(body, -1) {
		python = append(python, match[1])
	}
	var golang []string
	for _, spec := range pvpIndexes() {
		golang = append(golang, indexName(spec.model))
	}
	sort.Strings(python)
	sort.Strings(golang)
	if strings.Join(python, ",") != strings.Join(golang, ",") {
		t.Fatalf("index drift:\n python=%v\n     go=%v", python, golang)
	}
}

// pythonIndexes creates the indexes the way pymongo sends them in
// pvp_store.py. Go must then be able to declare its own set as a no-op.
func pythonIndexes(t *testing.T, store *MongoStore) {
	t.Helper()
	ctx := context.Background()
	create := func(collection string, keys bson.D, opts *options.IndexOptionsBuilder) {
		if _, err := store.db.Collection(collection).Indexes().CreateOne(ctx, mongo.IndexModel{Keys: keys, Options: opts}); err != nil {
			t.Fatalf("python-shaped index on %s: %v", collection, err)
		}
	}
	create("pvp_roster", bson.D{{Key: "last_seen", Value: 1}},
		options.Index().SetName("pvp_roster_last_seen_ttl").SetExpireAfterSeconds(45))
	create("pvp_challenges", bson.D{{Key: "pair_key", Value: 1}},
		options.Index().SetName("pvp_pending_pair_unique").SetUnique(true).
			SetPartialFilterExpression(bson.M{"status": "pending", "pair_key": bson.M{"$type": "string"}}))
	create("pvp_challenges", bson.D{{Key: "challenger", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: -1}},
		options.Index().SetName("pvp_challenger_status_created"))
	create("pvp_challenges", bson.D{{Key: "opponent", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: -1}},
		options.Index().SetName("pvp_opponent_status_created"))
	create("pvp_challenges", bson.D{{Key: "pair_key", Value: 1}, {Key: "cooldown_until", Value: -1}},
		options.Index().SetName("pvp_pair_cooldown"))
	create("pvp_matches", bson.D{{Key: "white", Value: 1}, {Key: "status", Value: 1}, {Key: "updated_at", Value: -1}},
		options.Index().SetName("pvp_white_status_updated"))
	create("pvp_matches", bson.D{{Key: "black", Value: 1}, {Key: "status", Value: 1}, {Key: "updated_at", Value: -1}},
		options.Index().SetName("pvp_black_status_updated"))
}

func TestMongoEnsureIndexesCoexistsWithPython(t *testing.T) {
	store := integrationStore(t)
	pythonIndexes(t, store)
	if err := store.EnsureIndexes(context.Background()); err != nil {
		t.Fatalf("Go index declaration conflicts with Python's: %v", err)
	}
	if err := store.EnsureIndexes(context.Background()); err != nil {
		t.Fatalf("second declaration: %v", err)
	}
}

func TestMongoEnsureIndexesAloneEnforcesOnePendingPerPair(t *testing.T) {
	ctx := context.Background()
	store := integrationStore(t)
	if err := store.db.Collection("pvp_challenges").Drop(ctx); err != nil {
		t.Fatal(err)
	}
	if err := store.EnsureIndexes(ctx); err != nil {
		t.Fatal(err)
	}
	challenges := store.db.Collection("pvp_challenges")
	pair := challengePairKey("alice", "bob")
	if _, err := challenges.InsertOne(ctx, bson.M{"_id": "c-1", "status": "pending", "pair_key": pair}); err != nil {
		t.Fatal(err)
	}
	if _, err := challenges.InsertOne(ctx, bson.M{"_id": "c-2", "status": "pending", "pair_key": pair}); !mongo.IsDuplicateKeyError(err) {
		t.Fatalf("second pending challenge for the pair: err=%v", err)
	}
	// Resolved challenges keep their pair key and must not collide.
	if _, err := challenges.InsertOne(ctx, bson.M{"_id": "c-3", "status": "declined", "pair_key": pair}); err != nil {
		t.Fatal(err)
	}
}

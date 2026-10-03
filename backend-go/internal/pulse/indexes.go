package pulse

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// pvpIndexSpec is one index the PvP collections rely on for correctness or
// for their hot queries.
type pvpIndexSpec struct {
	collection string
	model      mongo.IndexModel
}

// pvpIndexes mirrors backend-python/pvp_store.py _ensure_indexes exactly:
// same names, keys and options. MongoDB treats re-creating an identical index
// as a no-op, so both runtimes can declare them while they coexist; any drift
// in options fails with IndexOptionsConflict instead of silently diverging.
// The pending-pair unique index is what keeps one pending challenge per pair.
func pvpIndexes() []pvpIndexSpec {
	return []pvpIndexSpec{
		{"pvp_roster", mongo.IndexModel{
			Keys:    bson.D{{Key: "last_seen", Value: 1}},
			Options: options.Index().SetName("pvp_roster_last_seen_ttl").SetExpireAfterSeconds(int32(rosterTTL.Seconds())),
		}},
		{"pvp_challenges", mongo.IndexModel{
			Keys: bson.D{{Key: "pair_key", Value: 1}},
			Options: options.Index().
				SetName("pvp_pending_pair_unique").
				SetUnique(true).
				SetPartialFilterExpression(bson.D{
					{Key: "status", Value: "pending"},
					{Key: "pair_key", Value: bson.D{{Key: "$type", Value: "string"}}},
				}),
		}},
		{"pvp_challenges", mongo.IndexModel{
			Keys:    bson.D{{Key: "challenger", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("pvp_challenger_status_created"),
		}},
		{"pvp_challenges", mongo.IndexModel{
			Keys:    bson.D{{Key: "opponent", Value: 1}, {Key: "status", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("pvp_opponent_status_created"),
		}},
		{"pvp_challenges", mongo.IndexModel{
			Keys:    bson.D{{Key: "pair_key", Value: 1}, {Key: "cooldown_until", Value: -1}},
			Options: options.Index().SetName("pvp_pair_cooldown"),
		}},
		{"pvp_matches", mongo.IndexModel{
			Keys:    bson.D{{Key: "white", Value: 1}, {Key: "status", Value: 1}, {Key: "updated_at", Value: -1}},
			Options: options.Index().SetName("pvp_white_status_updated"),
		}},
		{"pvp_matches", mongo.IndexModel{
			Keys:    bson.D{{Key: "black", Value: 1}, {Key: "status", Value: 1}, {Key: "updated_at", Value: -1}},
			Options: options.Index().SetName("pvp_black_status_updated"),
		}},
	}
}

// EnsureIndexes declares the PvP indexes so Go does not depend on the Python
// backend having started first.
func (s *MongoStore) EnsureIndexes(ctx context.Context) error {
	for _, spec := range pvpIndexes() {
		queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
		_, err := s.db.Collection(spec.collection).Indexes().CreateOne(queryCtx, spec.model)
		cancel()
		if err != nil {
			return fmt.Errorf("ensure index %s.%s: %w", spec.collection, indexName(spec.model), err)
		}
	}
	return nil
}

func indexName(model mongo.IndexModel) string {
	var opts options.IndexOptions
	for _, apply := range model.Options.List() {
		_ = apply(&opts)
	}
	if opts.Name == nil {
		return ""
	}
	return *opts.Name
}

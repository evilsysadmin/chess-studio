// Package accountstore owns the shared users authentication-state read used
// by native Go domains while the users/auth domain is migrated.
package accountstore

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const defaultQueryTimeout = 2 * time.Second

type Store struct {
	users   *mongo.Collection
	timeout time.Duration
}

func New(db *mongo.Database, timeout time.Duration) *Store {
	if db == nil {
		return nil
	}
	if timeout <= 0 {
		timeout = defaultQueryTimeout
	}
	return &Store{users: db.Collection("users"), timeout: timeout}
}

// AuthState mirrors users_store.get_auth_state: existence plus session_version,
// where a missing/null version remains legacy version zero.
func (s *Store) AuthState(ctx context.Context, username string) (bool, int64, error) {
	if s == nil || s.users == nil {
		return false, 0, errors.New("account store is not configured")
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var row bson.M
	err := s.users.FindOne(
		queryCtx,
		bson.M{"_id": username},
		options.FindOne().SetProjection(bson.M{"_id": 1, "session_version": 1}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, 0, nil
	}
	if err != nil {
		return false, 0, err
	}
	version, ok := bsonInteger(row["session_version"])
	if !ok {
		version = 0
	}
	return true, version, nil
}

func bsonInteger(value any) (int64, bool) {
	switch v := value.(type) {
	case nil:
		return 0, true
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case int:
		return int64(v), true
	default:
		return 0, false
	}
}

// CountOnline mirrors users_store.count_online_users against Mongo: accounts
// whose last activity (Python ISO-8601 strings, compared as stored) is at or
// after since and that did not mark themselves offline, minus the excluded
// usernames.
func (s *Store) CountOnline(ctx context.Context, since string, exclude []string) (int, error) {
	if s == nil || s.users == nil {
		return 0, errors.New("account store is not configured")
	}
	query := bson.D{
		{Key: "last_activity", Value: bson.D{{Key: "$gte", Value: since}}},
		{Key: "presence_online", Value: bson.D{{Key: "$ne", Value: false}}},
	}
	if len(exclude) > 0 {
		query = append(query, bson.E{Key: "_id", Value: bson.D{{Key: "$nin", Value: exclude}}})
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	count, err := s.users.CountDocuments(queryCtx, query)
	return int(count), err
}

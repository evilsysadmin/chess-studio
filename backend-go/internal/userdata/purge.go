// Package userdata mirrors backend-python/user_data_lifecycle.py: every
// non-account document a username owns, deleted in one place so a reused
// username never inherits a previous account's state. The account document
// itself is left to the caller, which removes it last.
package userdata

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// ErrUnavailable is PersistentStorageUnavailable.
var ErrUnavailable = errors.New("user data storage unavailable")

// Purged mirrors purge_user_data's counts.
type Purged struct {
	Games          int64
	ChroniclesRuns int64
	Feedback       int64
}

// Deleter runs one deletion and reports how many documents went.
type Deleter interface {
	DeleteMany(ctx context.Context, collection string, filter bson.D) (int64, error)
	DeleteOne(ctx context.Context, collection string, filter bson.D) error
}

// Purge mirrors purge_user_data, in Python's order, stopping at the first
// storage error (the account stays, so the user can retry).
func Purge(ctx context.Context, store Deleter, username string) (Purged, error) {
	var purged Purged
	var err error
	is := func(key string) bson.D { return bson.D{{Key: key, Value: username}} }
	either := func(a, b string) bson.D {
		return bson.D{{Key: "$or", Value: bson.A{is(a), is(b)}}}
	}
	steps := []func() error{
		func() error { purged.Games, err = store.DeleteMany(ctx, "games", is("owner")); return err },
		func() error { return store.DeleteOne(ctx, "profile", is("_id")) },
		// pvp_store.delete_user_data
		func() error { return store.DeleteOne(ctx, "pvp_roster", is("_id")) },
		func() error {
			_, err := store.DeleteMany(ctx, "pvp_challenges", either("challenger", "opponent"))
			return err
		},
		func() error { _, err := store.DeleteMany(ctx, "pvp_matches", either("white", "black")); return err },
		func() error { _, err := store.DeleteMany(ctx, "pvp_lobby_chat", is("username")); return err },
		func() error {
			purged.ChroniclesRuns, err = store.DeleteMany(ctx, "chronicles_runs", is("owner"))
			return err
		},
		func() error { return store.DeleteOne(ctx, "matthias_daily", is("_id")) },
		func() error { return store.DeleteOne(ctx, "matthias_memory", is("_id")) },
		func() error { purged.Feedback, err = store.DeleteMany(ctx, "feedback", is("username")); return err },
	}
	for _, step := range steps {
		if step() != nil {
			return Purged{}, ErrUnavailable
		}
	}
	return purged, nil
}

// Mongo is the production Deleter.
type Mongo struct {
	db      *mongo.Database
	timeout time.Duration
}

func NewMongo(db *mongo.Database, timeout time.Duration) *Mongo {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &Mongo{db: db, timeout: timeout}
}

func (m *Mongo) DeleteMany(ctx context.Context, collection string, filter bson.D) (int64, error) {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	result, err := m.db.Collection(collection).DeleteMany(ctx, filter)
	if err != nil {
		return 0, err
	}
	return result.DeletedCount, nil
}

func (m *Mongo) DeleteOne(ctx context.Context, collection string, filter bson.D) error {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	_, err := m.db.Collection(collection).DeleteOne(ctx, filter)
	return err
}

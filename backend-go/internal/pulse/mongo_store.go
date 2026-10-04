package pulse

import (
	"context"
	"errors"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/accountstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/mongoruntime"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type MongoConfig struct {
	URL          string
	Database     string
	QueryTimeout time.Duration
}

type MongoStore struct {
	runtime  *mongoruntime.Runtime
	db       *mongo.Database
	timeout  time.Duration
	accounts *accountstore.Store
}

// NewMongoStore remains the compatibility constructor used by isolated PvP
// integration tests. Production wiring owns the shared connection in
// mongoruntime and calls NewMongoStoreFromDatabase instead.
func NewMongoStore(ctx context.Context, cfg MongoConfig) (*MongoStore, error) {
	runtime, err := mongoruntime.New(ctx, mongoruntime.Config{
		URL:             cfg.URL,
		Database:        cfg.Database,
		QueryTimeout:    cfg.QueryTimeout,
		ApplicationName: mongoruntime.DefaultApplicationName,
	})
	if err != nil {
		return nil, err
	}
	store, err := NewMongoStoreFromDatabase(runtime.Database(), runtime.QueryTimeout())
	if err != nil {
		_ = runtime.Close(context.Background())
		return nil, err
	}
	store.runtime = runtime
	return store, nil
}

// NewMongoStoreFromDatabase binds PvP persistence to an already-owned shared
// database. The caller owns pool readiness and shutdown.
func NewMongoStoreFromDatabase(db *mongo.Database, timeout time.Duration) (*MongoStore, error) {
	if db == nil {
		return nil, errors.New("pvp Mongo store needs a database")
	}
	if timeout <= 0 {
		timeout = defaultQueryTimeout
	}
	return &MongoStore{
		db:       db,
		timeout:  timeout,
		accounts: accountstore.New(db, timeout),
	}, nil
}

// Ping is retained for compatibility with isolated PvP integration tests.
// Shared production readiness belongs to mongoruntime.
func (s *MongoStore) Ping(ctx context.Context) error {
	if s == nil || s.runtime == nil {
		return errors.New("pvp Mongo store does not own the shared runtime")
	}
	return s.runtime.Ping(ctx)
}

// Close only closes a runtime created by the compatibility constructor.
// Stores bound through NewMongoStoreFromDatabase never own the shared pool.
func (s *MongoStore) Close(ctx context.Context) error {
	if s == nil || s.runtime == nil {
		return nil
	}
	return s.runtime.Close(ctx)
}

func (s *MongoStore) AuthState(ctx context.Context, username string) (bool, int64, error) {
	if s == nil || s.accounts == nil {
		return false, 0, errors.New("pvp account store is not configured")
	}
	return s.accounts.AuthState(ctx, username)
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

package pulse

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type MongoConfig struct {
	URL          string
	Database     string
	QueryTimeout time.Duration
}

type MongoStore struct {
	client  *mongo.Client
	db      *mongo.Database
	timeout time.Duration
}

func NewMongoStore(ctx context.Context, cfg MongoConfig) (*MongoStore, error) {
	uri := strings.TrimSpace(cfg.URL)
	if uri == "" {
		return nil, errors.New("mongo URL is required")
	}
	database := strings.TrimSpace(cfg.Database)
	if database == "" {
		return nil, errors.New("mongo database is required")
	}
	timeout := cfg.QueryTimeout
	if timeout <= 0 {
		timeout = defaultQueryTimeout
	}
	client, err := mongo.Connect(
		options.Client().
			ApplyURI(uri).
			SetAppName(mongoApplicationName).
			SetMaxPoolSize(8).
			SetMaxConnecting(2).
			SetServerSelectionTimeout(timeout),
	)
	if err != nil {
		return nil, fmt.Errorf("connect MongoDB: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	if err := client.Database("admin").RunCommand(pingCtx, bson.D{{Key: "ping", Value: 1}}).Err(); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("ping MongoDB: %w", err)
	}
	return &MongoStore{client: client, db: client.Database(database), timeout: timeout}, nil
}

// Ping proves the store can still reach MongoDB. Go is the authority for the
// native PvP routes, so readiness must fail when its own database does, not
// only when the paired Python backend does.
func (s *MongoStore) Ping(ctx context.Context) error {
	if s == nil || s.client == nil {
		return errors.New("mongodb store is not configured")
	}
	pingCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	return s.client.Database("admin").RunCommand(pingCtx, bson.D{{Key: "ping", Value: 1}}).Err()
}

func (s *MongoStore) Close(ctx context.Context) error {
	if s == nil || s.client == nil {
		return nil
	}
	return s.client.Disconnect(ctx)
}

func (s *MongoStore) AuthState(ctx context.Context, username string) (bool, int64, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var row bson.M
	err := s.db.Collection("users").FindOne(
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

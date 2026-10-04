// Package mongoruntime owns the process-wide Mongo connection used by native
// Go domains. Domain stores receive a database handle; none of them owns the
// shared pool, readiness probe or shutdown lifecycle.
package mongoruntime

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

const (
	DefaultQueryTimeout = 2 * time.Second
	// DefaultApplicationName preserves the deployed client identity while the
	// old pvp-edge binary becomes the general Go API front.
	DefaultApplicationName = "chess-studio-pvp-go"
)

type Config struct {
	URL             string
	Database        string
	QueryTimeout    time.Duration
	ApplicationName string
	MaxPoolSize     uint64
	MaxConnecting   uint64
}

type Runtime struct {
	client  *mongo.Client
	db      *mongo.Database
	timeout time.Duration
}

func New(ctx context.Context, cfg Config) (*Runtime, error) {
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
		timeout = DefaultQueryTimeout
	}
	appName := strings.TrimSpace(cfg.ApplicationName)
	if appName == "" {
		appName = DefaultApplicationName
	}
	maxPoolSize := cfg.MaxPoolSize
	if maxPoolSize == 0 {
		maxPoolSize = 8
	}
	maxConnecting := cfg.MaxConnecting
	if maxConnecting == 0 {
		maxConnecting = 2
	}
	client, err := mongo.Connect(
		options.Client().
			ApplyURI(uri).
			SetAppName(appName).
			SetMaxPoolSize(maxPoolSize).
			SetMaxConnecting(maxConnecting).
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
	return &Runtime{client: client, db: client.Database(database), timeout: timeout}, nil
}

func (r *Runtime) Database() *mongo.Database {
	if r == nil {
		return nil
	}
	return r.db
}

func (r *Runtime) QueryTimeout() time.Duration {
	if r == nil {
		return DefaultQueryTimeout
	}
	return r.timeout
}

func (r *Runtime) Ping(ctx context.Context) error {
	if r == nil || r.client == nil {
		return errors.New("mongodb runtime is not configured")
	}
	pingCtx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()
	return r.client.Database("admin").RunCommand(pingCtx, bson.D{{Key: "ping", Value: 1}}).Err()
}

func (r *Runtime) Close(ctx context.Context) error {
	if r == nil || r.client == nil {
		return nil
	}
	return r.client.Disconnect(ctx)
}

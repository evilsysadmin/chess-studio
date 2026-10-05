// Package feedbackstore mirrors the user side of
// backend-python/feedback_store.py: feedback documents (with screenshots
// stored inline) in the "feedback" collection.
package feedbackstore

import (
	"context"
	"errors"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// ErrUnavailable is PersistentStorageUnavailable.
var ErrUnavailable = errors.New("feedback storage unavailable")

const CollectionName = "feedback"

type Store struct {
	col     *mongo.Collection
	timeout time.Duration

	once sync.Once
}

func New(db *mongo.Database, timeout time.Duration) *Store {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &Store{col: db.Collection(CollectionName), timeout: timeout}
}

// ensureIndexes mirrors _ensure_indexes: performance only, never an outage.
func (s *Store) ensureIndexes(ctx context.Context) {
	s.once.Do(func() {
		_, _ = s.col.Indexes().CreateMany(ctx, []mongo.IndexModel{
			{Keys: bson.D{{Key: "created_at", Value: -1}}, Options: options.Index().SetName("feedback_created_desc")},
			{Keys: bson.D{{Key: "username", Value: 1}, {Key: "created_at", Value: -1}}, Options: options.Index().SetName("feedback_username_created_desc")},
			{Keys: bson.D{{Key: "status", Value: 1}}, Options: options.Index().SetName("feedback_status")},
		})
	})
}

// Insert stores one feedback document (create_feedback's insert_one).
func (s *Store) Insert(ctx context.Context, doc bson.D) error {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	s.ensureIndexes(ctx)
	if _, err := s.col.InsertOne(ctx, doc); err != nil {
		return ErrUnavailable
	}
	return nil
}

// ListForUser mirrors list_feedback_for_user's query: newest first, without
// the screenshot bytes.
func (s *Store) ListForUser(ctx context.Context, username string, limit int64) ([]bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	s.ensureIndexes(ctx)
	cursor, err := s.col.Find(ctx, bson.D{{Key: "username", Value: username}},
		options.Find().SetProjection(bson.D{{Key: "attachments.data", Value: 0}}).SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(limit))
	if err != nil {
		return nil, ErrUnavailable
	}
	defer cursor.Close(ctx)
	var rows []bson.D
	for cursor.Next(ctx) {
		var row bson.D
		if err := cursor.Decode(&row); err != nil {
			return nil, ErrUnavailable
		}
		rows = append(rows, pydoc.Normalize(row).(bson.D))
	}
	if cursor.Err() != nil {
		return nil, ErrUnavailable
	}
	return rows, nil
}

// DeleteForUser mirrors delete_feedback_for_user: id and owner in one
// operation, so another account's id looks exactly like a missing one.
func (s *Store) DeleteForUser(ctx context.Context, id, username string) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	result, err := s.col.DeleteOne(ctx, bson.D{{Key: "_id", Value: id}, {Key: "username", Value: username}})
	if err != nil {
		return false, ErrUnavailable
	}
	return result.DeletedCount > 0, nil
}

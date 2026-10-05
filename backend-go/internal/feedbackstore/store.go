// Package feedbackstore mirrors backend-python/feedback_store.py: feedback
// documents (with screenshots stored inline) in the "feedback" collection,
// for their authors and for Admin.
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

// List mirrors list_feedback's query: newest first, without screenshot bytes.
func (s *Store) List(ctx context.Context, limit int64) ([]bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	s.ensureIndexes(ctx)
	cursor, err := s.col.Find(ctx, bson.D{},
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

// Summary mirrors feedback_summary: new and not-yet-resolved counts.
func (s *Store) Summary(ctx context.Context) (newCount, pending int64, err error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	s.ensureIndexes(ctx)
	if newCount, err = s.col.CountDocuments(ctx, bson.D{{Key: "status", Value: "new"}}); err != nil {
		return 0, 0, ErrUnavailable
	}
	if pending, err = s.col.CountDocuments(ctx, bson.D{{Key: "status", Value: bson.D{{Key: "$ne", Value: "resolved"}}}}); err != nil {
		return 0, 0, ErrUnavailable
	}
	return newCount, pending, nil
}

// Attachments mirrors get_feedback_attachment's read: the row's attachments
// (with their bytes), nil when the feedback does not exist.
func (s *Store) Attachments(ctx context.Context, id string) (bson.A, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	s.ensureIndexes(ctx)
	var row bson.D
	err := s.col.FindOne(ctx, bson.D{{Key: "_id", Value: id}}, options.FindOne().SetProjection(bson.D{{Key: "attachments", Value: 1}})).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, ErrUnavailable
	}
	attachments, _ := pydoc.Get(pydoc.Normalize(row).(bson.D), "attachments")
	list, _ := attachments.(bson.A)
	return list, nil
}

// Update mirrors find_one_and_update(..., return_document=True): the row
// after $set, nil when it does not exist.
func (s *Store) Update(ctx context.Context, id string, set bson.D) (bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	s.ensureIndexes(ctx)
	var row bson.D
	err := s.col.FindOneAndUpdate(ctx, bson.D{{Key: "_id", Value: id}}, bson.D{{Key: "$set", Value: set}},
		options.FindOneAndUpdate().SetReturnDocument(options.After)).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, ErrUnavailable
	}
	return pydoc.Normalize(row).(bson.D), nil
}

// Delete mirrors delete_feedback.
func (s *Store) Delete(ctx context.Context, id string) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	s.ensureIndexes(ctx)
	result, err := s.col.DeleteOne(ctx, bson.D{{Key: "_id", Value: id}})
	if err != nil {
		return false, ErrUnavailable
	}
	return result.DeletedCount > 0, nil
}

package accountstore

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

// OverviewFields is users_store.USER_OVERVIEW_FIELDS.
var OverviewFields = []string{
	"created_at", "current_activity", "client_release", "last_client_ip", "last_client_country",
	"last_activity", "last_login", "presence_online", "is_foreground", "foreground_updated_at",
}

// Overview mirrors _user_overview: the username plus the overview fields
// the document has, in USER_OVERVIEW_FIELDS order.
func Overview(username string, doc bson.D) bson.D {
	out := bson.D{{Key: "username", Value: username}}
	for _, field := range OverviewFields {
		if v, ok := pydoc.Get(doc, field); ok {
			out = append(out, bson.E{Key: field, Value: v})
		}
	}
	return out
}

// ListOverview mirrors list_user_overview: one query, natural order.
func (s *Store) ListOverview(ctx context.Context) ([]bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	projection := bson.D{{Key: "_id", Value: 1}}
	for _, field := range OverviewFields {
		projection = append(projection, bson.E{Key: field, Value: 1})
	}
	cursor, err := s.users.Find(ctx, bson.D{}, options.Find().SetProjection(projection))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var rows []bson.D
	for cursor.Next(ctx) {
		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		doc = pydoc.Normalize(doc).(bson.D)
		id, _ := pydoc.Get(doc, "_id")
		rows = append(rows, Overview(pyval.Str(id), doc))
	}
	return rows, cursor.Err()
}

// Exists mirrors `await get_user(username)` being truthy.
func (s *Store) Exists(ctx context.Context, username string) (bool, error) {
	found, _, err := s.AuthState(ctx, username)
	return found, err
}

// Usernames mirrors list_usernames (the raw _id values).
func (s *Store) Usernames(ctx context.Context) ([]any, error) {
	ctx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	cursor, err := s.users.Find(ctx, bson.D{}, options.Find().SetProjection(bson.D{{Key: "_id", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var ids []any
	for cursor.Next(ctx) {
		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		id, _ := pydoc.Get(pydoc.Normalize(doc).(bson.D), "_id")
		ids = append(ids, id)
	}
	return ids, cursor.Err()
}

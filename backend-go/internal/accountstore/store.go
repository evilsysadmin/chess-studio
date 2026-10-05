// Package accountstore owns the shared users authentication-state read used
// by native Go domains while the users/auth domain is migrated.
package accountstore

import (
	"context"
	"errors"
	"strconv"
	"strings"
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

// Email mirrors (users_store.get_user(username) or {}).get("email"): the
// stored value as it is (nil when absent).
func (s *Store) Email(ctx context.Context, username string) (any, error) {
	if s == nil || s.users == nil {
		return nil, errors.New("account store is not configured")
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var row bson.D
	err := s.users.FindOne(queryCtx, bson.M{"_id": username}, options.FindOne().SetProjection(bson.M{"email": 1})).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	for _, e := range row {
		if e.Key == "email" {
			return e.Value, nil
		}
	}
	return nil, nil
}

// LoginAccount is what login needs from a users document.
type LoginAccount struct {
	// Username is the document id (users_store.get_user/get_user_by_email
	// overwrite any stored "username" field with it).
	Username string
	// PasswordHash is the stored value; HasPasswordHash false when absent.
	PasswordHash    any
	HasPasswordHash bool
	// SessionVersion mirrors users_store.session_version.
	SessionVersion int64
}

// ForLogin mirrors login's lookup: by email when the identity contains "@"
// (get_user_by_email), by username otherwise (get_user).
func (s *Store) ForLogin(ctx context.Context, identity string) (LoginAccount, bool, error) {
	if s == nil || s.users == nil {
		return LoginAccount{}, false, errors.New("account store is not configured")
	}
	filter := bson.M{"_id": identity}
	if strings.Contains(identity, "@") {
		filter = bson.M{"email": identity}
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var row bson.M
	err := s.users.FindOne(queryCtx, filter, options.FindOne().SetProjection(bson.M{"_id": 1, "password_hash": 1, "session_version": 1})).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return LoginAccount{}, false, nil
	}
	if err != nil {
		return LoginAccount{}, false, err
	}
	account := LoginAccount{}
	if id, ok := row["_id"].(string); ok {
		account.Username = id
	}
	account.PasswordHash, account.HasPasswordHash = row["password_hash"]
	account.SessionVersion = sessionVersion(row["session_version"])
	return account, true, nil
}

// sessionVersion mirrors users_store.session_version: int(value), at least
// 0, and 0 for anything int() rejects.
func sessionVersion(value any) int64 {
	var version int64
	switch v := value.(type) {
	case bool:
		if v {
			version = 1
		}
	case int32:
		version = int64(v)
	case int64:
		version = v
	case float64:
		if v != v || v > 9.2e18 || v < -9.2e18 {
			return 0
		}
		version = int64(v)
	case string:
		n, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
		if err != nil {
			return 0
		}
		version = n
	}
	return max(0, version)
}

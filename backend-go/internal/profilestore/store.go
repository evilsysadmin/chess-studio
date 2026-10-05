// Package profilestore mirrors backend-python/profile_store.py: one profile
// document per username in the "profile" collection, a free-form public
// payload plus private per-key revisions (__profile_meta__) so two tabs can
// change different keys of data without overwriting each other.
//
// Documents are pydoc values (ordered bson.D, pymongo integer encoding), so
// Go and Python read and write the same documents interchangeably.
package profilestore

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

const (
	// CollectionName mirrors COLLECTION.
	CollectionName = "profile"
	metaKey        = "__profile_meta__"
	patchAttempts  = 5
)

// ErrUnavailable is PersistentStorageUnavailable: the API answers 503.
var ErrUnavailable = errors.New("profile storage unavailable")

// Collection is the slice of the Mongo collection the store needs.
type Collection interface {
	FindOne(ctx context.Context, username string) (bson.D, bool, error)
	ReplaceUpsert(ctx context.Context, username string, doc bson.D) error
	// Insert reports duplicate when another writer created the document.
	Insert(ctx context.Context, doc bson.D) (duplicate bool, err error)
	ReplaceIf(ctx context.Context, filter bson.D, doc bson.D) (matched bool, err error)
}

type Store struct{ col Collection }

func New(col Collection) *Store { return &Store{col: col} }

// Revision is one key's revision; Revisions keep their stored order.
type Revision struct {
	Key   string
	Value int64
}

type Revisions []Revision

func (r Revisions) get(key string) int64 {
	for _, rev := range r {
		if rev.Key == key {
			return rev.Value
		}
	}
	return 0
}

func (r Revisions) set(key string, value int64) Revisions {
	for i := range r {
		if r[i].Key == key {
			r[i].Value = value
			return r
		}
	}
	return append(r, Revision{Key: key, Value: value})
}

// Doc is the revisions as a document (Python dict of ints).
func (r Revisions) Doc() bson.D {
	out := make(bson.D, len(r))
	for i, rev := range r {
		out[i] = bson.E{Key: rev.Key, Value: pydoc.Int(rev.Value)}
	}
	return out
}

// Conflict mirrors ProfilePatchConflict.
type Conflict struct {
	Profile   bson.D
	Revisions Revisions
	Conflicts bson.D
}

func publicPayload(doc bson.D) bson.D {
	out := bson.D{}
	for _, e := range doc {
		if e.Key != "_id" && e.Key != metaKey {
			out = append(out, e)
		}
	}
	return out
}

// pyInt is int(value) for a stored number (bool included), ok false when
// Python would not treat it as a number.
func pyInt(value any) (int64, bool) {
	switch v := value.(type) {
	case bool:
		if v {
			return 1, true
		}
		return 0, true
	case int32:
		return int64(v), true
	case int64:
		return v, true
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, false
		}
		return int64(v), true // int() truncates toward zero
	}
	return 0, false
}

// meta mirrors _meta: sanitised per-key revisions and the write revision.
func meta(doc bson.D) (Revisions, int64) {
	raw, _ := pydoc.Get(doc, metaKey)
	metaDoc, _ := raw.(bson.D)
	var revisions Revisions
	if rawRevisions, _ := pydoc.Get(metaDoc, "key_revisions"); rawRevisions != nil {
		if revs, ok := rawRevisions.(bson.D); ok {
			for _, e := range revs {
				if value, ok := pyInt(e.Value); ok {
					revisions = append(revisions, Revision{Key: e.Key, Value: max(0, value)})
				}
			}
		}
	}
	write := int64(0)
	if rawWrite, _ := pydoc.Get(metaDoc, "write_revision"); rawWrite != nil {
		if value, ok := pyInt(rawWrite); ok {
			write = value
		}
	}
	return revisions, max(0, write)
}

func withRevisions(payload bson.D, revisions Revisions) bson.D {
	return pydoc.Set(pydoc.Copy(payload), "revisions", revisions.Doc())
}

func dataOf(payload bson.D) bson.D {
	raw, _ := pydoc.Get(payload, "data")
	data, _ := raw.(bson.D)
	if data == nil {
		return bson.D{}
	}
	return data
}

// nextFullRevisions mirrors _next_full_revisions: every key of data whose
// value or presence changed advances one revision. Python walks a set, so
// the order of new keys is arbitrary there; here it is sorted.
func nextFullRevisions(previous bson.D, revisions Revisions, replacement bson.D) Revisions {
	before, after := dataOf(previous), dataOf(replacement)
	next := append(Revisions(nil), revisions...)
	keys := map[string]bool{}
	for _, e := range before {
		keys[e.Key] = true
	}
	for _, e := range after {
		keys[e.Key] = true
	}
	ordered := make([]string, 0, len(keys))
	for key := range keys {
		ordered = append(ordered, key)
	}
	sort.Strings(ordered)
	for _, key := range ordered {
		b, inBefore := pydoc.Get(before, key)
		a, inAfter := pydoc.Get(after, key)
		if inBefore != inAfter || !pydoc.Equal(b, a) {
			next = next.set(key, next.get(key)+1)
		}
	}
	return next
}

func buildInternal(username string, payload bson.D, revisions Revisions, write int64) bson.D {
	doc := pydoc.Copy(payload)
	doc = pydoc.Set(doc, "_id", username)
	return pydoc.Set(doc, metaKey, bson.D{
		{Key: "key_revisions", Value: revisions.Doc()},
		{Key: "write_revision", Value: pydoc.Int(write)},
	})
}

// Get mirrors get_profile: the public payload plus "revisions", or found
// false when the account has no profile document.
func (s *Store) Get(ctx context.Context, username string) (bson.D, bool, error) {
	doc, found, err := s.col.FindOne(ctx, username)
	if err != nil {
		return nil, false, ErrUnavailable
	}
	if !found {
		return nil, false, nil
	}
	revisions, _ := meta(doc)
	return withRevisions(publicPayload(doc), revisions), true, nil
}

// Save mirrors save_profile (PUT): the whole document is replaced and the
// revisions of the data keys that changed advance.
func (s *Store) Save(ctx context.Context, username string, body bson.D) (bson.D, error) {
	safe := bson.D{}
	for _, e := range body {
		if e.Key != "_id" && e.Key != metaKey && e.Key != "revisions" {
			safe = append(safe, e)
		}
	}
	previousDoc, _, err := s.col.FindOne(ctx, username)
	if err != nil {
		return nil, ErrUnavailable
	}
	previousRevisions, write := meta(previousDoc)
	revisions := nextFullRevisions(publicPayload(previousDoc), previousRevisions, safe)
	if err := s.col.ReplaceUpsert(ctx, username, buildInternal(username, safe, revisions, write+1)); err != nil {
		return nil, ErrUnavailable
	}
	return withRevisions(safe, revisions), nil
}

// Patch mirrors patch_profile: per-key optimistic merge of data changes
// (nil deletes a key) against the revisions the client edited from.
func (s *Store) Patch(ctx context.Context, username string, changes, expected bson.D) (bson.D, *Conflict, error) {
	wanted := Revisions{}
	for _, e := range expected {
		if value, ok := pyInt(e.Value); ok {
			wanted = wanted.set(e.Key, max(0, value))
		}
	}
	for attempt := 0; attempt < patchAttempts; attempt++ {
		currentDoc, found, err := s.col.FindOne(ctx, username)
		if err != nil {
			return nil, nil, ErrUnavailable
		}
		current := publicPayload(currentDoc)
		revisions, write := meta(currentDoc)

		conflicts := bson.D{}
		for _, change := range changes {
			want, actual := wanted.get(change.Key), revisions.get(change.Key)
			if want != actual {
				conflicts = append(conflicts, bson.E{Key: change.Key, Value: bson.D{
					{Key: "expected", Value: pydoc.Int(want)},
					{Key: "actual", Value: pydoc.Int(actual)},
				}})
			}
		}
		if len(conflicts) > 0 {
			return nil, &Conflict{Profile: withRevisions(current, revisions), Revisions: revisions, Conflicts: conflicts}, nil
		}

		nextData := pydoc.Copy(dataOf(current))
		nextRevisions := append(Revisions(nil), revisions...)
		for _, change := range changes {
			if change.Value == nil {
				nextData = pydoc.Delete(nextData, change.Key)
			} else {
				nextData = pydoc.Set(nextData, change.Key, change.Value)
			}
			nextRevisions = nextRevisions.set(change.Key, nextRevisions.get(change.Key)+1)
		}
		nextPayload := pydoc.Set(pydoc.Copy(current), "data", nextData)
		nextDoc := buildInternal(username, nextPayload, nextRevisions, write+1)

		if !found {
			// insert_one, never an upsert: two writers that both saw no
			// document must not overwrite each other without a recheck.
			duplicate, err := s.col.Insert(ctx, nextDoc)
			if duplicate {
				continue
			}
			if err != nil {
				return nil, nil, ErrUnavailable
			}
			return withRevisions(nextPayload, nextRevisions), nil, nil
		}
		filter := bson.D{{Key: "_id", Value: username}}
		rawMeta, _ := pydoc.Get(currentDoc, metaKey)
		if metaDoc, ok := rawMeta.(bson.D); ok {
			if _, has := pydoc.Get(metaDoc, "write_revision"); has {
				filter = append(filter, bson.E{Key: metaKey + ".write_revision", Value: pydoc.Int(write)})
			} else {
				filter = append(filter, bson.E{Key: metaKey, Value: bson.D{{Key: "$exists", Value: false}}})
			}
		} else {
			filter = append(filter, bson.E{Key: metaKey, Value: bson.D{{Key: "$exists", Value: false}}})
		}
		matched, err := s.col.ReplaceIf(ctx, filter, nextDoc)
		if err != nil {
			return nil, nil, ErrUnavailable
		}
		if matched {
			return withRevisions(nextPayload, nextRevisions), nil, nil
		}
	}
	return nil, nil, ErrUnavailable
}

// MongoCollection is the production Collection.
type MongoCollection struct {
	col     *mongo.Collection
	timeout time.Duration
}

func NewMongo(db *mongo.Database, timeout time.Duration) *MongoCollection {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	return &MongoCollection{col: db.Collection(CollectionName), timeout: timeout}
}

func (m *MongoCollection) FindOne(ctx context.Context, username string) (bson.D, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	var doc bson.D
	err := m.col.FindOne(ctx, bson.D{{Key: "_id", Value: username}}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return pydoc.Normalize(doc).(bson.D), true, nil
}

func (m *MongoCollection) ReplaceUpsert(ctx context.Context, username string, doc bson.D) error {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	_, err := m.col.ReplaceOne(ctx, bson.D{{Key: "_id", Value: username}}, doc, options.Replace().SetUpsert(true))
	return err
}

func (m *MongoCollection) Insert(ctx context.Context, doc bson.D) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	_, err := m.col.InsertOne(ctx, doc)
	if mongo.IsDuplicateKeyError(err) {
		return true, nil
	}
	return false, err
}

func (m *MongoCollection) ReplaceIf(ctx context.Context, filter bson.D, doc bson.D) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	result, err := m.col.ReplaceOne(ctx, filter, doc)
	if err != nil {
		return false, err
	}
	return result.MatchedCount > 0, nil
}

// Batch is the batched read behind get_profile_data_for_users: the stored
// documents (only _id and the projected data keys) of the named users.
type Batch interface {
	Find(ctx context.Context, usernames, keys []string) ([]bson.D, error)
}

// DataForUsers mirrors get_profile_data_for_users: username → {"data": {...}}
// restricted to keys, for the users that have a profile document.
func (s *Store) DataForUsers(ctx context.Context, usernames []string, keys []string) (map[string]bson.D, error) {
	seen := map[string]bool{}
	var names []string
	for _, name := range usernames {
		if strings.TrimSpace(name) != "" && !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}
	result := map[string]bson.D{}
	if len(names) == 0 {
		return result, nil
	}
	batch, ok := s.col.(Batch)
	if !ok {
		return nil, ErrUnavailable
	}
	docs, err := batch.Find(ctx, names, keys)
	if err != nil {
		return nil, ErrUnavailable
	}
	wanted := map[string]bool{}
	for _, key := range keys {
		wanted[key] = true
	}
	for _, doc := range docs {
		id, _ := pydoc.Get(doc, "_id")
		data := bson.D{}
		if raw, ok := pydoc.Get(doc, "data"); ok {
			if d, isDoc := raw.(bson.D); isDoc {
				for _, e := range d {
					if wanted[e.Key] {
						data = append(data, e)
					}
				}
			}
		}
		result[fmt.Sprint(id)] = bson.D{{Key: "data", Value: data}}
	}
	return result, nil
}

func (m *MongoCollection) Find(ctx context.Context, usernames, keys []string) ([]bson.D, error) {
	ctx, cancel := context.WithTimeout(ctx, m.timeout)
	defer cancel()
	projection := bson.D{{Key: "_id", Value: 1}}
	for _, key := range keys {
		projection = append(projection, bson.E{Key: "data." + key, Value: 1})
	}
	cursor, err := m.col.Find(ctx, bson.D{{Key: "_id", Value: bson.D{{Key: "$in", Value: usernames}}}}, options.Find().SetProjection(projection))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var docs []bson.D
	for cursor.Next(ctx) {
		var doc bson.D
		if err := cursor.Decode(&doc); err != nil {
			return nil, err
		}
		docs = append(docs, pydoc.Normalize(doc).(bson.D))
	}
	return docs, cursor.Err()
}

package profilestore

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// memCollection keeps documents like Mongo does for the filters the store
// uses: _id plus either a numeric write_revision or a missing meta.
type memCollection struct {
	docs    map[string]bson.D
	fail    bool
	inserts int
}

func newMem() *memCollection { return &memCollection{docs: map[string]bson.D{}} }

func (m *memCollection) FindOne(_ context.Context, username string) (bson.D, bool, error) {
	if m.fail {
		return nil, false, errors.New("down")
	}
	doc, ok := m.docs[username]
	return pydoc.Copy(doc), ok, nil
}

func (m *memCollection) ReplaceUpsert(_ context.Context, username string, doc bson.D) error {
	m.docs[username] = doc
	return nil
}

func (m *memCollection) Insert(_ context.Context, doc bson.D) (bool, error) {
	m.inserts++
	id, _ := pydoc.Get(doc, "_id")
	if _, exists := m.docs[id.(string)]; exists {
		return true, nil
	}
	m.docs[id.(string)] = doc
	return false, nil
}

func (m *memCollection) ReplaceIf(_ context.Context, filter bson.D, doc bson.D) (bool, error) {
	id, _ := pydoc.Get(filter, "_id")
	current, ok := m.docs[id.(string)]
	if !ok {
		return false, nil
	}
	rawMeta, hasMeta := pydoc.Get(current, metaKey)
	for _, cond := range filter[1:] {
		switch cond.Key {
		case metaKey + ".write_revision":
			metaDoc, _ := rawMeta.(bson.D)
			stored, has := pydoc.Get(metaDoc, "write_revision")
			if !has || !pydoc.Equal(stored, cond.Value) {
				return false, nil
			}
		case metaKey:
			if hasMeta {
				return false, nil
			}
		}
	}
	m.docs[id.(string)] = doc
	return true, nil
}

// strict compares values with their types and key order.
func strict(path string, a, b any) error {
	switch x := a.(type) {
	case bson.D:
		y, ok := b.(bson.D)
		if !ok || len(x) != len(y) {
			return fmt.Errorf("%s: %v vs %v", path, a, b)
		}
		for i := range x {
			if x[i].Key != y[i].Key {
				return fmt.Errorf("%s: key %d %q vs %q", path, i, x[i].Key, y[i].Key)
			}
			if err := strict(path+"."+x[i].Key, x[i].Value, y[i].Value); err != nil {
				return err
			}
		}
		return nil
	case bson.A:
		y, ok := b.(bson.A)
		if !ok || len(x) != len(y) {
			return fmt.Errorf("%s: %v vs %v", path, a, b)
		}
		for i := range x {
			if err := strict(fmt.Sprintf("%s[%d]", path, i), x[i], y[i]); err != nil {
				return err
			}
		}
		return nil
	}
	if fmt.Sprintf("%T %v", a, a) != fmt.Sprintf("%T %v", b, b) {
		return fmt.Errorf("%s: %T %v vs %T %v", path, a, a, b, b)
	}
	return nil
}

func field(doc bson.D, key string) any {
	value, _ := pydoc.Get(doc, key)
	return value
}

// TestProfileOperationsMatchPython replays scripts/profile_parity_corpus.py.
func TestProfileOperationsMatchPython(t *testing.T) {
	raw, err := os.ReadFile("testdata/python_profile_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := pydoc.Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	corpus := decoded.(bson.D)
	mem := newMem()
	for _, e := range field(corpus, "initial").(bson.D) {
		mem.docs[e.Key] = e.Value.(bson.D)
	}
	store := New(mem)
	ctx := context.Background()
	ops := field(corpus, "ops").(bson.A)
	if len(ops) < 200 {
		t.Fatalf("corpus too small: %d", len(ops))
	}
	for i, rawOp := range ops {
		op := rawOp.(bson.D)
		user := field(op, "user").(string)
		var got any
		switch field(op, "op") {
		case "get":
			doc, found, err := store.Get(ctx, user)
			if err != nil {
				t.Fatal(err)
			}
			if found {
				got = doc
			}
		case "put":
			got, err = store.Save(ctx, user, field(op, "body").(bson.D))
			if err != nil {
				t.Fatal(err)
			}
		case "patch":
			result, conflict, err := store.Patch(ctx, user, field(op, "changes").(bson.D), field(op, "expected").(bson.D))
			if err != nil {
				t.Fatalf("op %d: %v", i, err)
			}
			got = result
			if conflict != nil {
				got = bson.D{{Key: "conflict", Value: bson.D{
					{Key: "profile", Value: conflict.Profile},
					{Key: "revisions", Value: conflict.Revisions.Doc()},
					{Key: "conflicts", Value: conflict.Conflicts},
				}}}
			}
		}
		if err := strict(fmt.Sprintf("op %d (%s %s) result", i, field(op, "op"), user), got, field(op, "result")); err != nil {
			t.Fatal(err)
		}
		var stored any
		if doc, ok := mem.docs[user]; ok {
			stored = pydoc.Delete(pydoc.Copy(doc), "_id")
		}
		if err := strict(fmt.Sprintf("op %d stored", i), stored, field(op, "stored")); err != nil {
			t.Fatal(err)
		}
	}
}

func TestPatchRetriesARaceAndGivesUpLikePython(t *testing.T) {
	ctx := context.Background()
	// Meta without write_revision: Python's Mongo CAS filter ($exists false)
	// can never match it, so PATCH ends unavailable after five attempts.
	mem := newMem()
	mem.docs["u"] = bson.D{{Key: "_id", Value: "u"}, {Key: metaKey, Value: bson.D{}}}
	if _, _, err := New(mem).Patch(ctx, "u", bson.D{{Key: "k", Value: int32(1)}}, bson.D{}); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("unmatchable CAS: %v", err)
	}
	// Two writers creating the same profile: the loser rereads and merges.
	mem = newMem()
	racing := &raceOnce{memCollection: mem}
	result, conflict, err := New(racing).Patch(ctx, "u", bson.D{{Key: "b", Value: int32(2)}}, bson.D{})
	if err != nil || conflict != nil {
		t.Fatalf("race: %v %v", err, conflict)
	}
	data := field(result, "data").(bson.D)
	if len(data) != 2 || mem.inserts != 0 || !racing.done {
		t.Fatalf("merged %v inserts %d", data, mem.inserts)
	}
	// Storage trouble is ErrUnavailable everywhere.
	mem = newMem()
	mem.fail = true
	if _, _, err := New(mem).Get(ctx, "u"); !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
}

// raceOnce lets another writer create the document right before the first
// insert.
type raceOnce struct {
	*memCollection
	done bool
}

func (r *raceOnce) Insert(ctx context.Context, doc bson.D) (bool, error) {
	if !r.done {
		r.done = true
		r.docs["u"] = bson.D{{Key: "_id", Value: "u"}, {Key: "data", Value: bson.D{{Key: "a", Value: int32(1)}}},
			{Key: metaKey, Value: bson.D{{Key: "key_revisions", Value: bson.D{{Key: "a", Value: int32(1)}}}, {Key: "write_revision", Value: int32(1)}}}}
		return true, nil
	}
	return r.memCollection.Insert(ctx, doc)
}

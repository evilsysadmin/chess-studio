package feedbackstore

import (
	"context"
	"sort"
	"sync"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// Memory is feedback_store.py's in-memory mode over Mongo-shaped rows
// (_id first); it backs the parity tests.
type Memory struct {
	mu   sync.Mutex
	rows []bson.D
}

func NewMemory() *Memory { return &Memory{} }

func copyRow(row bson.D) bson.D { return append(bson.D(nil), row...) }

func id(row bson.D) any {
	v, _ := pydoc.Get(row, "_id")
	return v
}

func field(row bson.D, key string) any {
	v, _ := pydoc.Get(row, key)
	return v
}

func (m *Memory) index(key string) int {
	for i, row := range m.rows {
		if id(row) == key {
			return i
		}
	}
	return -1
}

func (m *Memory) Insert(_ context.Context, doc bson.D) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rows = append(m.rows, copyRow(doc))
	return nil
}

func withoutData(row bson.D) bson.D {
	out := copyRow(row)
	list, _ := field(row, "attachments").(bson.A)
	if list == nil {
		return out
	}
	stripped := bson.A{}
	for _, item := range list {
		if d, ok := item.(bson.D); ok {
			item = pydoc.Delete(append(bson.D(nil), d...), "data")
		}
		stripped = append(stripped, item)
	}
	return pydoc.Set(out, "attachments", stripped)
}

func (m *Memory) newest(keep func(bson.D) bool, limit int64) []bson.D {
	var rows []bson.D
	for _, row := range m.rows {
		if keep(row) {
			rows = append(rows, withoutData(row))
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		a, _ := field(rows[i], "created_at").(string)
		b, _ := field(rows[j], "created_at").(string)
		return a > b
	})
	if int64(len(rows)) > limit {
		rows = rows[:limit]
	}
	return rows
}

func (m *Memory) List(_ context.Context, limit int64) ([]bson.D, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.newest(func(bson.D) bool { return true }, limit), nil
}

func (m *Memory) ListForUser(_ context.Context, username string, limit int64) ([]bson.D, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.newest(func(row bson.D) bool { return field(row, "username") == username }, limit), nil
}

func (m *Memory) Summary(context.Context) (int64, int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var fresh, pending int64
	for _, row := range m.rows {
		if field(row, "status") == "new" {
			fresh++
		}
		if field(row, "status") != "resolved" {
			pending++
		}
	}
	return fresh, pending, nil
}

func (m *Memory) Attachments(_ context.Context, key string) (bson.A, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	at := m.index(key)
	if at < 0 {
		return nil, nil
	}
	list, _ := field(m.rows[at], "attachments").(bson.A)
	if list == nil {
		list = bson.A{}
	}
	return list, nil
}

func (m *Memory) Update(_ context.Context, key string, set bson.D) (bson.D, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	at := m.index(key)
	if at < 0 {
		return nil, nil
	}
	row := copyRow(m.rows[at])
	for _, e := range set {
		row = pydoc.Set(row, e.Key, e.Value)
	}
	m.rows[at] = row
	return copyRow(row), nil
}

func (m *Memory) Delete(_ context.Context, key string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	at := m.index(key)
	if at < 0 {
		return false, nil
	}
	m.rows = append(m.rows[:at], m.rows[at+1:]...)
	return true, nil
}

func (m *Memory) DeleteForUser(_ context.Context, key, username string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	at := m.index(key)
	if at < 0 || field(m.rows[at], "username") != username {
		return false, nil
	}
	m.rows = append(m.rows[:at], m.rows[at+1:]...)
	return true, nil
}

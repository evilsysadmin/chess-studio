package chroniclesrun

import (
	"context"
	"sort"
	"sync"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// Memory is the in-memory store of chronicles_run_store.py (no MongoDB).
type Memory struct {
	mu   sync.Mutex
	runs map[string]bson.D
}

func NewMemory() *Memory { return &Memory{runs: map[string]bson.D{}} }

func (m *Memory) Replay(_ context.Context, runID, owner, fingerprint string) (bson.D, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	row, ok := m.runs[runID]
	if !ok || get(row, "owner") != owner {
		return nil, nil
	}
	if get(row, "createFingerprint") != fingerprint {
		return nil, ErrIdempotencyConflict
	}
	return Public(row), nil
}

func (m *Memory) Create(_ context.Context, run NewRun) (bson.D, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing, ok := m.runs[run.RunID]; ok {
		if get(existing, "owner") != run.Owner || get(existing, "createFingerprint") != run.Fingerprint {
			return nil, ErrIdempotencyConflict
		}
		return Public(existing), nil
	}
	doc := document(run)
	m.runs[run.RunID] = doc
	return Public(doc), nil
}

// appendUnique is list(dict.fromkeys([*stored, *added])).
func appendUnique(stored any, added []string) bson.A {
	out := bson.A{}
	seen := map[string]bool{}
	list, _ := stored.(bson.A)
	for _, item := range list {
		if s, ok := item.(string); ok {
			if seen[s] {
				continue
			}
			seen[s] = true
		}
		out = append(out, item)
	}
	for _, s := range added {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

func (m *Memory) Checkpoint(_ context.Context, c Checkpoint) (bson.D, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	row, ok := m.runs[c.RunID]
	if !ok || get(row, "owner") != c.Owner {
		return nil, nil
	}
	if statusOf(row) != "active" {
		if terminalReplayMatches(row, c) {
			return Public(row), nil
		}
		return nil, ErrTerminal
	}
	if !intEq(intOr(row, "worldVersion", 0), c.ExpectedWorldVersion) {
		return nil, ErrWorldVersion
	}
	set := func(key string, value any) { row = pydoc.Set(row, key, value) }
	set("currentMapId", c.MapID)
	set("contentVersion", c.ContentVersion)
	set("manifestRevision", c.ManifestRevision)
	set("worldFlags", copyDoc(c.WorldFlags))
	set("inventory", copyDoc(c.Inventory))
	set("quests", copyDoc(c.Quests))
	set("consumedContentIds", appendUnique(get(row, "consumedContentIds"), c.ConsumedContentIDs))
	set("claimedRewards", appendUnique(get(row, "claimedRewards"), c.ClaimedRewards))
	if c.TerminalStatus != nil {
		set("status", *c.TerminalStatus)
	}
	set("worldVersion", c.ExpectedWorldVersion+1)
	set("updatedAt", bson.NewDateTimeFromTime(c.Now))
	m.runs[c.RunID] = row
	return Public(row), nil
}

func (m *Memory) Get(_ context.Context, runID, owner string) (bson.D, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	row, ok := m.runs[runID]
	if !ok || get(row, "owner") != owner {
		return nil, nil
	}
	return Public(row), nil
}

func (m *Memory) ListActive(_ context.Context, owner string, limit int) ([]bson.D, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if limit < 1 || limit > 30 {
		limit = 30
	}
	type result struct {
		row     bson.D
		updated int64
	}
	rows := []result{}
	for _, row := range m.runs {
		if get(row, "owner") != owner || statusOf(row) != "active" {
			continue
		}
		summary := Summary(row)
		updated, _ := get(summary, "updatedAtMs").(int64)
		rows = append(rows, result{row: summary, updated: updated})
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].updated != rows[j].updated {
			return rows[i].updated > rows[j].updated
		}
		return get(rows[i].row, "runId").(string) < get(rows[j].row, "runId").(string)
	})
	if len(rows) > limit {
		rows = rows[:limit]
	}
	out := make([]bson.D, 0, len(rows))
	for _, item := range rows {
		out = append(out, item.row)
	}
	return out, nil
}

func (m *Memory) DeleteOwned(_ context.Context, runID, owner string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	row, ok := m.runs[runID]
	if !ok || get(row, "owner") != owner {
		return false, nil
	}
	delete(m.runs, runID)
	return true, nil
}

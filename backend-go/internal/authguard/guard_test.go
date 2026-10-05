package authguard

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type corpusState struct {
	WindowStartedAt *string `json:"window_started_at"`
	Failures        int64   `json:"failures"`
	BlockedUntil    *string `json:"blocked_until"`
	UpdatedAt       string  `json:"updated_at"`
}

func iso(t *time.Time) *string {
	if t == nil {
		return nil
	}
	// Python's isoformat for an aware UTC datetime.
	s := t.UTC().Format("2006-01-02T15:04:05")
	if micro := t.Nanosecond() / 1000; micro != 0 {
		s += fmt.Sprintf(".%06d", micro)
	}
	s += "+00:00"
	return &s
}

func (s State) corpus() corpusState {
	return corpusState{WindowStartedAt: iso(s.WindowStartedAt), Failures: s.Failures, BlockedUntil: iso(s.BlockedUntil), UpdatedAt: *iso(&s.UpdatedAt)}
}

func (c corpusState) String() string {
	deref := func(p *string) string {
		if p == nil {
			return "<nil>"
		}
		return *p
	}
	return fmt.Sprintf("{%s %d %s %s}", deref(c.WindowStartedAt), c.Failures, deref(c.BlockedUntil), c.UpdatedAt)
}

func toDoc(c *corpusState) bson.D {
	if c == nil {
		return nil
	}
	var window, blocked any
	if c.WindowStartedAt != nil {
		window = *c.WindowStartedAt
	}
	if c.BlockedUntil != nil {
		blocked = *c.BlockedUntil
	}
	return bson.D{{Key: "window_started_at", Value: window}, {Key: "failures", Value: int32(c.Failures)}, {Key: "blocked_until", Value: blocked}, {Key: "updated_at", Value: c.UpdatedAt}}
}

// TestGuardsMatchPython replays scripts/auth_guard_parity_corpus.py.
func TestGuardsMatchPython(t *testing.T) {
	raw, err := os.ReadFile("testdata/python_guard_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Secret     string `json:"secret"`
		Identities []struct{ Input, Key string }
		IPs        []struct{ Input, Key string } `json:"ips"`
		Sequences  []struct {
			Guard string `json:"guard"`
			Steps []struct {
				Now         string       `json:"now"`
				RetryBefore int          `json:"retryBefore"`
				State       *corpusState `json:"state"`
				RetryAfter  int          `json:"retryAfter"`
			} `json:"steps"`
		} `json:"sequences"`
		Odd []struct {
			Doc   map[string]any `json:"doc"`
			Now   string         `json:"now"`
			Login corpusState    `json:"login"`
			IP    corpusState    `json:"ip"`
		} `json:"odd"`
	}
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	for _, id := range corpus.Identities {
		if got := IdentityKey(id.Input, corpus.Secret); got != id.Key {
			t.Errorf("identity %q: %s, Python %s", id.Input, got, id.Key)
		}
	}
	for _, ip := range corpus.IPs {
		if got, err := IPKey(ip.Input, corpus.Secret); err != nil || got != ip.Key {
			t.Errorf("ip %q: %s %v, Python %s", ip.Input, got, err, ip.Key)
		}
	}
	steps, blocks := 0, 0
	for _, seq := range corpus.Sequences {
		policy := LoginIdentity
		if seq.Guard == "auth_ip_guard" {
			policy = ClientIP
		}
		var state *corpusState
		for i, step := range seq.Steps {
			now, ok := asUTC(step.Now)
			if !ok {
				t.Fatalf("now %q", step.Now)
			}
			// Mongo truncation in the corpus is applied to the stored state
			// it hands back; the next step reads that state.
			doc := toDoc(state)
			if got := RetryAfterSeconds(doc, now); got != step.RetryBefore {
				t.Fatalf("%s step %d retry before %d, Python %d", seq.Guard, i, got, step.RetryBefore)
			}
			next := policy.StateAfterFailure(doc, now).corpus()
			if next.String() != step.State.String() {
				t.Fatalf("%s step %d: %s, Python %s", seq.Guard, i, next, step.State)
			}
			if got := RetryAfterSeconds(toDoc(&next), now); got != step.RetryAfter {
				t.Fatalf("%s step %d retry after %d, Python %d", seq.Guard, i, got, step.RetryAfter)
			}
			if step.RetryAfter > 0 {
				blocks++
			}
			copied := *step.State
			state = &copied
			steps++
		}
	}
	if steps < 500 || blocks < 50 {
		t.Fatalf("corpus too thin: %d steps %d blocks", steps, blocks)
	}
	for _, odd := range corpus.Odd {
		now, _ := asUTC(odd.Now)
		doc := bson.D{}
		for key, value := range odd.Doc {
			if f, ok := value.(float64); ok {
				value = int32(f)
			}
			doc = append(doc, bson.E{Key: key, Value: value})
		}
		if got := LoginIdentity.StateAfterFailure(doc, now).corpus(); got.String() != odd.Login.String() {
			t.Errorf("login %v: %+v, Python %+v", odd.Doc, got, odd.Login)
		}
		if got := ClientIP.StateAfterFailure(doc, now).corpus(); got.String() != odd.IP.String() {
			t.Errorf("ip %v: %+v, Python %+v", odd.Doc, got, odd.IP)
		}
	}
}

// memStore mimics the Mongo filters the guard uses.
type memStore struct {
	docs     map[string]bson.D
	fail     bool
	ttlCalls int
}

func (m *memStore) EnsureTTL(context.Context, string, time.Duration) error {
	m.ttlCalls++
	if m.fail {
		return errors.New("down")
	}
	return nil
}
func (m *memStore) Find(_ context.Context, id string) (bson.D, bool, error) {
	if m.fail {
		return nil, false, errors.New("down")
	}
	d, ok := m.docs[id]
	return d, ok, nil
}
func (m *memStore) Insert(_ context.Context, doc bson.D) (bool, error) {
	id, _ := field(doc, "_id")
	if _, ok := m.docs[id.(string)]; ok {
		return true, nil
	}
	m.docs[id.(string)] = doc
	return false, nil
}
func (m *memStore) Update(_ context.Context, filter, update bson.D) (bool, error) {
	id, _ := field(filter, "_id")
	doc, ok := m.docs[id.(string)]
	if !ok {
		return false, nil
	}
	want, _ := field(filter, "_guard_version")
	have, present := field(doc, "_guard_version")
	if exists, isCond := want.(bson.D); isCond {
		if present != exists[0].Value.(bool) {
			return false, nil
		}
	} else if !present || fmt.Sprint(have) != fmt.Sprint(want) {
		return false, nil
	}
	set, _ := field(update, "$set")
	next := bson.D{{Key: "_id", Value: id}}
	version := int32(0)
	if present {
		version = have.(int32)
	}
	next = append(next, bson.E{Key: "_guard_version", Value: version + 1})
	next = append(next, set.(bson.D)...)
	m.docs[id.(string)] = next
	return true, nil
}
func (m *memStore) Delete(_ context.Context, id string) error {
	delete(m.docs, id)
	return nil
}

func TestGuardBlocksLogsAndClears(t *testing.T) {
	store := &memStore{docs: map[string]bson.D{}}
	g := New(ClientIP, store)
	now := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	g.now = func() time.Time { return now }
	var logs []string
	g.logf = func(line string) { logs = append(logs, line) }
	ctx := context.Background()
	for i := 1; i <= 10; i++ {
		retry, err := g.RecordFailure(ctx, "ip1")
		if err != nil {
			t.Fatal(err)
		}
		if (i < 10 && retry != 0) || (i == 10 && retry != 900) {
			t.Fatalf("failure %d retry %d", i, retry)
		}
	}
	if len(logs) != 1 || !strings.Contains(logs[0], `"event":"auth_ip_ban_activated"`) || strings.Contains(logs[0], "identity") {
		t.Fatalf("logs %v", logs)
	}
	// The block is cached: Mongo is not consulted while it lasts.
	store.fail = true
	now = now.Add(899*time.Second + 500*time.Millisecond)
	if retry, err := g.RetryAfter(ctx, "ip1"); err != nil || retry != 1 {
		t.Fatalf("cached retry %d %v", retry, err)
	}
	store.fail = false
	now = now.Add(time.Second)
	if retry, _ := g.RetryAfter(ctx, "ip1"); retry != 0 {
		t.Fatalf("expired block %d", retry)
	}
	if store.ttlCalls != 1 {
		t.Fatalf("TTL ensured %d times", store.ttlCalls)
	}
	if err := g.Clear(ctx, "ip1"); err != nil || len(store.docs) != 0 {
		t.Fatalf("clear %v %v", err, store.docs)
	}
	// Legacy document without _guard_version is updated with $exists false.
	login := New(LoginIdentity, store)
	login.now = func() time.Time { return now }
	login.logf = func(string) {}
	store.docs["id"] = bson.D{{Key: "_id", Value: "id"}, {Key: "failures", Value: int32(3)}, {Key: "window_started_at", Value: bson.NewDateTimeFromTime(now)}}
	if _, err := login.RecordFailure(ctx, "id"); err != nil {
		t.Fatal(err)
	}
	if failures, _ := field(store.docs["id"], "failures"); failures != int32(4) {
		t.Fatalf("legacy doc %v", store.docs["id"])
	}
	store.fail = true
	if _, err := New(LoginIdentity, store).RetryAfter(ctx, "x"); !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
}

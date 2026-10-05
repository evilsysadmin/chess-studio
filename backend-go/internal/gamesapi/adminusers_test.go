package gamesapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/accountstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/ipgeo"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/narrative"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/profilestore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/userdata"
)

// memAccounts is the users collection in natural (insertion) order.
type memAccounts struct{ docs []bson.D }

func (m *memAccounts) index(name string) int {
	for i, d := range m.docs {
		if id, _ := pydoc.Get(d, "_id"); id == name {
			return i
		}
	}
	return -1
}
func (m *memAccounts) ListOverview(context.Context) ([]bson.D, error) {
	var out []bson.D
	for _, d := range m.docs {
		id, _ := pydoc.Get(d, "_id")
		out = append(out, accountstore.Overview(pyval.Str(id), d))
	}
	return out, nil
}
func (m *memAccounts) Exists(_ context.Context, name string) (bool, error) {
	return m.index(name) >= 0, nil
}
func (m *memAccounts) Usernames(context.Context) ([]any, error) {
	var out []any
	for _, d := range m.docs {
		id, _ := pydoc.Get(d, "_id")
		out = append(out, id)
	}
	return out, nil
}
func (m *memAccounts) Delete(_ context.Context, name string) (bool, error) {
	at := m.index(name)
	if at < 0 {
		return false, nil
	}
	m.docs = append(m.docs[:at], m.docs[at+1:]...)
	return true, nil
}

// batchProfiles adds get_profile_data_for_users' batched read to profileMem.
type batchProfiles struct{ *profileMem }

func (b batchProfiles) Find(_ context.Context, names, _ []string) ([]bson.D, error) {
	var out []bson.D
	for _, name := range names {
		if doc, ok := b.docs[name]; ok {
			out = append(out, doc)
		}
	}
	return out, nil
}

type memMatthias map[string]bson.D

func (m memMatthias) Memory(_ context.Context, name string) (bson.D, error) { return m[name], nil }
func (m memMatthias) DeleteMemory(_ context.Context, name string) error {
	delete(m, name)
	return nil
}

type fakeCountries struct {
	cached    map[string]string
	scheduled []string
}

func (f *fakeCountries) Cached(raw any) string {
	s, _ := raw.(string)
	return f.cached[s]
}
func (f *fakeCountries) Schedule(raw any) bool {
	f.scheduled = append(f.scheduled, fmt.Sprint(raw))
	return true
}

// portraitCalls records what the portrait and preview routes hand the
// Matthias memory hooks and the narrative gateway, in call order, the way the
// corpus script's stubs do.
type portraitCalls struct{ calls []bson.D }

func (p *portraitCalls) ObserveFacts(_ context.Context, name string, facts bson.D, _ time.Time) error {
	p.calls = append(p.calls, bson.D{{Key: "op", Value: "observe"}, {Key: "target", Value: name}, {Key: "facts", Value: facts}})
	if boom, _ := pydoc.Get(facts, "boom"); boom == "observe" {
		return fmt.Errorf("observe")
	}
	return nil
}
func (p *portraitCalls) MemoryContext(_ context.Context, name string, facts bson.D, _ time.Time) (bson.D, error) {
	p.calls = append(p.calls, bson.D{{Key: "op", Value: "context"}, {Key: "target", Value: name}, {Key: "facts", Value: facts}})
	if boom, _ := pydoc.Get(facts, "boom"); boom == "context" {
		return nil, fmt.Errorf("context")
	}
	keys := bson.A{}
	for _, e := range facts {
		keys = append(keys, e.Key)
	}
	return bson.D{{Key: "target", Value: name}, {Key: "keys", Value: keys}}, nil
}
func (p *portraitCalls) Generate(_ context.Context, event string, facts bson.D, tone, locale *string, kind string, _ *string) narrative.Result {
	p.calls = append(p.calls, bson.D{{Key: "op", Value: "generate"}, {Key: "event", Value: event}, {Key: "facts", Value: facts},
		{Key: "tone", Value: *tone}, {Key: "locale", Value: *locale}, {Key: "kind", Value: kind}})
	return narrative.Result{Text: "Achtung.", Provider: "cloudflare", LatencyMS: 12.34, Model: "m"}
}
func (p *portraitCalls) Metrics() bson.D                   { return bson.D{} }
func (p *portraitCalls) EventMetrics(string, int64) bson.D { return bson.D{} }
func (p *portraitCalls) Enter() int64                      { return 1 }
func (p *portraitCalls) Exit()                             {}
func (p *portraitCalls) ShouldShed(int64) bool             { return false }
func (p *portraitCalls) RecordShed()                       {}

func decodeDocs(t *testing.T, raw []json.RawMessage) []bson.D {
	t.Helper()
	var out []bson.D
	for _, r := range raw {
		v, err := pydoc.Decode(r)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, v.(bson.D))
	}
	return out
}

type adminUsersStores struct {
	users    AdminUserAccounts
	profiles AdminProfiles
	matthias AdminMatthiasMemory
	// stored reads back a user's profile data after the corpus ran.
	stored func(username string) bson.D
}

// replayAdminUsersCorpus seeds the corpus documents through seed and
// replays its steps against the stores it returns.
func replayAdminUsersCorpus(t *testing.T, seed func(users, profiles, memories []bson.D) adminUsersStores) {
	t.Helper()
	data, err := os.ReadFile("testdata/python_admin_users_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Now       string                        `json:"now"`
		Users     []json.RawMessage             `json:"users"`
		Profiles  []json.RawMessage             `json:"profiles"`
		Memories  []json.RawMessage             `json:"memories"`
		Countries map[string]string             `json:"countries"`
		Stored    map[string]map[string]*string `json:"stored"`
		Steps     []struct {
			Label, Method, Path, User string
			Body                      *string         `json:"body"`
			Status                    int             `json:"status"`
			Scheduled                 []string        `json:"scheduled"`
			Response                  *string         `json:"response"`
			SHA256                    string          `json:"sha256"`
			Length                    int             `json:"length"`
			Calls                     json.RawMessage `json:"calls"`
		} `json:"steps"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	now, err := time.Parse(time.RFC3339Nano, corpus.Now)
	if err != nil {
		t.Fatal(err)
	}
	stores := seed(decodeDocs(t, corpus.Users), decodeDocs(t, corpus.Profiles), decodeDocs(t, corpus.Memories))
	countries := &fakeCountries{cached: corpus.Countries}
	recorder := &portraitCalls{}
	h, err := NewAdminUsers(AdminUsersConfig{
		Config:         Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return now }},
		Users:          stores.users,
		Profiles:       stores.profiles,
		Matthias:       stores.matthias,
		Purge:          func(context.Context, string) (userdata.Purged, error) { return userdata.Purged{}, nil },
		Countries:      countries,
		NetworkStatus:  ipgeo.Status,
		AdminUsernames: []string{"root"},
		Gateway:        recorder,
		Memory:         recorder,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(corpus.Steps) < 40 {
		t.Fatalf("corpus too small: %d", len(corpus.Steps))
	}
	for i, step := range corpus.Steps {
		body := ""
		if step.Body != nil {
			body = *step.Body
		}
		r := httptest.NewRequest(step.Method, step.Path, strings.NewReader(body))
		r.RemoteAddr = "198.51.100.7:1234"
		r.Header.Set("Authorization", "Bearer "+longToken(step.User))
		if step.Body != nil {
			r.Header.Set("Content-Type", jsonCT)
		}
		countries.scheduled = nil
		recorder.calls = nil
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		got := strings.TrimSuffix(w.Body.String(), "\n")
		ok := w.Code == step.Status && fmt.Sprint(countries.scheduled) == fmt.Sprint(append([]string{}, step.Scheduled...))
		calls := ""
		if len(recorder.calls) > 0 {
			list := bson.A{}
			for _, c := range recorder.calls {
				list = append(list, c)
			}
			encoded, err := pydoc.Encode(list)
			if err != nil {
				t.Fatal(err)
			}
			calls = string(encoded)
		}
		if calls != string(step.Calls) {
			ok = false
			t.Errorf("step %d %s calls:\ngot  %s\nwant %s", i, step.Label, calls, step.Calls)
		}
		switch {
		case step.Status == 500: // main.py's generic handler, not the router's
		case step.Response != nil:
			ok = ok && got == *step.Response
		default:
			sum := sha256.Sum256([]byte(got))
			ok = ok && hex.EncodeToString(sum[:]) == step.SHA256 && len(got) == step.Length
		}
		if !ok {
			want := ""
			if step.Response != nil {
				want = *step.Response
			}
			t.Errorf("step %d %s:\ngot  %d %v %s\nwant %d %v %s", i, step.Label, w.Code, countries.scheduled, got, step.Status, step.Scheduled, want)
		}
	}
	for name, keys := range corpus.Stored {
		data := stores.stored(name)
		for key, want := range keys {
			got, _ := pydoc.Get(data, key)
			if want == nil || got != *want {
				t.Errorf("%s %s stored %v want %v", name, key, got, *want)
			}
		}
	}
}

func TestAdminUsersMatchesPythonCorpus(t *testing.T) {
	replayAdminUsersCorpus(t, func(users, profiles, memories []bson.D) adminUsersStores {
		mem := &profileMem{docs: map[string]bson.D{}}
		for _, doc := range profiles {
			id, _ := pydoc.Get(doc, "_id")
			mem.docs[id.(string)] = doc
		}
		matthias := memMatthias{}
		for _, doc := range memories {
			id, _ := pydoc.Get(doc, "_id")
			matthias[id.(string)] = doc
		}
		return adminUsersStores{
			users: &memAccounts{docs: users}, profiles: profilestore.New(batchProfiles{mem}), matthias: matthias,
			stored: func(name string) bson.D {
				data, _ := pydoc.Get(mem.docs[name], "data")
				d, _ := data.(bson.D)
				return d
			},
		}
	})
}

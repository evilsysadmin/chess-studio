package gamesapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesrun"
)

type runsStep struct {
	Label   string      `json:"label"`
	Method  string      `json:"method"`
	Path    string      `json:"path"`
	User    string      `json:"user"`
	Headers [][2]string `json:"headers"`
	Body    *string     `json:"body"`
	Seed    int64       `json:"seed"`
	RunID   string      `json:"runId"`
	Now     string      `json:"now"`
	Status  int         `json:"status"`
	Resp    *string     `json:"response"`
	SHA256  string      `json:"sha256"`
	Length  int         `json:"length"`
}

func longToken(subject string) string {
	enc := base64.RawURLEncoding
	header := enc.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claims, _ := json.Marshal(map[string]any{"sub": subject, "sv": 0, "exp": time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC).Unix()})
	payload := enc.EncodeToString(claims)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(header + "." + payload))
	return header + "." + payload + "." + enc.EncodeToString(mac.Sum(nil))
}

// replayRunsCorpus replays scripts/chronicles_runs_parity_corpus.py's flow
// against a run store and returns the number of steps checked.
func replayRunsCorpus(t *testing.T, store chroniclesrun.Store) int {
	t.Helper()
	data, err := os.ReadFile("testdata/python_chronicles_runs_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Steps []runsStep `json:"steps"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	var now time.Time
	var seed int64
	var runID string
	h, err := NewChroniclesRuns(ChroniclesRunsConfig{
		Config:   Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return now }},
		Runs:     store,
		NewSeed:  func() int64 { return seed },
		NewRunID: func() string { return runID },
	})
	if err != nil {
		t.Fatal(err)
	}
	failures := 0
	for i, step := range corpus.Steps {
		now, err = time.Parse("2006-01-02T15:04:05.000000", step.Now)
		if err != nil {
			t.Fatal(err)
		}
		seed, runID = step.Seed, step.RunID
		var body *strings.Reader
		if step.Body != nil {
			body = strings.NewReader(*step.Body)
		} else {
			body = strings.NewReader("")
		}
		r := httptest.NewRequest(step.Method, step.Path, body)
		r.RemoteAddr = "198.51.100.7:1234"
		r.Header.Set("Authorization", "Bearer "+longToken(step.User))
		if step.Body != nil {
			r.Header.Set("Content-Type", jsonCT)
		}
		for _, pair := range step.Headers {
			if strings.EqualFold(pair[0], "Content-Type") {
				r.Header.Del("Content-Type")
			}
		}
		for _, pair := range step.Headers {
			r.Header.Add(pair[0], pair[1])
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		got := strings.TrimSuffix(w.Body.String(), "\n")
		sum := sha256.Sum256([]byte(got))
		ok := w.Code == step.Status
		switch {
		case step.Resp != nil && strings.Contains(*step.Resp, `"type":"json_invalid"`):
			// Python's json error position and message are not reproduced.
			ok = ok && strings.Contains(got, `"type":"json_invalid"`)
		case step.Resp != nil:
			ok = ok && got == *step.Resp
		default:
			ok = ok && hex.EncodeToString(sum[:]) == step.SHA256 && len(got) == step.Length
		}
		if !ok {
			failures++
			want := step.SHA256
			if step.Resp != nil {
				want = *step.Resp
			}
			if len(got) > 3000 {
				got = got[:3000]
			}
			t.Errorf("step %d %s (%s %s):\ngot  %d %s\nwant %d %s", i, step.Label, step.Method, step.Path, w.Code, got, step.Status, want)
			if failures > 4 {
				t.FailNow()
			}
		}
	}
	return len(corpus.Steps)
}

func TestChroniclesRunsMatchesPythonCorpus(t *testing.T) {
	if n := replayRunsCorpus(t, chroniclesrun.NewMemory()); n < 90 {
		t.Fatalf("corpus too small: %d steps", n)
	}
}

func TestChroniclesRunsRoute(t *testing.T) {
	for _, c := range []struct {
		method, path, pattern, id string
	}{
		{"POST", "/api/chronicles/runs", ChroniclesRunCreatePattern, ""},
		{"GET", "/api/chronicles/runs", ChroniclesRunListPattern, ""},
		{"DELETE", "/api/chronicles/runs/r1", ChroniclesRunDeletePattern, "r1"},
		{"GET", "/api/chronicles/runs/r1", ChroniclesRunReadPattern, "r1"},
		{"GET", "/api/chronicles/runs/r1/bootstrap", ChroniclesRunBootstrapPattern, "r1"},
		{"PUT", "/api/chronicles/runs/r1/checkpoint", ChroniclesRunCheckpointPattern, "r1"},
		{"PUT", "/api/chronicles/runs", "", ""},
		{"PUT", "/api/chronicles/runs/r1", "", ""},
		{"GET", "/api/chronicles/runs/r1/checkpoint", "", ""},
		{"PUT", "/api/chronicles/runs//checkpoint", "", ""},
		{"GET", "/api/chronicles/runs/a/b", "", ""},
		{"GET", "/api/chronicles/runs/", "", ""},
	} {
		pattern, id, ok := ChroniclesRunsRoute(httptest.NewRequest(c.method, c.path, nil))
		if ok != (c.pattern != "") || (ok && (pattern != c.pattern || id != c.id)) {
			t.Errorf("%s %s: %q %q %v", c.method, c.path, pattern, id, ok)
		}
	}
	r := httptest.NewRequest(http.MethodOptions, "/api/chronicles/runs", nil)
	r.Header.Set("Access-Control-Request-Method", "POST")
	if pattern, _, ok := ChroniclesRunsRoute(r); !ok || pattern != ChroniclesRunCreatePattern {
		t.Errorf("preflight: %q %v", pattern, ok)
	}
}

func TestChroniclesSavesAreOwnerScopedAndDeleteOnlyOne(t *testing.T) {
	store := chroniclesrun.NewMemory()
	now := time.Date(2026, 10, 9, 15, 0, 0, 0, time.UTC)
	for _, r := range []struct{ id, owner string }{{"alice-one", "alice"}, {"alice-two", "alice"}, {"bob-one", "bob"}} {
		_, err := store.Create(context.Background(), chroniclesrun.NewRun{
			RunID: r.id, Owner: r.owner, Seed: 1, MapID: "swordhaven-square",
			ContentVersion: 1, ManifestRevision: "rev", Fingerprint: "test",
			Now: now,
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	h, err := NewChroniclesRuns(ChroniclesRunsConfig{Config: Config{
		Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret,
	}, Runs: store})
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, nil)
		r.Header.Set("Authorization", "Bearer "+longToken("alice"))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	list := request("GET", "/api/chronicles/runs")
	if list.Code != 200 || !strings.Contains(list.Body.String(), "alice-one") ||
		!strings.Contains(list.Body.String(), "alice-two") ||
		strings.Contains(list.Body.String(), "bob-one") ||
		strings.Contains(list.Body.String(), "worldFlags") {
		t.Fatalf("owner-scoped summaries: %d %s", list.Code, list.Body.String())
	}
	if denied := request("DELETE", "/api/chronicles/runs/bob-one"); denied.Code != 404 {
		t.Fatalf("foreign delete: %d", denied.Code)
	}
	if deleted := request("DELETE", "/api/chronicles/runs/alice-one"); deleted.Code != 204 || deleted.Body.Len() != 0 {
		t.Fatalf("expected empty 204: %d %s", deleted.Code, deleted.Body.String())
	}
	if repeated := request("DELETE", "/api/chronicles/runs/alice-one"); repeated.Code != 404 {
		t.Fatalf("repeat delete: %d", repeated.Code)
	}
	if stored, err := store.Get(context.Background(), "bob-one", "bob"); err != nil || stored == nil {
		t.Fatalf("foreign run altered: %v %v", stored, err)
	}
	if got := request("GET", "/api/chronicles/runs"); strings.Contains(got.Body.String(), "alice-one") {
		t.Fatalf("deleted run still listed: %s", got.Body.String())
	}
}

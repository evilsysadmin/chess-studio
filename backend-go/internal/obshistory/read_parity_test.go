package obshistory

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

const cursorRaises = "__cursor_raises__"

type historyCase struct {
	From     *string `json:"from"`
	To       *string `json:"to"`
	Error    string  `json:"error"`
	Message  string  `json:"message"`
	Response *string `json:"response"`
	SHA256   string  `json:"sha256"`
	Length   int     `json:"length"`
}

type historyScenario struct {
	Database bool              `json:"database"`
	Legacy   []json.RawMessage `json:"legacy"`
	Current  []json.RawMessage `json:"current"`
	Cases    []historyCase     `json:"cases"`
}

func loadHistoryCorpus(t *testing.T) (time.Time, []historyScenario) {
	t.Helper()
	data, err := os.ReadFile("testdata/python_history_read_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Now       string            `json:"now"`
		Scenarios []historyScenario `json:"scenarios"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	now, err := time.Parse(time.RFC3339Nano, corpus.Now)
	if err != nil {
		t.Fatal(err)
	}
	if len(corpus.Scenarios) < 50 {
		t.Fatalf("corpus too small: %d", len(corpus.Scenarios))
	}
	return now, corpus.Scenarios
}

func decodeBuckets(t *testing.T, raw []json.RawMessage) []bson.D {
	t.Helper()
	out := make([]bson.D, 0, len(raw))
	for _, r := range raw {
		v, err := pydoc.Decode(r)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, v.(bson.D))
	}
	return out
}

// memReader is the corpus' fake database: natural order, and a marker
// document where the cursor fails.
type memReader map[string][]bson.D

func numeric(v any) float64 {
	switch n := v.(type) {
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	case float64:
		return n
	}
	panic(v)
}

func (m memReader) Buckets(_ context.Context, collection string, lower, upper int64, each func(bson.D) error) error {
	for _, doc := range m[collection] {
		if raises, _ := pydoc.Get(doc, cursorRaises); raises == true {
			return errors.New("cursor")
		}
		id, _ := pydoc.Get(doc, "_id")
		if f := numeric(id); f >= float64(lower) && f <= float64(upper) {
			if err := each(doc); err != nil {
				return err
			}
		}
	}
	return nil
}

func checkHistoryCase(t *testing.T, label string, c historyCase, got bson.D, err error) {
	t.Helper()
	var rangeErr *RangeError
	switch {
	case c.Error == "ValueError":
		if !errors.As(err, &rangeErr) || rangeErr.Message != c.Message {
			t.Errorf("%s: got %v want ValueError %q", label, err, c.Message)
		}
	case c.Error != "":
		if err == nil || errors.As(err, &rangeErr) {
			t.Errorf("%s: got %v want %s", label, err, c.Error)
		}
	case err != nil:
		t.Errorf("%s: unexpected error %v", label, err)
	default:
		encoded, encErr := pydoc.Encode(got)
		if encErr != nil {
			t.Fatalf("%s: %v", label, encErr)
		}
		if c.Response != nil {
			if string(encoded) != *c.Response {
				t.Errorf("%s:\ngot  %s\nwant %s", label, encoded, *c.Response)
			}
			return
		}
		sum := sha256.Sum256(encoded)
		if hex.EncodeToString(sum[:]) != c.SHA256 || len(encoded) != c.Length {
			t.Errorf("%s: sha mismatch (len %d want %d)\n%s", label, len(encoded), c.Length, encoded)
		}
	}
}

func str(p *string) string {
	if p == nil {
		return "None"
	}
	return *p
}

func TestHistoryMatchesPythonCorpus(t *testing.T) {
	now, scenarios := loadHistoryCorpus(t)
	for i, s := range scenarios {
		var reader BucketReader
		if s.Database {
			reader = memReader{LegacyCollectionName: decodeBuckets(t, s.Legacy), CollectionName: decodeBuckets(t, s.Current)}
		}
		for j, c := range s.Cases {
			got, err := History(context.Background(), reader, nil, c.From, c.To, now)
			checkHistoryCase(t, fmt.Sprintf("scenario %d case %d %s → %s", i, j, str(c.From), str(c.To)), c, got, err)
		}
	}
}

func TestUnsafeKeyMatchesCPython(t *testing.T) {
	// Generated from CPython 3.13 _unsafe_key.
	for in, want := range map[string]string{
		"R0VUIC9hcGk": "GET /api", "": "", "%%": "", "é": "unknown", "YQ": "a", "YQ=": "a", "Y": "unknown",
		"YWJj!ZA": "unknown", "w6k": "é", "7Q": "unknown", "YW=Jj": "abc", "Y=Q": "unknown", "gA": "unknown",
		"YQ==YWJj": "unknown", "+/8": "unknown", "____": "unknown", "_-_": "unknown", "YWJjZA=x": "unknown",
		"YWJ=jZA": "unknown", "YQ=x=": "a\f", "YQ=!=": "a",
	} {
		if got := unsafeKey(in); got != want {
			t.Errorf("unsafeKey(%q) = %q want %q", in, got, want)
		}
	}
}

func TestPendingFeedsTheHistory(t *testing.T) {
	r := New(nil)
	at := time.Date(2026, 10, 5, 12, 1, 0, 0, time.UTC)
	r.now = func() time.Time { return at }
	r.RecordHTTP("GET", "/api/status", 200, 30, "v1")
	r.RecordPresence(4)
	from := "2026-10-05T11:00:00Z"
	got, err := History(context.Background(), nil, r, &from, nil, at.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	http, _ := pydoc.Get(got, "http")
	samples, _ := pydoc.Get(http.(bson.D), "samples")
	p50, _ := pydoc.Get(http.(bson.D), "p50_ms")
	rng, _ := pydoc.Get(got, "range")
	persistent, _ := pydoc.Get(rng.(bson.D), "persistent")
	if samples != int64(1) || p50 != 50.0 || persistent != false {
		t.Fatalf("history from pending: %v", got)
	}
}

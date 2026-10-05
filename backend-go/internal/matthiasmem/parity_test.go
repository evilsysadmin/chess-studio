package matthiasmem

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

type corpusCase struct {
	Name          string          `json:"name"`
	Doc           json.RawMessage `json:"doc"`
	Summary       json.RawMessage `json:"summary"`
	SummaryError  string          `json:"summary_error"`
	Briefing      string          `json:"briefing"`
	Episodic      json.RawMessage `json:"episodic"`
	EpisodicError string          `json:"episodic_error"`
}

func canonical(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	v, err := pydoc.Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	out, err := pydoc.Encode(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
}

func encode(t *testing.T, v any) string {
	t.Helper()
	out, err := pydoc.Encode(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
}

func TestSummaryMatchesPythonCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/python_matthias_memory_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Now   string       `json:"now"`
		Cases []corpusCase `json:"cases"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	now, err := time.Parse(time.RFC3339Nano, corpus.Now)
	if err != nil {
		t.Fatal(err)
	}
	if len(corpus.Cases) < 200 {
		t.Fatalf("corpus too small: %d", len(corpus.Cases))
	}
	failures := 0
	for _, c := range corpus.Cases {
		decoded, err := pydoc.Decode(c.Doc)
		if err != nil {
			t.Fatal(err)
		}
		doc, _ := decoded.(bson.D)
		summary, sumErr := UserSummary(doc, now)
		switch {
		case c.SummaryError != "" && sumErr == nil:
			t.Errorf("%s: Python raised %s, Go answered %s", c.Name, c.SummaryError, encode(t, summary.Doc))
			failures++
		case c.SummaryError == "" && sumErr != nil:
			t.Errorf("%s: Go failed (%v) where Python answered", c.Name, sumErr)
			failures++
		case sumErr == nil:
			if got, want := encode(t, summary.Doc), canonical(t, c.Summary); got != want {
				t.Errorf("%s summary:\n got %s\nwant %s", c.Name, got, want)
				failures++
			}
			if got := summary.Briefing(); got != c.Briefing {
				t.Errorf("%s briefing:\n got %q\nwant %q", c.Name, got, c.Briefing)
				failures++
			}
		}
		episodic, epErr := EpisodicSummary(doc, now)
		switch {
		case c.EpisodicError != "" && epErr == nil:
			t.Errorf("%s: Python's episodic summary raised %s", c.Name, c.EpisodicError)
			failures++
		case c.EpisodicError == "" && epErr != nil:
			t.Errorf("%s: Go's episodic summary failed: %v", c.Name, epErr)
			failures++
		case epErr == nil:
			if got, want := encode(t, episodic), canonical(t, c.Episodic); got != want {
				t.Errorf("%s episodic:\n got %s\nwant %s", c.Name, got, want)
				failures++
			}
		}
		if failures > 8 {
			t.Fatal("too many mismatches")
		}
	}
}

func TestAdminStatusMatchesPythonCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/python_matthias_memory_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cases []corpusCase `json:"cases"`
		Admin []struct {
			Start  int             `json:"start"`
			Status json.RawMessage `json:"status"`
			Error  string          `json:"error"`
		} `json:"admin"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	var readable, all []bson.D
	for _, c := range corpus.Cases {
		decoded, _ := pydoc.Decode(c.Doc)
		doc, _ := decoded.(bson.D)
		all = append(all, doc)
		if c.SummaryError == "" {
			readable = append(readable, doc)
		}
	}
	var groups [][]bson.D
	for i := 0; i < len(readable); i += 8 {
		groups = append(groups, readable[i:min(i+8, len(readable))])
	}
	for _, i := range []int{0, 120, 228} {
		groups = append(groups, all[i:min(i+12, len(all))])
	}
	if len(groups) != len(corpus.Admin) {
		t.Fatalf("groups %d, Python %d", len(groups), len(corpus.Admin))
	}
	for i, want := range corpus.Admin {
		got, err := AdminStatus(groups[i], "memory")
		switch {
		case want.Error != "" && err == nil:
			t.Errorf("group %d: Python raised %s", i, want.Error)
		case want.Error == "" && err != nil:
			t.Errorf("group %d: Go failed: %v", i, err)
		case err == nil && encode(t, got) != canonical(t, want.Status):
			t.Errorf("group %d:\n got %s\nwant %s", i, encode(t, got), canonical(t, want.Status))
		}
	}
}

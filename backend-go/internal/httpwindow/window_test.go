package httpwindow

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

type clock struct{ wall, mono float64 }

func TestWindowMatchesPythonCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/python_http_window_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Start    float64   `json:"start"`
		Methods  []string  `json:"methods"`
		Routes   []string  `json:"routes"`
		Releases []*string `json:"releases"`
		Cases    []struct {
			Events       [][6]float64 `json:"events"`
			Ready        []float64    `json:"ready"`
			Now          float64      `json:"now"`
			ReadyResults [][2]any     `json:"readyResults"`
			Response     *string      `json:"response"`
			SHA256       string       `json:"sha256"`
			Length       int          `json:"length"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Cases) < 50 {
		t.Fatalf("corpus too small: %d", len(corpus.Cases))
	}
	overflowed := false
	for i, c := range corpus.Cases {
		clk := &clock{wall: corpus.Start, mono: 50}
		w := newWindow(func() float64 { return clk.wall }, func() float64 { return clk.mono })
		for j, delay := range c.Ready {
			clk.mono = 50 + delay
			ms, first := w.RecordReady()
			if want := c.ReadyResults[j]; ms != want[0].(float64) || first != want[1].(bool) {
				t.Errorf("case %d ready %d: got %v %v want %v", i, j, ms, first, want)
			}
		}
		for _, e := range c.Events {
			clk.wall = e[0]
			release := ""
			if r := corpus.Releases[int(e[5])]; r != nil {
				release = *r
			}
			w.Record(corpus.Methods[int(e[1])], corpus.Routes[int(e[2])], int(e[3]), e[4], release)
		}
		overflowed = overflowed || len(c.Events) > Capacity
		clk.wall = c.Now
		got, err := pydoc.Encode(w.Metrics())
		if err != nil {
			t.Fatal(err)
		}
		if c.Response != nil {
			if string(got) != *c.Response {
				t.Errorf("case %d:\ngot  %s\nwant %s", i, got, *c.Response)
			}
			continue
		}
		sum := sha256.Sum256(got)
		if hex.EncodeToString(sum[:]) != c.SHA256 || len(got) != c.Length {
			t.Errorf("case %d: sha mismatch\n%s", i, got)
		}
	}
	if !overflowed {
		t.Fatal("no case overflows the ring")
	}
}

func TestNilWindowIsInert(t *testing.T) {
	var w *Window
	w.Record("GET", "/x", 200, 1, "v1")
	if _, first := w.RecordReady(); first {
		t.Fatal("nil window recorded readiness")
	}
	if got := w.Metrics(); len(got) != 6 {
		t.Fatalf("nil window metrics: %v", got)
	}
}

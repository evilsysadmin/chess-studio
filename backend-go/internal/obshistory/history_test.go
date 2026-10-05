package obshistory

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strconv"
	"testing"
	"time"
)

type fakeStore struct {
	fail    bool
	indexes int
	writes  map[int64]*delta
}

func (f *fakeStore) EnsureRetention(context.Context) error {
	f.indexes++
	return nil
}

func (f *fakeStore) UpsertBucket(_ context.Context, bucket int64, incs map[string]int64, maxima map[string]float64) error {
	if f.fail {
		return errors.New("mongo down")
	}
	if f.writes == nil {
		f.writes = map[int64]*delta{}
	}
	d := f.writes[bucket]
	if d == nil {
		d = newDelta()
		f.writes[bucket] = d
	}
	d.merge(&delta{incs: incs, maxima: maxima})
	return nil
}

type corpusSample struct {
	Kind       string   `json:"kind"`
	At         int64    `json:"at"`
	Method     string   `json:"method"`
	Route      string   `json:"route"`
	Status     int      `json:"status"`
	LatencyMS  float64  `json:"latencyMs"`
	Release    string   `json:"release"`
	Online     int      `json:"online"`
	EventType  string   `json:"eventType"`
	MetricName string   `json:"metricName"`
	Value      *float64 `json:"value"`
	ErrorName  string   `json:"errorName"`
	Context    string   `json:"context"`

	Provider     string  `json:"provider"`
	AIEventType  string  `json:"event_type"`
	RequestKind  string  `json:"request_kind"`
	Channel      *string `json:"channel"`
	AILatency    float64 `json:"latency_ms"`
	Reason       string  `json:"reason"`
	InputTokens  *int64  `json:"input_tokens"`
	OutputTokens *int64  `json:"output_tokens"`
	Model        *string `json:"model"`
	WorkerError  *string `json:"worker_error"`
}

func deref[T any](v *T) T {
	var zero T
	if v == nil {
		return zero
	}
	return *v
}

// TestHistoryDeltasMatchPython replays scripts/observability_history_parity_corpus.py
// and requires the exact $inc/$max paths and values Python would flush.
func TestHistoryDeltasMatchPython(t *testing.T) {
	raw, err := os.ReadFile("testdata/python_history_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Samples []corpusSample `json:"samples"`
		Buckets map[string]struct {
			Inc map[string]float64 `json:"inc"`
			Max map[string]float64 `json:"max"`
		} `json:"buckets"`
	}
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	store := &fakeStore{}
	r := New(store)
	for _, s := range corpus.Samples {
		at := time.Unix(s.At, 0)
		r.now = func() time.Time { return at }
		switch s.Kind {
		case "http":
			r.RecordHTTP(s.Method, s.Route, s.Status, s.LatencyMS, s.Release)
		case "presence":
			r.RecordPresence(s.Online)
		case "frontend":
			r.RecordFrontend(FrontendEvent{EventType: s.EventType, MetricName: s.MetricName, Value: s.Value, ErrorName: s.ErrorName, Context: s.Context, Release: s.Release})
		case "ai":
			r.RecordAI(AIEvent{
				Provider: s.Provider, EventType: s.AIEventType, RequestKind: s.RequestKind, Channel: deref(s.Channel),
				LatencyMS: s.AILatency, Reason: s.Reason, InputTokens: deref(s.InputTokens), OutputTokens: deref(s.OutputTokens),
				Model: deref(s.Model), WorkerError: deref(s.WorkerError),
			})
		}
	}
	if err := r.Flush(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(store.writes) != len(corpus.Buckets) {
		t.Fatalf("buckets %d, Python %d", len(store.writes), len(corpus.Buckets))
	}
	for key, want := range corpus.Buckets {
		bucket, _ := strconv.ParseInt(key, 10, 64)
		got := store.writes[bucket]
		if got == nil {
			t.Fatalf("bucket %s missing", key)
		}
		gotIncs := map[string]float64{}
		for path, value := range got.incs {
			gotIncs[path] = float64(value)
		}
		if !reflect.DeepEqual(gotIncs, want.Inc) {
			for path, value := range want.Inc {
				if gotIncs[path] != value {
					t.Errorf("bucket %s $inc %s = %v, Python %v", key, path, gotIncs[path], value)
				}
			}
			for path := range gotIncs {
				if _, ok := want.Inc[path]; !ok {
					t.Errorf("bucket %s extra $inc %s", key, path)
				}
			}
		}
		if !reflect.DeepEqual(got.maxima, want.Max) {
			t.Errorf("bucket %s $max %v, Python %v", key, got.maxima, want.Max)
		}
	}
	if store.indexes != 1 {
		t.Fatalf("retention index ensured %d times", store.indexes)
	}
}

func TestFailedFlushKeepsTheSamples(t *testing.T) {
	store := &fakeStore{fail: true}
	r := New(store)
	at := time.Unix(1_790_000_100, 0)
	r.now = func() time.Time { return at }
	r.RecordHTTP("GET", "/api/status", 200, 12, "")
	r.RecordPresence(4)
	if err := r.Flush(context.Background()); err == nil {
		t.Fatal("flush should fail")
	}
	r.RecordPresence(9)
	store.fail = false
	if err := r.Flush(context.Background()); err != nil {
		t.Fatal(err)
	}
	got := store.writes[bucketStart(at)]
	if got.incs["presence.samples"] != 2 || got.incs["presence.online_sum"] != 13 || got.maxima["presence.online_max"] != 9 || got.incs["http.samples"] != 1 {
		t.Fatalf("requeued deltas %+v", got)
	}
	if err := r.Flush(context.Background()); err != nil || len(r.pending) != 0 {
		t.Fatalf("second flush resent: %v %v", err, r.pending)
	}
}

func TestNilRecorderIsInert(t *testing.T) {
	var r *Recorder
	r.RecordHTTP("GET", "/", 200, 1, "")
	r.RecordPresence(1)
	r.RecordFrontend(FrontendEvent{})
	if err := r.Flush(context.Background()); err != nil {
		t.Fatal(err)
	}
}

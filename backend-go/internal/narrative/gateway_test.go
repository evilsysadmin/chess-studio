package narrative

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

func encodeDoc(t *testing.T, v any) string {
	t.Helper()
	out, err := pydoc.Encode(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(out)
}

func TestMetricsMatchPythonCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/python_narrative_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Metrics struct {
			Events []struct {
				At           int64   `json:"at"`
				Provider     string  `json:"provider"`
				EventType    string  `json:"event_type"`
				LatencyMS    float64 `json:"latency_ms"`
				Reason       string  `json:"reason"`
				Text         string  `json:"text"`
				RequestKind  string  `json:"request_kind"`
				InputTokens  int64   `json:"input_tokens"`
				OutputTokens int64   `json:"output_tokens"`
				Model        *string `json:"model"`
				WorkerError  *string `json:"worker_error"`
			} `json:"events"`
			Summary    json.RawMessage `json:"summary"`
			DailyToday json.RawMessage `json:"daily_today"`
			Since      int64           `json:"since"`
		} `json:"metrics"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	g := New(Config{Env: func(string) string { return "" }})
	for _, e := range corpus.Metrics.Events {
		at := time.Unix(e.At, 500_000_000)
		g.now = func() time.Time { return at }
		model, workerErr := "", ""
		if e.Model != nil {
			model = *e.Model
		}
		if e.WorkerError != nil {
			workerErr = *e.WorkerError
		}
		g.record(e.Provider, e.EventType, e.RequestKind, Outcome{Reason: e.Reason, LatencyMS: e.LatencyMS, InputTokens: e.InputTokens, OutputTokens: e.OutputTokens, Model: model, WorkerError: workerErr}, e.Text)
	}
	got := pydoc.Delete(pydoc.Delete(g.Metrics(), "circuit"), "enabled")
	want, _ := pydoc.Decode(corpus.Metrics.Summary)
	if encodeDoc(t, got) != encodeDoc(t, want) {
		t.Fatalf("metrics:\n got %s\nwant %s", encodeDoc(t, got), encodeDoc(t, want))
	}
	wantDaily, _ := pydoc.Decode(corpus.Metrics.DailyToday)
	if gotDaily := g.EventMetrics("matthias_daily", corpus.Metrics.Since); encodeDoc(t, gotDaily) != encodeDoc(t, wantDaily) {
		t.Fatalf("daily metrics:\n got %s\nwant %s", encodeDoc(t, gotDaily), encodeDoc(t, wantDaily))
	}
}

type fakeWorker struct {
	*httptest.Server
	calls  atomic.Int64
	status int
	body   string
	delay  time.Duration
	last   *http.Request
	raw    []byte
}

func newWorker(t *testing.T, status int, body string) *fakeWorker {
	t.Helper()
	w := &fakeWorker{status: status, body: body}
	w.Server = httptest.NewServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		w.calls.Add(1)
		w.last = r
		w.raw, _ = io.ReadAll(r.Body)
		if w.delay > 0 {
			time.Sleep(w.delay)
		}
		rw.WriteHeader(w.status)
		_, _ = io.WriteString(rw, w.body)
	}))
	t.Cleanup(w.Close)
	return w
}

func gatewayFor(url string, extra map[string]string) *Gateway {
	env := map[string]string{"CF_AI_WORKER_URL": url + "/", "CHESS_AI_SHARED_SECRET": "s3cret"}
	for k, v := range extra {
		env[k] = v
	}
	return New(Config{Env: func(k string) string { return env[k] }})
}

var blunderFacts = bson.D{{Key: "san", Value: "Qxd5"}, {Key: "piece", Value: "dama"}, {Key: "password", Value: "hunter2"}}

func TestGenerateSignsTheDossierAndKeepsAGroundedLine(t *testing.T) {
	w := newWorker(t, 200, `{"text":"  Qxd5 deja la dama   colgando, bitte.  ","usage":{"inputTokens":120,"outputTokens":9.7},"model":"@cf/qwen/qwen3"}`)
	g := gatewayFor(w.URL, nil)
	var lines []string
	g.log = func(l string) { lines = append(lines, l) }
	rid := "req-1"
	res := g.Generate(context.Background(), "blunder", blunderFacts, nil, nil, "default", &rid)
	if res.Provider != "cloudflare" || res.Text != "Qxd5 deja la dama colgando, bitte." || res.Model != "@cf/qwen/qwen3" {
		t.Fatalf("result %+v", res)
	}
	if w.last.URL.Path != "/narrative" || strings.Contains(string(w.raw), "hunter2") {
		t.Fatalf("path %s body %s", w.last.URL.Path, w.raw)
	}
	ts := w.last.Header.Get("x-chess-ai-timestamp")
	if w.last.Header.Get("x-chess-ai-signature") != Sign("s3cret", ts, w.raw) {
		t.Fatal("signature does not cover the sent bytes")
	}
	if !strings.HasPrefix(string(w.raw), `{"event_type":"blunder","facts":{"piece":"dama","san":"Qxd5"},"locale":"es-ES","request_id":"req-1","tone":"sarcastic"}`) {
		t.Fatalf("body %s", w.raw)
	}
	m := g.Metrics()
	usage, _ := pydoc.Get(m, "usage")
	if encodeDoc(t, usage) != `{"input_tokens":120,"output_tokens":9,"total_tokens":129,"estimated_neurons":0.829,"estimated_cost_usd":9e-06,"pricing_note":"Estimación de la ventana reciente; Cloudflare billing es la fuente de verdad."}` {
		t.Fatalf("usage %s", encodeDoc(t, usage))
	}
	if len(lines) != 1 || !strings.HasPrefix(lines[0], "INFO:     workers_ai_ok request_id=req-1 event_type=blunder request_kind=default channel=comments model=@cf/qwen/qwen3") {
		t.Fatalf("log %v", lines)
	}
}

func TestContractsFallBackLocally(t *testing.T) {
	cases := []struct {
		name, event, body, reason string
	}{
		{"ungrounded", "blunder", `{"text":"Su torre ya no existe."}`, "ungrounded_torre"},
		{"tuteo", "blunder", `{"text":"Qxd5. Te conviene pensar."}`, "register_tuteo:clitico:te"},
		{"portrait", "player_portrait", `{"text":"Demasiado corto."}`, "portrait_contract_rejected:too_short"},
		{"invalid", "blunder", `{"text":5}`, "invalid_payload"},
		{"empty", "blunder", `{"text":"   "}`, "empty_response"},
		{"not json", "blunder", `<html>`, "transport_error"},
		{"bad tokens", "blunder", `{"text":"Qxd5.","usage":{"inputTokens":"many"}}`, "transport_error"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := newWorker(t, 200, c.body)
			g := gatewayFor(w.URL, nil)
			res := g.Generate(context.Background(), c.event, blunderFacts, nil, nil, "", nil)
			if res.Provider != "local" || res.Text != Fallback(c.event, blunderFacts) {
				t.Fatalf("%+v", res)
			}
			reasons, _ := pydoc.Get(g.Metrics(), "reasons")
			if encodeDoc(t, reasons) != `{"`+c.reason+`":1}` {
				t.Fatalf("reasons %s", encodeDoc(t, reasons))
			}
			if encodeDoc(t, res.Doc())[:9] != `{"text":"` || strings.Contains(encodeDoc(t, res.Doc()), "model") {
				t.Fatalf("local doc %s", encodeDoc(t, res.Doc()))
			}
		})
	}
}

func TestWorkerErrorAndCircuitBreaker(t *testing.T) {
	w := newWorker(t, 502, `{"error":"AiError","error_name":"InferenceUpstreamError","error_code":3040}`)
	now := time.Unix(1_790_000_000, 0)
	g := gatewayFor(w.URL, nil)
	g.now = func() time.Time { return now }
	for i := 0; i < 3; i++ {
		if out := g.Request(context.Background(), "blunder", blunderFacts, nil, nil, nil); out.Reason != "http_502" || out.WorkerError != "AiError:InferenceUpstreamError:3040" {
			t.Fatalf("attempt %d: %+v", i, out)
		}
	}
	if out := g.Request(context.Background(), "blunder", blunderFacts, nil, nil, nil); out.Reason != "circuit_open" || w.calls.Load() != 3 {
		t.Fatalf("comments circuit must open after 3: %+v calls=%d", out, w.calls.Load())
	}
	// Other channels keep their own breaker.
	if out := g.Request(context.Background(), "post_game_autopsy", blunderFacts, nil, nil, nil); out.Reason != "http_502" {
		t.Fatalf("analysis channel: %+v", out)
	}
	now = now.Add(61 * time.Second)
	if out := g.Request(context.Background(), "blunder", blunderFacts, nil, nil, nil); out.Reason != "http_502" {
		t.Fatalf("half-open probe: %+v", out)
	}
	if out := g.Request(context.Background(), "blunder", blunderFacts, nil, nil, nil); out.Reason != "circuit_open" {
		t.Fatalf("a failed probe re-opens at once: %+v", out)
	}
	snap := g.CircuitSnapshot()
	if open, _ := pydoc.Get(snap, "open"); open != true {
		t.Fatalf("snapshot %s", encodeDoc(t, snap))
	}
	now = now.Add(61 * time.Second)
	w.status, w.body = 200, `{"text":"Qxd5 y la dama sufre."}`
	if out := g.Request(context.Background(), "blunder", blunderFacts, nil, nil, nil); out.Reason != "ok" {
		t.Fatalf("recovery: %+v", out)
	}
	if out := g.Request(context.Background(), "blunder", blunderFacts, nil, nil, nil); out.Reason != "ok" {
		t.Fatalf("closed again: %+v", out)
	}
}

func TestTimeoutDisabledAndUnconfigured(t *testing.T) {
	w := newWorker(t, 200, `{"text":"Qxd5."}`)
	w.delay = 700 * time.Millisecond
	g := gatewayFor(w.URL, map[string]string{"CF_AI_COMMENT_TIMEOUT_SECONDS": "0.5"})
	if out := g.Request(context.Background(), "blunder", blunderFacts, nil, nil, nil); out.Reason != "timeout" {
		t.Fatalf("timeout: %+v", out)
	}
	if out := gatewayFor(w.URL, map[string]string{"AI_NARRATIVE_ENABLED": "off"}).Request(context.Background(), "blunder", nil, nil, nil, nil); out.Reason != "disabled" {
		t.Fatalf("disabled: %+v", out)
	}
	if out := gatewayFor("", nil).Request(context.Background(), "blunder", nil, nil, nil, nil); out.Reason != "not_configured" {
		t.Fatalf("unconfigured: %+v", out)
	}
}

func TestPressureShedsRichWorkFirst(t *testing.T) {
	g := gatewayFor("http://unused", map[string]string{"CHESS_DEGRADED_INFLIGHT": "2", "CHESS_CRITICAL_INFLIGHT": "4"})
	g.Enter()
	g.Enter()
	if out := g.Request(context.Background(), "player_portrait", nil, nil, nil, nil); out.Reason != "adaptive_local_only" {
		t.Fatalf("degraded portrait: %+v", out)
	}
	g.Enter()
	g.Enter()
	if out := g.Request(context.Background(), "blunder", nil, nil, nil, nil); out.Reason != "adaptive_shed" || !g.ShouldShed(4) {
		t.Fatalf("critical: %+v", out)
	}
}

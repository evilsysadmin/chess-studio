package telemetry

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

type fakeSpans struct {
	mu    sync.Mutex
	spans []sdktrace.ReadOnlySpan
	fail  bool
}

func (f *fakeSpans) ExportSpans(_ context.Context, spans []sdktrace.ReadOnlySpan) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail {
		return errors.New("refused")
	}
	f.spans = append(f.spans, spans...)
	return nil
}
func (f *fakeSpans) Shutdown(context.Context) error { return nil }

type fakeLogs struct{ records int }

func (f *fakeLogs) Export(_ context.Context, records []sdklog.Record) error {
	f.records += len(records)
	return nil
}
func (f *fakeLogs) Shutdown(context.Context) error   { return nil }
func (f *fakeLogs) ForceFlush(context.Context) error { return nil }

func tracedRecorder(t *testing.T, spans sdktrace.SpanExporter, logs sdklog.Exporter) (*Recorder, Config) {
	t.Helper()
	cfg := ConfigFromEnv(lookupFrom(map[string]string{"OTEL_TRACES_SAMPLER": "always_on"}))
	opts := Options{SpanExporter: spans, Stdout: &strings.Builder{}}
	if logs != nil {
		opts.LogExporter = logs
		opts.MetricReader = sdkmetric.NewManualReader()
	}
	r, err := New(context.Background(), cfg, opts)
	if err != nil {
		t.Fatal(err)
	}
	return r, cfg
}

func encodeDoc(t *testing.T, v any) string {
	t.Helper()
	b, err := pydoc.Encode(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestServeContinuesTheCallersTrace(t *testing.T) {
	spans := &fakeSpans{}
	r, _ := tracedRecorder(t, spans, nil)
	req := httptest.NewRequest(http.MethodPost, "/api/narrative", nil)
	req.Header.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	var inner trace.SpanContext
	r.Serve("/api/narrative", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		inner = trace.SpanContextFromContext(req.Context())
		w.WriteHeader(http.StatusServiceUnavailable)
	}), httptest.NewRecorder(), req)
	if err := r.traceProvider.ForceFlush(context.Background()); err != nil {
		t.Fatal(err)
	}
	var server sdktrace.ReadOnlySpan
	for _, s := range spans.spans {
		if s.Name() == "POST /api/narrative" {
			server = s
		}
	}
	if server == nil || server.SpanKind() != trace.SpanKindServer || server.Parent().SpanID().String() != "00f067aa0ba902b7" ||
		server.SpanContext().TraceID().String() != "4bf92f3577b34da6a3ce929d0e0e4736" || inner.SpanID() != server.SpanContext().SpanID() ||
		server.Status().Code.String() != "Error" {
		t.Fatalf("server span %+v", server)
	}
	var startup bool
	for _, s := range spans.spans {
		startup = startup || (s.Name() == "chess-studio.startup" && s.SpanContext().TraceID().String() == r.startupTraceID)
	}
	if !startup {
		t.Fatal("no startup span")
	}
}

func TestTraceProbeConfirmsTheExactTrace(t *testing.T) {
	spans := &fakeSpans{}
	r, cfg := tracedRecorder(t, spans, nil)
	got := r.TraceProbe(context.Background(), cfg)
	ok, _ := field(got, "ok").(bool)
	id, _ := field(got, "traceId").(string)
	if !ok || len(id) != 32 || field(got, "exportResult") != "SUCCESS" || field(got, "serviceName") != "chess-studio-backend-go" {
		t.Fatalf("%s", encodeDoc(t, got))
	}
	found := false
	for _, s := range spans.spans {
		found = found || (s.Name() == "chess-studio.tempo.probe" && s.SpanContext().TraceID().String() == id && s.Parent().IsRemote())
	}
	if !found {
		t.Fatal("probe span not exported")
	}
	spans.fail = true
	failed := r.TraceProbe(context.Background(), cfg)
	if ok, _ := field(failed, "ok").(bool); ok || field(failed, "exportResult") != "FAILURE" || field(failed, "exportError") != "export_failed" {
		t.Fatalf("%s", encodeDoc(t, failed))
	}
	diag := encodeDoc(t, Diagnostics(r, cfg))
	for _, want := range []string{`"configured":true,`, `"providerBinding":"explicit"`, `"startupTraceId":"` + r.startupTraceID + `"`,
		`"traceExporter":{"attemptCount":`, `"lastResult":"FAILURE","lastError":"export_failed","lastHttpStatus":null}`} {
		if !strings.Contains(diag, want) {
			t.Fatalf("missing %s in %s", want, diag)
		}
	}
}

func TestProbesWithoutTraces(t *testing.T) {
	cfg := ConfigFromEnv(lookupFrom(map[string]string{}))
	r, err := New(context.Background(), cfg, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if got := encodeDoc(t, r.TraceProbe(context.Background(), cfg)); !strings.HasPrefix(got, `{"ok":false,"reason":"tracing_not_configured","diagnostics":{`) {
		t.Fatal(got)
	}
	got := encodeDoc(t, r.SignalProbe(context.Background(), cfg))
	if !strings.HasPrefix(got, `{"ok":false,"traceId":null,"signals":{"traces":{"configured":false,"flushed":false,"exported":false,"ok":false,"exportResult":null,"exportError":null,"httpStatus":null},"metrics":{"configured":false,"flushed":false},"logs":{"configured":false,"flushed":false,"exported":false,"ok":false,"exportResult":null,"exportError":null,"httpStatus":null}},"diagnostics":{`) {
		t.Fatal(got)
	}
	var nilRecorder *Recorder
	if got := encodeDoc(t, nilRecorder.SignalProbe(context.Background(), cfg)); !strings.Contains(got, `"initializationError":"disabled"`) {
		t.Fatal(got)
	}
}

func TestSignalProbeChecksEverySignal(t *testing.T) {
	logs := &fakeLogs{}
	r, cfg := tracedRecorder(t, &fakeSpans{}, logs)
	got := r.SignalProbe(context.Background(), cfg)
	if ok, _ := field(got, "ok").(bool); !ok || logs.records == 0 {
		t.Fatalf("%s records=%d", encodeDoc(t, got), logs.records)
	}
}

func TestTrackedTransportNamesTheHTTPStatus(t *testing.T) {
	collector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer collector.Close()
	cfg := ConfigFromEnv(lookupFrom(map[string]string{
		"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": collector.URL + "/otlp/v1/traces", "OTEL_TRACES_SAMPLER": "always_on",
	}))
	r, err := New(context.Background(), cfg, Options{Stdout: &strings.Builder{}})
	if err != nil {
		t.Fatal(err)
	}
	got := r.TraceProbe(context.Background(), cfg)
	if ok, _ := field(got, "ok").(bool); ok || field(got, "exportError") != "http_401" || field(got, "httpStatus") != int64(401) {
		t.Fatalf("%s", encodeDoc(t, got))
	}
	if diag := encodeDoc(t, Diagnostics(r, cfg)); !strings.Contains(diag, `"endpointPath":"/otlp/v1/traces"`) || strings.Contains(diag, "127.0.0.1") {
		t.Fatal(diag)
	}
}

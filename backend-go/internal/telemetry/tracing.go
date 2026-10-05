package telemetry

// OTLP traces for the requests Go serves natively, and the export
// bookkeeping Admin's observability panel and probes read (tracing.py's
// TrackingOTLPSpanExporter / TrackingOTLPLogExporter): force_flush only
// proves a queue drained, so delivery is judged by what the exporter and the
// HTTP transport actually reported.

import (
	"context"
	"crypto/rand"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"go.mongodb.org/mongo-driver/v2/bson"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

// exportTracker is _TRACE_EXPORT_STATE / _LOG_EXPORT_STATE.
type exportTracker struct {
	mu         sync.Mutex
	attempts   int64
	successes  int64
	failures   int64
	exported   int64
	lastResult string
	lastError  string
	lastHTTP   int
	recent     []string // trace ids of the last successful exports (128)
}

func (t *exportTracker) snapshot(countKey string) bson.D {
	t.mu.Lock()
	defer t.mu.Unlock()
	var status any
	if t.lastHTTP != 0 {
		status = int64(t.lastHTTP)
	}
	return bson.D{
		{Key: "attemptCount", Value: t.attempts},
		{Key: "successCount", Value: t.successes},
		{Key: "failureCount", Value: t.failures},
		{Key: countKey, Value: t.exported},
		{Key: "lastResult", Value: optional(t.lastResult)},
		{Key: "lastError", Value: optional(t.lastError)},
		{Key: "lastHttpStatus", Value: status},
	}
}

func (t *exportTracker) counts() (successes, exported int64, lastResult string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.successes, t.exported, t.lastResult
}

func (t *exportTracker) recentlyExported(traceID string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	for _, id := range t.recent {
		if id == traceID {
			return true
		}
	}
	return false
}

func (t *exportTracker) begin() {
	t.mu.Lock()
	t.attempts++
	t.mu.Unlock()
}

// finish mirrors the exporters' export(): SUCCESS counts the batch, any
// failure names the HTTP status when there was one.
func (t *exportTracker) finish(err error, count int, traceIDs []string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if err == nil {
		t.lastResult = "SUCCESS"
		t.successes++
		t.exported += int64(count)
		t.recent = append(t.recent, traceIDs...)
		if len(t.recent) > 128 {
			t.recent = t.recent[len(t.recent)-128:]
		}
		t.lastError = ""
		return
	}
	t.lastResult = "FAILURE"
	t.failures++
	switch {
	case t.lastHTTP != 0:
		t.lastError = "http_" + strconv.Itoa(t.lastHTTP)
	case t.lastError == "":
		t.lastError = "export_failed"
	}
}

// statusTransport records each OTLP request's HTTP status (or transport
// failure) for the tracker, as the exporters' _export override does.
type statusTransport struct {
	next    http.RoundTripper
	tracker *exportTracker
}

func (s statusTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := s.next.RoundTrip(req)
	s.tracker.mu.Lock()
	defer s.tracker.mu.Unlock()
	if err != nil {
		s.tracker.lastHTTP = 0
		s.tracker.lastError = transportErrorName(err)
		return nil, err
	}
	s.tracker.lastHTTP = resp.StatusCode
	return resp, nil
}

// transportErrorName is a requests-style class name for a failed send.
func transportErrorName(err error) string {
	var netErr net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &netErr) && netErr.Timeout()) {
		return "Timeout"
	}
	return "ConnectionError"
}

func trackedClient(tracker *exportTracker) *http.Client {
	return &http.Client{Transport: statusTransport{next: http.DefaultTransport, tracker: tracker}}
}

type trackingSpanExporter struct {
	next    sdktrace.SpanExporter
	tracker *exportTracker
}

func (e trackingSpanExporter) ExportSpans(ctx context.Context, spans []sdktrace.ReadOnlySpan) error {
	e.tracker.begin()
	err := e.next.ExportSpans(ctx, spans)
	ids := make([]string, 0, len(spans))
	for _, span := range spans {
		if id := span.SpanContext().TraceID(); id.IsValid() {
			ids = append(ids, id.String())
		}
	}
	e.tracker.finish(err, len(spans), ids)
	return err
}

func (e trackingSpanExporter) Shutdown(ctx context.Context) error { return e.next.Shutdown(ctx) }

type trackingLogExporter struct {
	next    sdklog.Exporter
	tracker *exportTracker
}

func (e trackingLogExporter) Export(ctx context.Context, records []sdklog.Record) error {
	e.tracker.begin()
	err := e.next.Export(ctx, records)
	e.tracker.finish(err, len(records), nil)
	return err
}

func (e trackingLogExporter) Shutdown(ctx context.Context) error   { return e.next.Shutdown(ctx) }
func (e trackingLogExporter) ForceFlush(ctx context.Context) error { return e.next.ForceFlush(ctx) }

// sampler is the SDK's OTEL_TRACES_SAMPLER / _ARG (an invalid ratio is 1.0).
func sampler(name, arg string) sdktrace.Sampler {
	ratio := 1.0
	if v, err := strconv.ParseFloat(strings.TrimSpace(arg), 64); err == nil && v >= 0 && v <= 1 {
		ratio = v
	}
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "always_on":
		return sdktrace.AlwaysSample()
	case "always_off":
		return sdktrace.NeverSample()
	case "traceidratio":
		return sdktrace.TraceIDRatioBased(ratio)
	case "parentbased_always_off":
		return sdktrace.ParentBased(sdktrace.NeverSample())
	case "parentbased_traceidratio":
		return sdktrace.ParentBased(sdktrace.TraceIDRatioBased(ratio))
	}
	return sdktrace.ParentBased(sdktrace.AlwaysSample())
}

func randomTraceIDs() (trace.TraceID, trace.SpanID) {
	var tid trace.TraceID
	var sid trace.SpanID
	for !tid.IsValid() {
		_, _ = rand.Read(tid[:])
	}
	for !sid.IsValid() {
		_, _ = rand.Read(sid[:])
	}
	return tid, sid
}

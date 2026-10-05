package telemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"go.opentelemetry.io/otel/attribute"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

type captureProcessor struct {
	mu      sync.Mutex
	records []sdklog.Record
}

func (c *captureProcessor) Enabled(context.Context, sdklog.EnabledParameters) bool { return true }
func (c *captureProcessor) OnEmit(_ context.Context, r *sdklog.Record) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.records = append(c.records, r.Clone())
	return nil
}
func (c *captureProcessor) Shutdown(context.Context) error   { return nil }
func (c *captureProcessor) ForceFlush(context.Context) error { return nil }

type fixture struct {
	rec    *Recorder
	reader *sdkmetric.ManualReader
	logs   *captureProcessor
	out    *bytes.Buffer
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	f := fixture{reader: sdkmetric.NewManualReader(), logs: &captureProcessor{}, out: &bytes.Buffer{}}
	cfg := Config{ServiceName: "chess-studio-backend-staging-go", Environment: "staging", Release: "abc123", TrustCloudflare: true}
	rec, err := New(context.Background(), cfg, Options{
		Username:     func(r *http.Request) string { return r.Header.Get("X-Test-User") },
		Stdout:       f.out,
		MetricReader: f.reader,
		LogProcessor: f.logs,
		InstanceID:   "go:test",
		now:          func() time.Time { return time.Unix(1_760_000_000, 0) },
	})
	if err != nil {
		t.Fatal(err)
	}
	f.rec = rec
	return f
}

func (f fixture) collect(t *testing.T) map[string]metricdata.Metrics {
	t.Helper()
	var rm metricdata.ResourceMetrics
	if err := f.reader.Collect(context.Background(), &rm); err != nil {
		t.Fatal(err)
	}
	out := map[string]metricdata.Metrics{}
	for _, scope := range rm.ScopeMetrics {
		if scope.Scope.Name != meterName {
			t.Errorf("scope %q", scope.Scope.Name)
		}
		for _, m := range scope.Metrics {
			out[m.Name] = m
		}
	}
	if name, _ := rm.Resource.Set().Value("service.name"); name.AsString() != "chess-studio-backend-staging-go" {
		t.Errorf("service.name=%q", name.AsString())
	}
	if id, _ := rm.Resource.Set().Value("service.instance.id"); id.AsString() != "go:test" {
		t.Errorf("service.instance.id=%q", id.AsString())
	}
	return out
}

var durationField = regexp.MustCompile(`"duration_ms":[0-9.]+(e-[0-9]+)?,`)

func TestNativeRequestIsRecordedLikePython(t *testing.T) {
	f := newFixture(t)
	req := httptest.NewRequest(http.MethodPost, "/api/pvp/matches/m-1/move", nil)
	req.RemoteAddr = "172.18.0.5:5000"
	req.Header.Set("CF-Connecting-IP", "81.40.1.2")
	req.Header.Set("CF-IPCountry", "es")
	req.Header.Set("X-Request-ID", "req-123456")
	req.Header.Set("X-Client-Release", "v2026.10.03")
	req.Header.Set("X-Test-User", "alice")
	w := httptest.NewRecorder()
	f.rec.Serve("/api/pvp/matches/{match_id}/move", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(20 * time.Millisecond)
		w.WriteHeader(http.StatusCreated)
	}), w, req)

	if got := w.Header().Get("X-Request-ID"); got != "req-123456" {
		t.Errorf("X-Request-ID=%q", got)
	}
	line := strings.TrimSuffix(f.out.String(), "\n")
	// Exactly emit_http_event's shape: sorted keys, compact, ASCII.
	want := `{"client_country":"ES","client_ip":"81.40.1.2","client_release":"v2026.10.03",` +
		`"event":"http_request","method":"POST","peer_ip":"172.18.0.5","pvp_hop":"go:native",` +
		`"request_id":"req-123456","route":"/api/pvp/matches/{match_id}/move","status":201,"username":"alice"}`
	if got := durationField.ReplaceAllString(line, ""); got != want {
		t.Errorf("access event\n got %s\nwant %s", got, want)
	}
	if !durationField.MatchString(line) {
		t.Errorf("duration_ms missing: %s", line)
	}

	if len(f.logs.records) != 1 {
		t.Fatalf("otlp log records=%d", len(f.logs.records))
	}
	record := f.logs.records[0]
	if record.Body().AsString() != line || record.SeverityText() != "INFO" {
		t.Errorf("otlp log body/severity: %q %q", record.Body().AsString(), record.SeverityText())
	}

	metrics := f.collect(t)
	wantAttrs := attribute.NewSet(
		attribute.String("http.request.method", "POST"),
		attribute.String("http.route", "/api/pvp/matches/{match_id}/move"),
		attribute.String("http.response.status_class", "2xx"),
		attribute.String("service.client_release", "v2026.10.03"),
	)
	counter, ok := metrics[requestCounterName].Data.(metricdata.Sum[int64])
	if !ok || !counter.IsMonotonic || counter.Temporality != metricdata.CumulativeTemporality ||
		len(counter.DataPoints) != 1 || counter.DataPoints[0].Value != 1 || !counter.DataPoints[0].Attributes.Equals(&wantAttrs) {
		t.Errorf("counter: %+v", metrics[requestCounterName])
	}
	histogram, ok := metrics[durationName].Data.(metricdata.Histogram[float64])
	if !ok || metrics[durationName].Unit != "s" || len(histogram.DataPoints) != 1 || !histogram.DataPoints[0].Attributes.Equals(&wantAttrs) {
		t.Errorf("histogram: %+v", metrics[durationName])
	}
	// Seconds, as Python records: a 20ms request is ~0.02, never ~20.
	if sum := histogram.DataPoints[0].Sum; sum < 0.015 || sum > 5 {
		t.Errorf("duration sum=%v, want seconds", sum)
	}
	// Python's SDK default buckets: the dashboards' histogram_quantile relies
	// on both runtimes sharing them.
	wantBounds := []float64{0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000}
	if bounds := histogram.DataPoints[0].Bounds; !reflect.DeepEqual(bounds, wantBounds) {
		t.Errorf("bounds=%v", bounds)
	}
}

func TestPanicIsRecordedAs500AndStillPropagates(t *testing.T) {
	f := newFixture(t)
	req := httptest.NewRequest(http.MethodGet, "/api/pvp/lobby", nil)
	defer func() {
		if recover() == nil {
			t.Fatal("panic swallowed")
		}
		var event map[string]any
		if err := json.Unmarshal(f.out.Bytes(), &event); err != nil {
			t.Fatal(err)
		}
		if event["status"] != float64(500) || event["exception"] != true {
			t.Errorf("event=%v", event)
		}
		if f.logs.records[0].SeverityText() != "ERROR" {
			t.Errorf("severity=%q", f.logs.records[0].SeverityText())
		}
		counter := f.collect(t)[requestCounterName].Data.(metricdata.Sum[int64])
		if class, _ := counter.DataPoints[0].Attributes.Value("http.response.status_class"); class.AsString() != "5xx" {
			t.Errorf("class=%q", class.AsString())
		}
	}()
	f.rec.Serve("/api/pvp/lobby", http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }), httptest.NewRecorder(), req)
}

func TestImplicitStatusAndAnonymousNonPvPRequest(t *testing.T) {
	f := newFixture(t)
	req := httptest.NewRequest(http.MethodGet, "/api/games", nil)
	req.Header.Set("X-Request-ID", "bad id")
	f.rec.Serve("/api/games", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("{}"))
	}), httptest.NewRecorder(), req)
	var event map[string]any
	if err := json.Unmarshal(f.out.Bytes(), &event); err != nil {
		t.Fatal(err)
	}
	if event["status"] != float64(200) {
		t.Errorf("implicit status: %v", event["status"])
	}
	for _, absent := range []string{"pvp_hop", "username", "client_release", "exception"} {
		if _, ok := event[absent]; ok {
			t.Errorf("%s should be absent: %v", absent, event)
		}
	}
	if id, _ := event["request_id"].(string); len(id) != 12 {
		t.Errorf("generated request id %q", id)
	}
}

func TestNilRecorderOnlyServes(t *testing.T) {
	var rec *Recorder
	w := httptest.NewRecorder()
	rec.Serve("/x", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) }), w, httptest.NewRequest("GET", "/x", nil))
	if w.Code != http.StatusTeapot {
		t.Fatalf("code=%d", w.Code)
	}
	if err := rec.Shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestWithoutExportersOnlyStdout(t *testing.T) {
	out := &bytes.Buffer{}
	rec, err := New(context.Background(), Config{ServiceName: "x-go"}, Options{Stdout: out})
	if err != nil {
		t.Fatal(err)
	}
	if rec.requests != nil || rec.logger != nil {
		t.Fatal("no endpoint must mean no exporter")
	}
	rec.Serve("/api/pvp/lobby", http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}), httptest.NewRecorder(), httptest.NewRequest("GET", "/api/pvp/lobby", nil))
	if !strings.Contains(out.String(), `"event":"http_request"`) {
		t.Fatalf("stdout=%q", out.String())
	}
}

type historySpy struct{ calls []string }

func (h *historySpy) RecordHTTP(method, route string, status int, latencyMS float64, release string) {
	h.calls = append(h.calls, fmt.Sprintf("%s %s %d %s %t", method, route, status, release, latencyMS >= 0))
}

func TestNativeRequestReachesTheObservabilityHistory(t *testing.T) {
	spy := &historySpy{}
	rec, err := New(context.Background(), Config{ServiceName: "go"}, Options{History: spy, Stdout: io.Discard})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/games/g1/move", nil)
	req.Header.Set("X-Client-Release", "v16.6dm46j")
	rec.Serve("/api/games/{game_id}/move", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
	}), httptest.NewRecorder(), req)
	if len(spy.calls) != 1 || spy.calls[0] != "POST /api/games/{game_id}/move 409 v16.6dm46j true" {
		t.Fatalf("history %v", spy.calls)
	}
}

func TestBillingGaugeReportsFreshCostsAndFrontendEventsCount(t *testing.T) {
	f := newFixture(t)
	if !f.rec.RecordBillingCosts(context.Background(), []BillingCost{{Provider: "oci", Amount: 12.5, Currency: "EUR"}}) {
		t.Fatal("export configured: flush should succeed")
	}
	value := 812.0
	f.rec.RecordFrontend("web_vital", "LCP", &value, "home", "v1")
	var rm metricdata.ResourceMetrics
	if err := f.reader.Collect(context.Background(), &rm); err != nil {
		t.Fatal(err)
	}
	found := map[string]bool{}
	for _, scope := range rm.ScopeMetrics {
		for _, m := range scope.Metrics {
			found[m.Name] = true
			if gauge, ok := m.Data.(metricdata.Gauge[float64]); ok && m.Name == "chess_studio_billing_cost_current_cycle" {
				if len(gauge.DataPoints) != 1 || gauge.DataPoints[0].Value != 12.5 {
					t.Fatalf("gauge %+v", gauge.DataPoints)
				}
				provider, _ := gauge.DataPoints[0].Attributes.Value("provider")
				scopeAttr, _ := gauge.DataPoints[0].Attributes.Value("scope")
				if provider.AsString() != "oci" || scopeAttr.AsString() != "current_cycle" {
					t.Fatalf("gauge attributes %v", gauge.DataPoints[0].Attributes)
				}
			}
		}
	}
	for _, name := range []string{"chess_studio_billing_cost_current_cycle", "chess_studio_frontend_events", "chess_studio_frontend_web_vital"} {
		if !found[name] {
			t.Errorf("%s not exported: %v", name, found)
		}
	}
	// Stale costs stop being reported.
	f.rec.billingMu.Lock()
	cost := f.rec.billing["oci"]
	cost.receivedAt = cost.receivedAt.Add(-6 * time.Minute)
	f.rec.billing["oci"] = cost
	f.rec.billingMu.Unlock()
	rm = metricdata.ResourceMetrics{}
	_ = f.reader.Collect(context.Background(), &rm)
	for _, scope := range rm.ScopeMetrics {
		for _, m := range scope.Metrics {
			if gauge, ok := m.Data.(metricdata.Gauge[float64]); ok && len(gauge.DataPoints) > 0 {
				t.Fatalf("stale cost still reported: %+v", gauge.DataPoints)
			}
		}
	}
}

func TestBillingWithoutMetricsExportIsNotRecorded(t *testing.T) {
	rec, err := New(context.Background(), Config{ServiceName: "go"}, Options{Stdout: io.Discard})
	if err != nil {
		t.Fatal(err)
	}
	if rec.RecordBillingCosts(context.Background(), []BillingCost{{Provider: "oci", Amount: 1, Currency: "EUR"}}) {
		t.Fatal("no exporter: must report not configured")
	}
}

package telemetry

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
	"unicode"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	otellog "go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/metric"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyjson"
)

// Metric and meter names are Python's (tracing.py), so Go-native requests
// land in the same dashboards' series, told apart by service_name.
const (
	meterName          = "chess-studio.backend"
	requestCounterName = "chess_studio_http_server_requests"
	durationName       = "chess_studio_http_server_duration"
	frontendEventsName = "chess_studio_frontend_events"
	frontendVitalName  = "chess_studio_frontend_web_vital"
	loggerName         = "chess-studio.access"
	exportInterval     = 30 * time.Second
)

// UsernameFunc returns the verified session subject of a request, or "" —
// what main._request_username derives from the JWT without touching Mongo.
type UsernameFunc func(*http.Request) string

// HTTPHistory receives each native request for the Admin observability
// history (obshistory.Recorder, Python's record_http_event).
type HTTPHistory interface {
	RecordHTTP(method, route string, status int, latencyMS float64, release string)
}

// Recorder observes requests served natively by Go. A nil *Recorder is valid
// and records nothing.
type Recorder struct {
	cfg      Config
	username UsernameFunc
	history  HTTPHistory
	out      io.Writer
	outMu    sync.Mutex
	now      func() time.Time

	requests metric.Int64Counter
	duration metric.Float64Histogram
	frontend metric.Int64Counter
	vital    metric.Float64Histogram
	logger   otellog.Logger

	shutdowns []func(context.Context) error
}

// Options are the parts of a Recorder that tests replace.
type Options struct {
	Username     UsernameFunc
	History      HTTPHistory
	Stdout       io.Writer
	MetricReader sdkmetric.Reader
	LogProcessor sdklog.Processor
	InstanceID   string
	now          func() time.Time
}

// New builds the recorder. Export is fail-open, as in Python: a broken
// exporter configuration disables that signal and never the routes.
func New(ctx context.Context, cfg Config, opts Options) (*Recorder, error) {
	r := &Recorder{cfg: cfg, username: opts.Username, history: opts.History, out: opts.Stdout, now: opts.now}
	if r.out == nil {
		r.out = os.Stdout
	}
	if r.now == nil {
		r.now = time.Now
	}
	instance := opts.InstanceID
	if instance == "" {
		host, _ := os.Hostname()
		instance = "go:" + host
	}
	attrs := []attribute.KeyValue{
		attribute.String("service.name", cfg.ServiceName),
		attribute.String("deployment.environment.name", cfg.Environment),
		// Blue and green sidecars may overlap during a cutover; cumulative
		// series from two processes must not share an identity.
		attribute.String("service.instance.id", instance),
	}
	if cfg.Release != "" {
		attrs = append(attrs, attribute.String("service.version", truncateRunes(cfg.Release, 80)))
	}
	// Schemaless and without the env detector: OTEL_SERVICE_NAME in the shared
	// env file names the Python service and must not override ours.
	res := resource.NewSchemaless(attrs...)

	var errs []error
	reader := opts.MetricReader
	if reader == nil && cfg.MetricsEnabled {
		exporter, err := otlpmetrichttp.New(ctx,
			otlpmetrichttp.WithEndpointURL(cfg.MetricsEndpoint),
			otlpmetrichttp.WithHeaders(cfg.Headers),
		)
		if err != nil {
			errs = append(errs, fmt.Errorf("metrics exporter: %w", err))
		} else {
			reader = sdkmetric.NewPeriodicReader(exporter, sdkmetric.WithInterval(exportInterval))
		}
	}
	if reader != nil {
		provider := sdkmetric.NewMeterProvider(sdkmetric.WithResource(res), sdkmetric.WithReader(reader))
		meter := provider.Meter(meterName)
		counter, err1 := meter.Int64Counter(requestCounterName, metric.WithDescription("Chess Studio HTTP requests"))
		histogram, err2 := meter.Float64Histogram(durationName, metric.WithUnit("s"), metric.WithDescription("Chess Studio HTTP request duration"))
		frontend, err3 := meter.Int64Counter(frontendEventsName, metric.WithDescription("Coarse frontend telemetry events"))
		vital, err4 := meter.Float64Histogram(frontendVitalName, metric.WithDescription("Web Vital value reported by the frontend"))
		if err := errors.Join(err1, err2, err3, err4); err != nil {
			errs = append(errs, err)
		} else {
			r.requests, r.duration = counter, histogram
			r.frontend, r.vital = frontend, vital
			r.shutdowns = append(r.shutdowns, provider.Shutdown)
		}
	}

	processor := opts.LogProcessor
	if processor == nil && cfg.LogsEnabled {
		exporter, err := otlploghttp.New(ctx,
			otlploghttp.WithEndpointURL(cfg.LogsEndpoint),
			otlploghttp.WithHeaders(cfg.Headers),
		)
		if err != nil {
			errs = append(errs, fmt.Errorf("logs exporter: %w", err))
		} else {
			processor = sdklog.NewBatchProcessor(exporter)
		}
	}
	if processor != nil {
		provider := sdklog.NewLoggerProvider(sdklog.WithResource(res), sdklog.WithProcessor(processor))
		r.logger = provider.Logger(loggerName)
		r.shutdowns = append(r.shutdowns, provider.Shutdown)
	}
	return r, errors.Join(errs...)
}

// Shutdown flushes pending metrics and logs.
func (r *Recorder) Shutdown(ctx context.Context) error {
	if r == nil {
		return nil
	}
	var errs []error
	for _, shutdown := range r.shutdowns {
		errs = append(errs, shutdown(ctx))
	}
	return errors.Join(errs...)
}

// Serve runs a native handler and records it under route, the FastAPI path
// pattern Python would report for the same request.
func (r *Recorder) Serve(route string, next http.Handler, w http.ResponseWriter, req *http.Request) {
	if r == nil {
		next.ServeHTTP(w, req)
		return
	}
	started := time.Now()
	id := requestID(req)
	// Python answers with the request id it logged; native handlers that echo
	// a cleaned incoming id overwrite this with the same value.
	w.Header().Set("X-Request-ID", id)
	recorder := &statusRecorder{ResponseWriter: w}
	defer func() {
		panicked := recover()
		status := recorder.status
		if panicked != nil {
			status = http.StatusInternalServerError
		} else if status == 0 {
			status = http.StatusOK
		}
		r.record(req, route, id, status, time.Since(started), panicked != nil)
		if panicked != nil {
			panic(panicked)
		}
	}()
	next.ServeHTTP(recorder, req)
}

func (r *Recorder) record(req *http.Request, route, id string, status int, elapsed time.Duration, exception bool) {
	method := truncateRunes(strings.ToUpper(req.Method), 8)
	if method == "" {
		method = "?"
	}
	release := clientRelease(req)
	ms := float64(elapsed) / float64(time.Millisecond)

	if r.requests != nil {
		attrs := []attribute.KeyValue{
			attribute.String("http.request.method", method),
			attribute.String("http.route", truncateRunes(route, 120)),
			attribute.String("http.response.status_class", statusClass(status)),
		}
		if release != "" {
			attrs = append(attrs, attribute.String("service.client_release", release))
		}
		set := metric.WithAttributes(attrs...)
		ctx := context.Background()
		r.requests.Add(ctx, 1, set)
		r.duration.Record(ctx, math.Max(0, ms)/1000, set)
	}

	if r.history != nil {
		r.history.RecordHTTP(method, truncateRunes(route, 120), status, math.Max(0, ms), release)
	}

	message := r.httpEvent(req, route, id, method, status, ms, release, exception)
	r.outMu.Lock()
	_, _ = io.WriteString(r.out, message+"\n")
	r.outMu.Unlock()
	if r.logger != nil {
		var record otellog.Record
		record.SetTimestamp(r.now())
		record.SetObservedTimestamp(r.now())
		if exception {
			record.SetSeverity(otellog.SeverityError)
			record.SetSeverityText("ERROR")
		} else {
			record.SetSeverity(otellog.SeverityInfo)
			record.SetSeverityText("INFO")
		}
		record.SetBody(attribute.StringValue(message))
		r.logger.Emit(context.Background(), record)
	}
}

func statusClass(status int) string {
	if status <= 0 {
		return "unknown"
	}
	return fmt.Sprintf("%dxx", status/100)
}

// httpEvent mirrors structured_logging.emit_http_event: the same keys and
// the same serialisation (sorted keys, compact, ASCII-only).
func (r *Recorder) httpEvent(req *http.Request, route, id, method string, status int, ms float64, release string, exception bool) string {
	payload := map[string]any{
		"event":       "http_request",
		"request_id":  truncateRunes(id, 80),
		"method":      method,
		"route":       truncateRunes(route, 160),
		"status":      pyjson.Int(status),
		"duration_ms": math.Round(math.Max(0, ms)*100) / 100,
	}
	if release != "" {
		payload["client_release"] = release
	}
	if isPvPPath(req.URL.Path) {
		// Python logs how a PvP request reached it; here it never did.
		payload["pvp_hop"] = "go:native"
	}
	if exception {
		payload["exception"] = true
	}
	if r.username != nil {
		if username := truncateRunes(strings.TrimSpace(r.username(req)), 64); username != "" && username != "-" {
			payload["username"] = username
		}
	}
	network := requestNetwork(req, r.cfg.TrustCloudflare)
	if network.ClientIP != "" {
		payload["client_ip"] = network.ClientIP
	}
	if network.PeerIP != "" {
		payload["peer_ip"] = network.PeerIP
	}
	if len(network.ForwardedFor) > 0 {
		payload["x_forwarded_for"] = network.ForwardedFor
	}
	if country := sanitizeCountry(network.ClientCountry); country != "" {
		payload["client_country"] = country
	}
	message, err := pyjson.Dumps(payload)
	if err != nil {
		// Unreachable for the shapes above; never lose the event over it.
		return fmt.Sprintf(`{"event":"http_request","request_id":%q}`, id)
	}
	return message
}

func isPvPPath(path string) bool {
	return path == "/api/pvp" || strings.HasPrefix(path, "/api/pvp/")
}

func isUnicodeAlnum(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsNumber(r)
}

// statusRecorder captures the status a native handler writes.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	if s.status == 0 {
		s.status = code
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(p []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	return s.ResponseWriter.Write(p)
}

// Unwrap lets http.ResponseController reach the underlying writer.
func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// RecordFrontend mirrors tracing.record_frontend_otel: one coarse frontend
// event, and its value when it is a Web Vital. No identity, no free text.
func (r *Recorder) RecordFrontend(eventType, metricName string, value *float64, frontendContext, release string) {
	if r == nil || r.frontend == nil {
		return
	}
	if eventType == "" {
		eventType = "unknown"
	}
	if frontendContext == "" {
		frontendContext = "unknown"
	}
	attrs := []attribute.KeyValue{
		attribute.String("event.type", truncateRunes(eventType, 40)),
		attribute.String("frontend.context", truncateRunes(frontendContext, 40)),
	}
	if release = truncateRunes(strings.TrimSpace(release), 40); release != "" {
		attrs = append(attrs, attribute.String("service.client_release", release))
	}
	if metricName != "" {
		attrs = append(attrs, attribute.String("web_vital.name", truncateRunes(metricName, 20)))
	}
	set := metric.WithAttributes(attrs...)
	r.frontend.Add(context.Background(), 1, set)
	if metricName != "" && value != nil && r.vital != nil {
		r.vital.Record(context.Background(), *value, set)
	}
}

// LogLine writes one already-serialised operational log line to the same
// stream as the access log (stdout, Python's uvicorn.error handler).
func (r *Recorder) LogLine(line string) {
	if r == nil {
		return
	}
	r.outMu.Lock()
	_, _ = io.WriteString(r.out, line+"\n")
	r.outMu.Unlock()
}

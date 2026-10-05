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
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	otellog "go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	oteltrace "go.opentelemetry.io/otel/trace"

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
	billingGaugeName   = "chess_studio_billing_cost_current_cycle"
	// billingTTL mirrors _BILLING_EMIT_TTL_SECONDS: a cost stops being
	// reported five minutes after it was received.
	billingTTL     = 5 * time.Minute
	loggerName     = "chess-studio.access"
	tracerName     = "chess-studio.backend"
	exportInterval = 30 * time.Second
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

	meterProvider *sdkmetric.MeterProvider
	billingMu     sync.Mutex
	billing       map[string]billingCost
	logger        otellog.Logger

	shutdowns []func(context.Context) error
	// signalErrors names a signal whose exporter could not be built.
	signalErrors map[string]string

	traceProvider  *sdktrace.TracerProvider
	tracer         oteltrace.Tracer
	loggerProvider *sdklog.LoggerProvider
	traceTracker   *exportTracker
	logTracker     *exportTracker
	startupTraceID string
}

// Options are the parts of a Recorder that tests replace.
type Options struct {
	Username     UsernameFunc
	History      HTTPHistory
	Stdout       io.Writer
	MetricReader sdkmetric.Reader
	SpanExporter sdktrace.SpanExporter
	// LogExporter replaces the OTLP log exporter (still tracked for Admin).
	LogExporter  sdklog.Exporter
	LogProcessor sdklog.Processor
	InstanceID   string
	now          func() time.Time
}

// New builds the recorder. Export is fail-open, as in Python: a broken
// exporter configuration disables that signal and never the routes.
func New(ctx context.Context, cfg Config, opts Options) (*Recorder, error) {
	r := &Recorder{cfg: cfg, username: opts.Username, history: opts.History, out: opts.Stdout, now: opts.now, signalErrors: map[string]string{},
		traceTracker: &exportTracker{}, logTracker: &exportTracker{}}
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
	spanExporter := opts.SpanExporter
	if spanExporter == nil && cfg.TracesEnabled {
		exporter, err := otlptracehttp.New(ctx,
			otlptracehttp.WithEndpointURL(cfg.TracesEndpoint),
			otlptracehttp.WithHeaders(cfg.Headers),
			otlptracehttp.WithHTTPClient(trackedClient(r.traceTracker)),
		)
		if err != nil {
			errs = append(errs, fmt.Errorf("traces exporter: %w", err))
			r.signalErrors["traces"] = "ExporterConfigurationError"
		} else {
			spanExporter = exporter
		}
	}
	if spanExporter != nil {
		provider := sdktrace.NewTracerProvider(
			sdktrace.WithResource(res),
			sdktrace.WithBatcher(trackingSpanExporter{next: spanExporter, tracker: r.traceTracker}),
			sdktrace.WithSampler(sampler(cfg.Sampler, cfg.SamplerArg)),
		)
		r.traceProvider = provider
		r.tracer = provider.Tracer(tracerName)
		r.shutdowns = append(r.shutdowns, provider.Shutdown)
		// One span per process: Tempo's proof of life after every deploy.
		_, startup := provider.Tracer("chess-studio.startup").Start(ctx, "chess-studio.startup",
			oteltrace.WithAttributes(attribute.Bool("chess_studio.startup", true)))
		if sc := startup.SpanContext(); sc.IsValid() {
			r.startupTraceID = sc.TraceID().String()
		}
		startup.End()
	}

	reader := opts.MetricReader
	if reader == nil && cfg.MetricsEnabled {
		exporter, err := otlpmetrichttp.New(ctx,
			otlpmetrichttp.WithEndpointURL(cfg.MetricsEndpoint),
			otlpmetrichttp.WithHeaders(cfg.Headers),
		)
		if err != nil {
			errs = append(errs, fmt.Errorf("metrics exporter: %w", err))
			r.signalErrors["metrics"] = "ExporterConfigurationError"
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
		_, err5 := meter.Float64ObservableGauge(billingGaugeName,
			metric.WithUnit("1"),
			metric.WithDescription("Current OCI or Cloudflare billing cost in provider billing currency."),
			metric.WithFloat64Callback(r.observeBilling),
		)
		if err := errors.Join(err1, err2, err3, err4, err5); err != nil {
			errs = append(errs, err)
			r.signalErrors["metrics"] = "InstrumentError"
		} else {
			r.requests, r.duration = counter, histogram
			r.frontend, r.vital = frontend, vital
			r.meterProvider = provider
			r.shutdowns = append(r.shutdowns, provider.Shutdown)
		}
	}

	processor := opts.LogProcessor
	if processor == nil && opts.LogExporter != nil {
		processor = sdklog.NewBatchProcessor(trackingLogExporter{next: opts.LogExporter, tracker: r.logTracker})
	}
	if processor == nil && cfg.LogsEnabled {
		exporter, err := otlploghttp.New(ctx,
			otlploghttp.WithEndpointURL(cfg.LogsEndpoint),
			otlploghttp.WithHeaders(cfg.Headers),
			otlploghttp.WithHTTPClient(trackedClient(r.logTracker)),
		)
		if err != nil {
			errs = append(errs, fmt.Errorf("logs exporter: %w", err))
			r.signalErrors["logs"] = "ExporterConfigurationError"
		} else {
			processor = sdklog.NewBatchProcessor(trackingLogExporter{next: exporter, tracker: r.logTracker})
		}
	}
	if processor != nil {
		provider := sdklog.NewLoggerProvider(sdklog.WithResource(res), sdklog.WithProcessor(processor))
		r.loggerProvider = provider
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
	var span oteltrace.Span
	if r.tracer != nil {
		// A server span per native request, continuing the caller's W3C
		// trace like Python's FastAPI instrumentation.
		ctx := propagation.TraceContext{}.Extract(req.Context(), propagation.HeaderCarrier(req.Header))
		method := truncateRunes(strings.ToUpper(req.Method), 8)
		ctx, span = r.tracer.Start(ctx, method+" "+truncateRunes(route, 120),
			oteltrace.WithSpanKind(oteltrace.SpanKindServer),
			oteltrace.WithAttributes(attribute.String("http.request.method", method), attribute.String("http.route", truncateRunes(route, 120))))
		req = req.WithContext(ctx)
	}
	defer func() {
		panicked := recover()
		status := recorder.status
		if panicked != nil {
			status = http.StatusInternalServerError
		} else if status == 0 {
			status = http.StatusOK
		}
		if span != nil {
			span.SetAttributes(attribute.Int("http.response.status_code", status))
			if status >= 500 {
				span.SetStatus(codes.Error, "")
			}
			span.End()
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

type billingCost struct {
	amount     float64
	currency   string
	receivedAt time.Time
}

// BillingCost is one provider's current-cycle cost.
type BillingCost struct {
	Provider string
	Amount   float64
	Currency string
}

// RecordBillingCosts mirrors tracing.record_billing_costs_otel: it keeps the
// latest cost per provider for the observable gauge and forces one export.
// It reports whether metrics export is configured and the flush succeeded.
func (r *Recorder) RecordBillingCosts(ctx context.Context, costs []BillingCost) bool {
	if r == nil {
		return false
	}
	now := time.Now()
	r.billingMu.Lock()
	if r.billing == nil {
		r.billing = map[string]billingCost{}
	}
	for _, cost := range costs {
		r.billing[cost.Provider] = billingCost{amount: cost.Amount, currency: cost.Currency, receivedAt: now}
	}
	r.billingMu.Unlock()
	if r.meterProvider == nil {
		return false
	}
	flushCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return r.meterProvider.ForceFlush(flushCtx) == nil
}

// observeBilling mirrors _billing_cost_observations: fresh costs only,
// stale ones forgotten.
func (r *Recorder) observeBilling(_ context.Context, observer metric.Float64Observer) error {
	now := time.Now()
	r.billingMu.Lock()
	defer r.billingMu.Unlock()
	for provider, cost := range r.billing {
		if now.Sub(cost.receivedAt) > billingTTL {
			delete(r.billing, provider)
			continue
		}
		observer.Observe(cost.amount, metric.WithAttributes(
			attribute.String("provider", provider),
			attribute.String("currency", cost.currency),
			attribute.String("scope", "current_cycle"),
		))
	}
	return nil
}

package telemetry

import (
	"context"
	"net/url"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.opentelemetry.io/otel/attribute"
	otellog "go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/metric"
	oteltrace "go.opentelemetry.io/otel/trace"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyjson"
)

// safeEndpointPath is tracing._safe_endpoint_path: the path only, never the
// host or credentials.
func safeEndpointPath(endpoint string) any {
	if endpoint == "" {
		return nil
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return nil
	}
	if parsed.Path == "" {
		return "/"
	}
	return parsed.Path
}

func exportSnapshot(countKey string) bson.D {
	return bson.D{
		{Key: "attemptCount", Value: int64(0)},
		{Key: "successCount", Value: int64(0)},
		{Key: "failureCount", Value: int64(0)},
		{Key: countKey, Value: int64(0)},
		{Key: "lastResult", Value: nil},
		{Key: "lastError", Value: nil},
		{Key: "lastHttpStatus", Value: nil},
	}
}

func optional(value string) any {
	if value == "" {
		return nil
	}
	return value
}

// Diagnostics is tracing_diagnostics for this process: which OTLP signals Go
// exports, under Go's own service name, and what its exporters last
// reported. A nil Recorder (GO_REQUEST_TELEMETRY_ENABLED=false) reports cfg
// with nothing configured.
func Diagnostics(r *Recorder, cfg Config) bson.D {
	tracesOn, metricsOn, logsOn := false, false, false
	errs := map[string]string{}
	traceExport, logExport := exportSnapshot("exportedSpanCount"), exportSnapshot("exportedLogCount")
	var startup any
	if r != nil {
		cfg = r.cfg
		tracesOn, metricsOn, logsOn = r.traceProvider != nil, r.meterProvider != nil, r.logger != nil
		errs = r.signalErrors
		traceExport, logExport = r.traceTracker.snapshot("exportedSpanCount"), r.logTracker.snapshot("exportedLogCount")
		startup = optional(r.startupTraceID)
	}
	configured := tracesOn || metricsOn || logsOn
	var initErr any
	switch {
	case r == nil:
		initErr = "disabled"
	case configured || !(cfg.TracesEnabled || cfg.MetricsEnabled || cfg.LogsEnabled):
		initErr = nil
	default:
		initErr = "not_configured"
		for _, name := range []string{"traces", "metrics", "logs"} {
			if errs[name] != "" {
				initErr = errs[name]
				break
			}
		}
	}
	binding := "none"
	if tracesOn {
		binding = "explicit"
	}
	signal := func(enabled bool, endpoint string, on bool, errName string) bson.D {
		return bson.D{
			{Key: "enabled", Value: enabled},
			{Key: "endpointConfigured", Value: endpoint != ""},
			{Key: "configured", Value: on},
			{Key: "endpointPath", Value: safeEndpointPath(endpoint)},
			{Key: "error", Value: optional(errName)},
		}
	}
	return bson.D{
		{Key: "configured", Value: configured},
		{Key: "enabled", Value: cfg.TracesEnabled},
		{Key: "endpointConfigured", Value: cfg.TracesEndpoint != ""},
		{Key: "headersConfigured", Value: cfg.HeadersConfigured},
		{Key: "serviceName", Value: cfg.ServiceName},
		{Key: "environment", Value: cfg.Environment},
		{Key: "sampler", Value: cfg.Sampler},
		{Key: "samplerArg", Value: cfg.SamplerArg},
		{Key: "protocol", Value: cfg.Protocol},
		{Key: "providerBinding", Value: binding},
		{Key: "exporter", Value: "otlp-http"},
		{Key: "traceExporter", Value: traceExport},
		{Key: "logExporter", Value: logExport},
		{Key: "startupTraceId", Value: startup},
		{Key: "initializationError", Value: initErr},
		{Key: "signals", Value: bson.D{
			{Key: "traces", Value: signal(cfg.TracesEnabled, cfg.TracesEndpoint, tracesOn, errs["traces"])},
			{Key: "metrics", Value: signal(cfg.MetricsEnabled, cfg.MetricsEndpoint, metricsOn, errs["metrics"])},
			{Key: "logs", Value: signal(cfg.LogsEnabled, cfg.LogsEndpoint, logsOn, errs["logs"])},
		}},
	}
}

func signalConfigured(diag bson.D, name string) bool {
	signals, _ := field(diag, "signals").(bson.D)
	sig, _ := field(signals, name).(bson.D)
	on, _ := field(sig, "configured").(bool)
	return on
}

func field(doc bson.D, key string) any {
	for _, e := range doc {
		if e.Key == key {
			return e.Value
		}
	}
	return nil
}

// TraceProbe is emit_trace_probe: one sampled span under a random remote
// parent, flushed, and judged by whether that exact trace was exported.
func (r *Recorder) TraceProbe(ctx context.Context, cfg Config) bson.D {
	diagnostics := Diagnostics(r, cfg)
	if r == nil || r.traceProvider == nil || !signalConfigured(diagnostics, "traces") {
		return bson.D{{Key: "ok", Value: false}, {Key: "reason", Value: "tracing_not_configured"}, {Key: "diagnostics", Value: diagnostics}}
	}
	// The baseline comes first: the batch may export on another goroutine
	// as soon as the span ends.
	beforeSuccesses, beforeSpans, _ := r.traceTracker.counts()
	traceID, parentID := randomTraceIDs()
	parent := oteltrace.NewSpanContext(oteltrace.SpanContextConfig{TraceID: traceID, SpanID: parentID, TraceFlags: oteltrace.FlagsSampled, Remote: true})
	spanCtx := oteltrace.ContextWithRemoteSpanContext(ctx, parent)
	_, span := r.traceProvider.Tracer("chess-studio.admin-probe").Start(spanCtx, "chess-studio.tempo.probe",
		oteltrace.WithAttributes(attribute.Bool("chess_studio.probe", true), attribute.String("chess_studio.component", "admin")))
	sc := span.SpanContext()
	sampled := sc.IsSampled()
	emitted := traceID.String()
	if sc.IsValid() {
		emitted = sc.TraceID().String()
	}
	span.End()
	flushCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	flushed := r.traceProvider.ForceFlush(flushCtx) == nil
	cancel()
	state := r.traceTracker.snapshot("exportedSpanCount")
	successes, spans, lastResult := r.traceTracker.counts()
	exported := r.traceTracker.recentlyExported(emitted) && successes > beforeSuccesses && spans > beforeSpans
	return bson.D{
		{Key: "ok", Value: flushed && sampled && exported && lastResult == "SUCCESS"},
		{Key: "traceId", Value: emitted},
		{Key: "sampled", Value: sampled},
		{Key: "flushed", Value: flushed},
		{Key: "exported", Value: exported},
		{Key: "exportResult", Value: field(state, "lastResult")},
		{Key: "exportError", Value: field(state, "lastError")},
		{Key: "httpStatus", Value: field(state, "lastHttpStatus")},
		{Key: "serviceName", Value: field(diagnostics, "serviceName")},
	}
}

// SignalProbe is emit_observability_probe: the trace probe plus one metric
// and one log record, each flushed; it reports only safe status.
func (r *Recorder) SignalProbe(ctx context.Context, cfg Config) bson.D {
	traceResult := r.TraceProbe(ctx, cfg)
	traceID := field(traceResult, "traceId")
	traceOK, _ := field(traceResult, "ok").(bool)
	metricsFlushed, logsFlushed, logsExported, logsOK := false, false, false, false
	logState := exportSnapshot("exportedLogCount")
	if r != nil {
		if r.requests != nil {
			attrs := metric.WithAttributes(
				attribute.String("http.request.method", "PROBE"),
				attribute.String("http.route", "/internal/observability-probe"),
				attribute.String("http.response.status_class", "2xx"),
				attribute.String("service.client_release", "probe"),
			)
			r.requests.Add(ctx, 1, attrs)
			r.duration.Record(ctx, 0.001, attrs)
		}
		beforeSuccesses, beforeLogs, _ := r.logTracker.counts()
		body, _ := pyjson.Dumps(map[string]any{"event": "observability_probe", "component": "admin", "trace_id": traceID})
		if r.logger != nil {
			var record otellog.Record
			record.SetTimestamp(r.now())
			record.SetObservedTimestamp(r.now())
			record.SetSeverity(otellog.SeverityInfo)
			record.SetSeverityText("INFO")
			record.SetBody(attribute.StringValue(body))
			r.logger.Emit(ctx, record)
		}
		flushCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		if r.meterProvider != nil {
			metricsFlushed = r.meterProvider.ForceFlush(flushCtx) == nil
		}
		if r.loggerProvider != nil {
			logsFlushed = r.loggerProvider.ForceFlush(flushCtx) == nil
		}
		cancel()
		logState = r.logTracker.snapshot("exportedLogCount")
		successes, logs, lastResult := r.logTracker.counts()
		logsExported = successes > beforeSuccesses && logs > beforeLogs
		logsOK = lastResult == "SUCCESS"
	}
	diagnostics := Diagnostics(r, cfg)
	traceFlag := func(key string) bool { v, _ := field(traceResult, key).(bool); return v }
	return bson.D{
		{Key: "ok", Value: traceOK && metricsFlushed && logsFlushed && logsExported && logsOK},
		{Key: "traceId", Value: traceID},
		{Key: "signals", Value: bson.D{
			{Key: "traces", Value: bson.D{
				{Key: "configured", Value: signalConfigured(diagnostics, "traces")},
				{Key: "flushed", Value: traceFlag("flushed")},
				{Key: "exported", Value: traceFlag("exported")},
				{Key: "ok", Value: traceOK},
				{Key: "exportResult", Value: field(traceResult, "exportResult")},
				{Key: "exportError", Value: field(traceResult, "exportError")},
				{Key: "httpStatus", Value: field(traceResult, "httpStatus")},
			}},
			{Key: "metrics", Value: bson.D{{Key: "configured", Value: signalConfigured(diagnostics, "metrics")}, {Key: "flushed", Value: metricsFlushed}}},
			{Key: "logs", Value: bson.D{
				{Key: "configured", Value: signalConfigured(diagnostics, "logs")},
				{Key: "flushed", Value: logsFlushed},
				{Key: "exported", Value: logsExported},
				{Key: "ok", Value: logsFlushed && logsExported && logsOK},
				{Key: "exportResult", Value: field(logState, "lastResult")},
				{Key: "exportError", Value: field(logState, "lastError")},
				{Key: "httpStatus", Value: field(logState, "lastHttpStatus")},
			}},
		}},
		{Key: "diagnostics", Value: diagnostics},
	}
}

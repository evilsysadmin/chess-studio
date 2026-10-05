package telemetry

import (
	"net/url"

	"go.mongodb.org/mongo-driver/v2/bson"
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
// exports and under which service name. Go exports metrics and logs; it has
// no trace provider, so traces always report unconfigured. A nil Recorder
// (GO_REQUEST_TELEMETRY_ENABLED=false) reports cfg with nothing configured.
func Diagnostics(r *Recorder, cfg Config) bson.D {
	metricsOn, logsOn := false, false
	metricsErr, logsErr := "", ""
	if r != nil {
		cfg = r.cfg
		metricsOn, logsOn = r.meterProvider != nil, r.logger != nil
		metricsErr, logsErr = r.signalErrors["metrics"], r.signalErrors["logs"]
	}
	configured := metricsOn || logsOn
	var initErr any
	switch {
	case r == nil:
		initErr = "disabled"
	case configured || !(cfg.MetricsEnabled || cfg.LogsEnabled):
		initErr = nil
	case metricsErr != "":
		initErr = metricsErr
	case logsErr != "":
		initErr = logsErr
	default:
		initErr = "not_configured"
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
		{Key: "providerBinding", Value: "none"},
		{Key: "exporter", Value: "otlp-http"},
		{Key: "traceExporter", Value: exportSnapshot("exportedSpanCount")},
		{Key: "logExporter", Value: exportSnapshot("exportedLogCount")},
		{Key: "startupTraceId", Value: nil},
		{Key: "initializationError", Value: initErr},
		{Key: "signals", Value: bson.D{
			{Key: "traces", Value: signal(cfg.TracesEnabled, cfg.TracesEndpoint, false, "")},
			{Key: "metrics", Value: signal(cfg.MetricsEnabled, cfg.MetricsEndpoint, metricsOn, metricsErr)},
			{Key: "logs", Value: signal(cfg.LogsEnabled, cfg.LogsEndpoint, logsOn, logsErr)},
		}},
	}
}

package telemetry

import (
	"context"
	"strings"
	"testing"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

func lookupFrom(env map[string]string) func(string) (string, bool) {
	return func(k string) (string, bool) { v, ok := env[k]; return v, ok }
}

func TestDiagnosticsMatchPythonWithoutExport(t *testing.T) {
	cfg := ConfigFromEnv(lookupFrom(map[string]string{}))
	r, err := New(context.Background(), cfg, Options{})
	if err != nil {
		t.Fatal(err)
	}
	got, err := pydoc.Encode(Diagnostics(r, cfg))
	if err != nil {
		t.Fatal(err)
	}
	// tracing_diagnostics({}) byte for byte, but for Go's own service name.
	want := `{"configured":false,"enabled":false,"endpointConfigured":false,"headersConfigured":false,"serviceName":"chess-studio-backend-go","environment":"development","sampler":"parentbased_traceidratio","samplerArg":"0.20","protocol":"http/protobuf","providerBinding":"none","exporter":"otlp-http","traceExporter":{"attemptCount":0,"successCount":0,"failureCount":0,"exportedSpanCount":0,"lastResult":null,"lastError":null,"lastHttpStatus":null},"logExporter":{"attemptCount":0,"successCount":0,"failureCount":0,"exportedLogCount":0,"lastResult":null,"lastError":null,"lastHttpStatus":null},"startupTraceId":null,"initializationError":null,"signals":{"traces":{"enabled":false,"endpointConfigured":false,"configured":false,"endpointPath":null,"error":null},"metrics":{"enabled":false,"endpointConfigured":false,"configured":false,"endpointPath":null,"error":null},"logs":{"enabled":false,"endpointConfigured":false,"configured":false,"endpointPath":null,"error":null}}}`
	if string(got) != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
}

func TestDiagnosticsReportSettingsLikePython(t *testing.T) {
	cfg := ConfigFromEnv(lookupFrom(map[string]string{
		"OTEL_EXPORTER_OTLP_ENDPOINT": "https://u:p@otlp.example/otlp", "OTEL_TRACES_SAMPLER": "  ",
		"OTEL_EXPORTER_OTLP_HEADERS": "a=b", "ENVIRONMENT": "Staging", "OTEL_METRICS_ENABLED": "false",
	}))
	got, err := pydoc.Encode(Diagnostics(nil, cfg))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		`"enabled":true,"endpointConfigured":true,"headersConfigured":true,`, `"environment":"staging","sampler":"","samplerArg":"0.20",`,
		`"traces":{"enabled":true,"endpointConfigured":true,"configured":false,"endpointPath":"/otlp/v1/traces","error":null}`,
		`"metrics":{"enabled":false,"endpointConfigured":true,"configured":false,"endpointPath":"/otlp/v1/metrics","error":null}`,
		`"logs":{"enabled":true,"endpointConfigured":true,"configured":false,"endpointPath":"/otlp/v1/logs","error":null}`,
		`"initializationError":"disabled"`,
	} {
		if !strings.Contains(string(got), want) {
			t.Fatalf("missing %s in %s", want, got)
		}
	}
	if strings.Contains(string(got), "u:p@") || strings.Contains(string(got), "otlp.example") {
		t.Fatalf("diagnostics leak the endpoint: %s", got)
	}
}

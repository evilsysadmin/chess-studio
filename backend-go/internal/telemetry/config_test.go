package telemetry

import (
	"reflect"
	"testing"
)

// Expected values come from backend-python/tracing.py (python 3.13).
func envFrom(values map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}

func TestSignalEndpointsMatchPython(t *testing.T) {
	cases := []struct {
		env           map[string]string
		metrics, logs string
	}{
		{map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "https://otlp-gateway.grafana.net/otlp"}, "https://otlp-gateway.grafana.net/otlp/v1/metrics", "https://otlp-gateway.grafana.net/otlp/v1/logs"},
		{map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "https://otlp-gateway.grafana.net/otlp/"}, "https://otlp-gateway.grafana.net/otlp/v1/metrics", "https://otlp-gateway.grafana.net/otlp/v1/logs"},
		{map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "https://otlp-gateway.grafana.net/otlp/v1/traces"}, "https://otlp-gateway.grafana.net/otlp/v1/metrics", "https://otlp-gateway.grafana.net/otlp/v1/logs"},
		{map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector:4318"}, "http://collector:4318/v1/metrics", "http://collector:4318/v1/logs"},
		{map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "https://g/otlp", "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT": "https://m/custom"}, "https://m/custom", "https://g/otlp/v1/logs"},
		{map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "https://g/otlp?x=1"}, "https://g/otlp/v1/metrics?x=1", "https://g/otlp/v1/logs?x=1"},
		{map[string]string{}, "", ""},
	}
	for _, c := range cases {
		cfg := ConfigFromEnv(envFrom(c.env))
		if cfg.MetricsEndpoint != c.metrics || cfg.LogsEndpoint != c.logs {
			t.Errorf("%v: metrics=%q logs=%q", c.env, cfg.MetricsEndpoint, cfg.LogsEndpoint)
		}
	}
}

func TestOTLPHeadersMatchPython(t *testing.T) {
	for raw, want := range map[string]map[string]string{
		"Authorization=Basic%20abc%3D%3D": {"Authorization": "Basic abc=="},
		"a=1, b = 2 ,bad,=x,k=v=w":        {"a": "1", "b": "2", "k": "v=w"},
		"Authorization=Basic abc+def%zz":  {"Authorization": "Basic abc+def%zz"},
	} {
		if got := parseOTLPHeaders(raw); !reflect.DeepEqual(got, want) {
			t.Errorf("%q: %v", raw, got)
		}
	}
}

func TestSignalsEnabledLikePythonUnderTheGoServiceName(t *testing.T) {
	cfg := ConfigFromEnv(envFrom(map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "https://g/otlp"}))
	if !cfg.MetricsEnabled || !cfg.LogsEnabled || cfg.ServiceName != "chess-studio-backend-go" || cfg.Environment != "development" {
		t.Fatalf("%+v", cfg)
	}
	cfg = ConfigFromEnv(envFrom(map[string]string{"OTEL_EXPORTER_OTLP_ENDPOINT": "https://g/otlp", "OTEL_METRICS_ENABLED": "false"}))
	if cfg.MetricsEnabled || !cfg.LogsEnabled {
		t.Fatalf("explicit false: %+v", cfg)
	}
	// "enabled" without an endpoint would be a lie: Python reports it off.
	cfg = ConfigFromEnv(envFrom(map[string]string{"OTEL_METRICS_ENABLED": "true"}))
	if cfg.MetricsEnabled || cfg.LogsEnabled {
		t.Fatalf("no endpoint: %+v", cfg)
	}
	cfg = ConfigFromEnv(envFrom(map[string]string{"OTEL_SERVICE_NAME": "chess-studio-backend-staging", "ENVIRONMENT": "Staging"}))
	if cfg.ServiceName != "chess-studio-backend-staging-go" || cfg.Environment != "staging" || !cfg.TrustCloudflare {
		t.Fatalf("staging: %+v", cfg)
	}
}

func TestCloudflareTrustFollowsPython(t *testing.T) {
	unset := "<unset>"
	for env, want := range map[[2]string]bool{
		{"staging", unset}:     true, // tunnel-only staging trusts by default
		{"production", unset}:  false,
		{"production", "true"}: true, // the OCI deploy opts in explicitly
		{"staging", "0"}:       false,
		{"staging", ""}:        false, // set but empty is an explicit "no" in Python
	} {
		values := map[string]string{"ENVIRONMENT": env[0]}
		if env[1] != unset {
			values["TRUST_CLOUDFLARE_CLIENT_IP"] = env[1]
		}
		if cfg := ConfigFromEnv(envFrom(values)); cfg.TrustCloudflare != want {
			t.Errorf("%v: trust=%v", env, cfg.TrustCloudflare)
		}
	}
}

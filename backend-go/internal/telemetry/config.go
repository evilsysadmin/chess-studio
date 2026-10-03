// Package telemetry gives the requests Go serves natively the same
// observability Python gives every request: the chess_studio_http_server_*
// OTLP metrics and one structured "http_request" log event (stdout and OTLP
// logs). Requests Go only proxies are still recorded by Python, so the edge
// wraps native handlers only and nothing is counted twice.
//
// Go exports under its own service name (<OTEL_SERVICE_NAME>-go): sharing the
// Python one would mix the two runtimes' series and make Go-native PvP
// traffic look like Python fallback traffic in the sunset evidence.
package telemetry

import (
	"net/url"
	"strings"
)

// GoServiceSuffix distinguishes the Go runtime from the Python service it
// fronts in every metric and log series.
const GoServiceSuffix = "-go"

var signalSuffix = map[string]string{
	"traces":  "/v1/traces",
	"metrics": "/v1/metrics",
	"logs":    "/v1/logs",
}

// Config mirrors tracing.tracing_settings for the signals Go exports.
type Config struct {
	ServiceName     string
	Environment     string
	Release         string
	MetricsEndpoint string
	LogsEndpoint    string
	MetricsEnabled  bool
	LogsEnabled     bool
	Headers         map[string]string
	// TrustCloudflare mirrors _trust_cloudflare_client_ip: CF-Connecting-IP
	// and CF-IPCountry count only behind the closed Cloudflare boundary.
	TrustCloudflare bool
}

var cloudflareTunnelEnvironments = map[string]bool{"staging": true, "stage": true}

// ConfigFromEnv reads the same variables the Python backend reads (the Go
// sidecar shares its env file). lookup is os.LookupEnv: like Python's
// os.environ.get, a variable set to "" is not the same as an unset one.
func ConfigFromEnv(lookup func(string) (string, bool)) Config {
	get := func(key string) string {
		value, _ := lookup(key)
		return strings.TrimSpace(value)
	}
	metrics := resolvedSignalEndpoint(get, "metrics")
	logs := resolvedSignalEndpoint(get, "logs")
	base := get("OTEL_SERVICE_NAME")
	if base == "" {
		base = "chess-studio-backend"
	}
	if len(base) > 80 {
		base = base[:80]
	}
	environment := strings.ToLower(get("ENVIRONMENT"))
	if environment == "" {
		environment = "development"
	}
	if len(environment) > 40 {
		environment = environment[:40]
	}
	trust := cloudflareTunnelEnvironments[environment]
	if raw, ok := lookup("TRUST_CLOUDFLARE_CLIENT_IP"); ok {
		trust = truthy(raw)
	}
	return Config{
		ServiceName:     base + GoServiceSuffix,
		Environment:     environment,
		Release:         get("GIT_COMMIT_SHA"),
		MetricsEndpoint: metrics,
		LogsEndpoint:    logs,
		MetricsEnabled:  enabled(get("OTEL_METRICS_ENABLED"), metrics),
		LogsEnabled:     enabled(get("OTEL_LOGS_ENABLED"), logs),
		Headers:         parseOTLPHeaders(get("OTEL_EXPORTER_OTLP_HEADERS")),
		TrustCloudflare: trust,
	}
}

func truthy(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// enabled mirrors tracing._enabled: an explicit falsy value disables, and
// nothing is enabled without an endpoint.
func enabled(explicit, endpoint string) bool {
	if explicit != "" && !truthy(explicit) {
		return false
	}
	return endpoint != ""
}

// resolvedSignalEndpoint mirrors tracing._resolved_signal_endpoint.
func resolvedSignalEndpoint(get func(string) string, signal string) string {
	suffix := signalSuffix[signal]
	if explicit := get("OTEL_EXPORTER_OTLP_" + strings.ToUpper(signal) + "_ENDPOINT"); explicit != "" {
		return explicit
	}
	generic := get("OTEL_EXPORTER_OTLP_ENDPOINT")
	if generic == "" {
		return ""
	}
	parsed, err := url.Parse(generic)
	if err != nil {
		return strings.TrimRight(generic, "/") + suffix
	}
	path := strings.TrimRight(parsed.Path, "/")
	for _, known := range []string{"/v1/traces", "/v1/metrics", "/v1/logs"} {
		if strings.HasSuffix(path, known) {
			path = strings.TrimRight(strings.TrimSuffix(path, known), "/")
			break
		}
	}
	parsed.Path = path + suffix
	parsed.RawPath = ""
	return parsed.String()
}

// parseOTLPHeaders mirrors tracing._parse_otlp_headers (percent-decoded).
func parseOTLPHeaders(value string) map[string]string {
	headers := map[string]string{}
	for _, chunk := range strings.Split(value, ",") {
		chunk = strings.TrimSpace(chunk)
		key, raw, ok := strings.Cut(chunk, "=")
		if !ok {
			continue
		}
		key = unquote(strings.TrimSpace(key))
		if key == "" {
			continue
		}
		headers[key] = unquote(strings.TrimSpace(raw))
	}
	return headers
}

// unquote is urllib.parse.unquote: invalid escapes stay literal, "+" stays "+".
func unquote(s string) string {
	if !strings.Contains(s, "%") {
		return s
	}
	var out []byte
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+2 < len(s) && isHex(s[i+1]) && isHex(s[i+2]) {
			out = append(out, unhex(s[i+1])<<4|unhex(s[i+2]))
			i += 2
			continue
		}
		out = append(out, s[i])
	}
	return string(out)
}

func isHex(c byte) bool {
	return ('0' <= c && c <= '9') || ('a' <= c && c <= 'f') || ('A' <= c && c <= 'F')
}

func unhex(c byte) byte {
	switch {
	case '0' <= c && c <= '9':
		return c - '0'
	case 'a' <= c && c <= 'f':
		return c - 'a' + 10
	default:
		return c - 'A' + 10
	}
}

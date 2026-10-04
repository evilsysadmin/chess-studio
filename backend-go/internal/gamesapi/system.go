package gamesapi

// Native system routes, mirroring system_api.py:
//
//	GET  /api/status            public_status
//	GET  /api/features          public_features
//	POST /api/client-telemetry  client_telemetry
//	POST /api/internal/billing-costs  ingest_billing_costs (billing.go)
//
// They share get_current_user, CORS and security headers with the games
// routes. status and features carry slowapi's default 120/minute, checked
// before authentication (SlowAPIMiddleware); client-telemetry has its own
// decorated 120/minute, checked after authentication and validation.

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gameops"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/obshistory"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyjson"
)

const (
	StatusPattern          = "/api/status"
	FeaturesPattern        = "/api/features"
	ClientTelemetryPattern = "/api/client-telemetry"
	// onlineWindow is public_status' window_seconds.
	onlineWindow = 150 * time.Second
)

// SystemRoute reports whether a request is a native system route.
func SystemRoute(r *http.Request) (pattern string, ok bool) {
	want := ""
	switch r.URL.Path {
	case StatusPattern, FeaturesPattern:
		want = http.MethodGet
	case ClientTelemetryPattern, BillingPattern:
		want = http.MethodPost
	default:
		return "", false
	}
	if r.Method == want || r.Method == http.MethodOptions && preflightMethod(r) == want {
		return r.URL.Path, true
	}
	return "", false
}

// OnlineCounter mirrors users_store.count_online_users
// (accountstore.Store.CountOnline).
type OnlineCounter interface {
	CountOnline(ctx context.Context, since string, exclude []string) (int, error)
}

// SystemHistory is the Admin observability history (obshistory.Recorder).
type SystemHistory interface {
	RecordPresence(online int)
	RecordFrontend(event obshistory.FrontendEvent)
}

// FrontendMetrics exports frontend events and their log line
// (telemetry.Recorder).
type FrontendMetrics interface {
	RecordFrontend(eventType, metricName string, value *float64, frontendContext, release string)
	LogLine(line string)
}

type SystemConfig struct {
	Config
	Counter OnlineCounter
	History SystemHistory
	Metrics FrontendMetrics
	// AdminUsernames mirrors ADMIN_USERNAMES ("*" means everyone).
	AdminUsernames []string
	// DisabledFeatures mirrors CHESS_DISABLED_FEATURES.
	DisabledFeatures string
	// BillingSecret mirrors CHESS_AI_SHARED_SECRET.
	BillingSecret  string
	BillingMetrics BillingMetrics
}

type SystemHandler struct {
	base           *Handler
	counter        OnlineCounter
	history        SystemHistory
	metrics        FrontendMetrics
	admins         []string
	allAdmins      bool
	features       map[string]bool
	defaultLimits  map[string]*limiter
	telemetryLimit *limiter
	billingSecret  string
	billingMetrics BillingMetrics
}

// publicFeatureDefaults mirrors feature_flags.PUBLIC_FEATURE_DEFAULTS.
var publicFeatureDefaults = map[string]bool{
	"homeGuide":        true,
	"postGameFeedback": true,
	"spectator":        true,
}

// PublicFeatureFlags mirrors feature_flags.public_feature_flags.
func PublicFeatureFlags(rawDisabled string) map[string]bool {
	disabled := map[string]bool{}
	for _, part := range strings.Split(rawDisabled, ",") {
		if name := strings.ToLower(strings.TrimSpace(part)); name != "" {
			disabled[name] = true
		}
	}
	out := make(map[string]bool, len(publicFeatureDefaults))
	for name, enabled := range publicFeatureDefaults {
		out[name] = enabled && !disabled[strings.ToLower(name)]
	}
	return out
}

func NewSystem(cfg SystemConfig) (*SystemHandler, error) {
	if cfg.Counter == nil {
		return nil, errors.New("system API needs the users store")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	h := &SystemHandler{
		base: base, counter: cfg.Counter, history: cfg.History, metrics: cfg.Metrics,
		features: PublicFeatureFlags(cfg.DisabledFeatures),
		defaultLimits: map[string]*limiter{
			StatusPattern:   newLimiter(120, time.Minute),
			FeaturesPattern: newLimiter(120, time.Minute),
		},
		telemetryLimit: newLimiter(120, time.Minute),
		billingSecret:  strings.TrimSpace(cfg.BillingSecret),
		billingMetrics: cfg.BillingMetrics,
	}
	seen := map[string]bool{}
	for _, raw := range cfg.AdminUsernames {
		name := strings.ToLower(strings.TrimSpace(raw))
		switch {
		case name == "":
		case name == "*":
			h.allAdmins = true
		case !seen[name]:
			seen[name] = true
			h.admins = append(h.admins, name)
		}
	}
	sort.Strings(h.admins)
	return h, nil
}

func (h *SystemHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, ok := SystemRoute(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	b := h.base
	securityHeaders(w)
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	_, allowed := b.origins[origin]
	if r.Method == http.MethodOptions {
		b.preflight(w, r, origin, allowed)
		return
	}
	if origin != "" && allowed {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
		w.Header().Add("Vary", "Origin")
	}
	w.Header().Set("X-Chess-System-Native", "go")
	if pattern == BillingPattern {
		h.billing(w, r)
		return
	}

	subject, version, tokenErr := b.verify(r)
	if limit := h.defaultLimits[pattern]; limit != nil {
		key := "user:" + subject
		if tokenErr != nil {
			key = "ip:" + b.clientIP(r)
		}
		if !limit.allow(key, b.now()) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
			return
		}
	}

	var body []byte
	if pattern == ClientTelemetryPattern {
		if r.ContentLength > MaxRequestBodyBytes {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
			return
		}
		read, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBodyBytes+1))
		if err != nil || len(read) > MaxRequestBodyBytes {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
			return
		}
		body = read
	}

	username, status, detail := b.currentUser(r, subject, version, tokenErr)
	if status != 0 {
		writeJSON(w, status, map[string]any{"detail": detail})
		return
	}
	if b.presence != nil {
		b.presence.Touch(r, username)
	}

	switch pattern {
	case StatusPattern:
		h.status(w, r)
	case FeaturesPattern:
		writeJSON(w, http.StatusOK, map[string]any{"features": h.features})
	default:
		event, detail := parseClientTelemetry(body)
		if detail != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": detail})
			return
		}
		if !h.telemetryLimit.allow("user:"+username, b.now()) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
			return
		}
		h.recordClientEvent(event, username)
		w.WriteHeader(http.StatusNoContent)
	}
}

// status mirrors public_status: the anonymous count of accounts active in the
// last 150 s, admins excluded in the query itself; storage trouble degrades
// to presenceAvailable false instead of an error.
func (h *SystemHandler) status(w http.ResponseWriter, r *http.Request) {
	online := 0
	if !h.allAdmins {
		since := presence.PyUTCISOFormat(h.base.now().Add(-onlineWindow))
		count, err := h.counter.CountOnline(context.WithoutCancel(r.Context()), since, h.admins)
		if err != nil {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "onlineUsers": nil, "presenceAvailable": false})
			return
		}
		online = count
	}
	if h.history != nil {
		h.history.RecordPresence(online)
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "onlineUsers": online, "presenceAvailable": true})
}

type clientEvent struct {
	EventType  string
	MetricName *string
	Value      *float64
	ErrorName  *string
	Context    *string
	Release    *string
}

// parseClientTelemetry mirrors ClientTelemetryRequest (aliases or field
// names, max lengths, lax optional float value).
func parseClientTelemetry(body []byte) (clientEvent, []map[string]any) {
	var event clientEvent
	if len(strings.TrimSpace(string(body))) == 0 {
		return event, []map[string]any{{"type": "missing", "loc": []any{"body"}, "msg": "Field required"}}
	}
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return event, []map[string]any{{"type": "json_invalid", "loc": []any{"body", 0}, "msg": "JSON decode error"}}
	}
	fields, ok := raw.(map[string]any)
	if !ok {
		return event, []map[string]any{{"type": "model_attributes_type", "loc": []any{"body"}, "msg": "Input should be a valid dictionary or object to extract fields from"}}
	}
	var detail []map[string]any
	lookup := func(alias, name string) (string, any, bool) {
		if value, present := fields[alias]; present {
			return alias, value, true
		}
		if value, present := fields[name]; present {
			return name, value, true
		}
		return alias, nil, false
	}
	str := func(key string, value any, limit int) (string, bool) {
		s, isString := value.(string)
		if !isString {
			detail = append(detail, map[string]any{"type": "string_type", "loc": []any{"body", key}, "msg": "Input should be a valid string"})
			return "", false
		}
		if len([]rune(s)) > limit {
			detail = append(detail, map[string]any{"type": "string_too_long", "loc": []any{"body", key}, "msg": "String should have at most " + characters(limit)})
			return "", false
		}
		return s, true
	}
	if key, value, present := lookup("eventType", "event_type"); !present {
		detail = append(detail, map[string]any{"type": "missing", "loc": []any{"body", key}, "msg": "Field required"})
	} else if s, ok := str(key, value, 32); ok {
		event.EventType = s
	}
	optional := func(alias, name string, limit int) *string {
		key, value, present := lookup(alias, name)
		if !present || value == nil {
			return nil
		}
		if s, ok := str(key, value, limit); ok {
			return &s
		}
		return nil
	}
	event.MetricName = optional("metricName", "metric_name", 16)
	if value, present := fields["value"]; present && value != nil {
		encoded, _ := json.Marshal(value)
		if number, err := gameops.LaxFloat(encoded); err != nil {
			detail = append(detail, map[string]any{"type": "float_parsing", "loc": []any{"body", "value"}, "msg": "Input should be a valid number"})
		} else {
			event.Value = &number
		}
	}
	event.ErrorName = optional("errorName", "error_name", 80)
	event.Context = optional("context", "context", 48)
	event.Release = optional("release", "release", 40)
	return event, detail
}

var allowedClientEvents = map[string]bool{"frontend_error": true, "unhandled_rejection": true, "web_vital": true}
var allowedVitals = map[string]bool{"FCP": true, "LCP": true, "CLS": true, "TTFB": true, "INP": true}

func orDefault(value *string, fallback string) string {
	if value == nil || *value == "" {
		return fallback
	}
	return *value
}

// recordClientEvent mirrors client_telemetry.record_client_event: unknown
// events and invalid Web Vitals are dropped silently; the rest feed the
// Admin history, the OTel metrics and one operational log line.
func (h *SystemHandler) recordClientEvent(event clientEvent, username string) {
	eventType := truncate(event.EventType, 32)
	if !allowedClientEvents[eventType] {
		return
	}
	metricName := truncate(orDefault(event.MetricName, ""), 16)
	var value *float64
	if eventType == "web_vital" {
		if !allowedVitals[metricName] || event.Value == nil {
			return
		}
		numeric := *event.Value
		if math.IsNaN(numeric) || math.IsInf(numeric, 0) || numeric < 0 || numeric > 1_000_000 {
			return
		}
		rounded, _ := strconv.ParseFloat(strconv.FormatFloat(numeric, 'f', 3, 64), 64)
		value = &rounded
	} else {
		metricName = ""
	}
	errorName := truncate(orDefault(event.ErrorName, ""), 80)
	frontendContext := truncate(orDefault(event.Context, "unknown"), 48)
	release := truncate(orDefault(event.Release, "unknown"), 40)

	if h.history != nil {
		h.history.RecordFrontend(obshistory.FrontendEvent{
			EventType: eventType, MetricName: metricName, Value: value,
			ErrorName: errorName, Context: frontendContext, Release: release,
		})
	}
	if h.metrics == nil {
		return
	}
	h.metrics.RecordFrontend(eventType, metricName, value, frontendContext, release)
	line := map[string]any{
		"event":      "frontend_telemetry",
		"event_type": eventType,
		"context":    frontendContext,
		"release":    release,
	}
	if metricName != "" {
		line["metric_name"] = metricName
		line["value"] = *value
	}
	if errorName != "" {
		line["error_name"] = errorName
	}
	if username != "" {
		line["username"] = truncate(username, 64)
	}
	if encoded, err := pyjson.Dumps(line); err == nil {
		h.metrics.LogLine(encoded)
	}
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

// characters is pydantic's "N character(s)".
func characters(n int) string {
	if n == 1 {
		return "1 character"
	}
	return strconv.Itoa(n) + " characters"
}

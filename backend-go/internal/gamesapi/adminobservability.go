package gamesapi

// Admin's observability panel, mirroring admin_api.py (require_admin, the
// default 120/minute each; the panel, an optional path, is shed under
// pressure):
//
//	GET  /api/admin/observability?from_time=&to_time=
//	POST /api/admin/observability/trace-probe
//	POST /api/admin/observability/probe
//
// The persistent sections (history, frontend vitals, deployments) read the
// same MongoDB documents Python reads. The process-local ones describe the
// Go edge: its request window (every API request it answers), its Workers AI
// gateway and pressure, its OTLP export. Shadow evaluation does not exist in
// Go, so it always reports disabled.

import (
	"context"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/obshistory"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/release"
)

const (
	AdminObservabilityPattern = "GET /api/admin/observability"
	AdminTraceProbePattern    = "POST /api/admin/observability/trace-probe"
	AdminSignalProbePattern   = "POST /api/admin/observability/probe"
)

var adminObservabilityPaths = map[string]string{
	"/api/admin/observability":             AdminObservabilityPattern,
	"/api/admin/observability/trace-probe": AdminTraceProbePattern,
	"/api/admin/observability/probe":       AdminSignalProbePattern,
}

// AdminObservabilityRoute reports whether a request is a native panel route.
func AdminObservabilityRoute(r *http.Request) (string, bool) {
	method := r.Method
	if method == http.MethodOptions {
		method = preflightMethod(r)
	}
	pattern, ok := adminObservabilityPaths[r.URL.Path]
	if !ok || !strings.HasPrefix(pattern, method+" ") {
		return "", false
	}
	return pattern, true
}

// ObservabilityGateway is the narrative gateway's pressure side.
type ObservabilityGateway interface {
	Enter() int64
	Exit()
	ShouldShed(inflight int64) bool
	RecordShed()
	Pressure() bson.D
	DependencyHealth() bson.D
}

// DeploymentAnnotations is obshistory.Deployments.
type DeploymentAnnotations interface {
	EnsureCurrent(ctx context.Context)
	List(ctx context.Context) bson.A
}

type AdminObservabilityConfig struct {
	Config
	// History is obshistory.History bound to the database and recorder.
	History func(ctx context.Context, from, to *string, now time.Time) (bson.D, error)
	// HTTP is the edge's request window (httpwindow.Window.Metrics).
	HTTP func() bson.D
	// Database is get_database_metrics: a ping of the edge's MongoDB.
	Database    func(ctx context.Context) bson.D
	Gateway     ObservabilityGateway
	Deployments DeploymentAnnotations
	// Tracing is telemetry.Diagnostics for this process; TraceProbe and
	// SignalProbe are its emit_trace_probe and emit_observability_probe.
	Tracing        func() bson.D
	TraceProbe     func(ctx context.Context) bson.D
	SignalProbe    func(ctx context.Context) bson.D
	Env            func(string) string
	AdminUsernames []string
}

type AdminObservabilityHandler struct {
	cfg    AdminObservabilityConfig
	base   *Handler
	admins adminSet
	limits map[string]*limiter
}

func NewAdminObservability(cfg AdminObservabilityConfig) (*AdminObservabilityHandler, error) {
	if cfg.History == nil || cfg.HTTP == nil || cfg.Database == nil || cfg.Gateway == nil || cfg.Deployments == nil || cfg.Tracing == nil || cfg.TraceProbe == nil || cfg.SignalProbe == nil {
		return nil, errors.New("admin observability API: missing dependency")
	}
	if cfg.Env == nil {
		cfg.Env = func(string) string { return "" }
	}
	cfg.Store = readOnlyStore{}
	base, err := New(cfg.Config)
	if err != nil {
		return nil, err
	}
	limits := map[string]*limiter{}
	for _, pattern := range adminObservabilityPaths {
		limits[pattern] = newLimiter(120, time.Minute)
	}
	return &AdminObservabilityHandler{cfg: cfg, base: base, admins: newAdminSet(cfg.AdminUsernames), limits: limits}, nil
}

// lastQuery is a FastAPI Optional[str] query parameter: the last value.
func lastQuery(r *http.Request, key string) *string {
	values, ok := r.URL.Query()[key]
	if !ok || len(values) == 0 {
		return nil
	}
	return &values[len(values)-1]
}

// pyFloatEnv is float(raw) for a settings variable (fallback when invalid).
func pyFloatEnv(raw string, fallback float64) float64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseFloat(strings.ReplaceAll(raw, "_", ""), 64)
	if err != nil {
		return fallback
	}
	return v
}

// pyClamp is max(lo, min(v, hi)) with Python's NaN semantics.
func pyClamp(v, lo, hi float64) float64 {
	if hi < v { // min(v, hi)
		v = hi
	}
	if v > lo { // max(lo, v)
		return v
	}
	return lo
}

// shadowMetrics is get_shadow_metrics for a process that never samples.
func (h *AdminObservabilityHandler) shadowMetrics() bson.D {
	return bson.D{
		{Key: "enabled", Value: false},
		{Key: "sample_percent", Value: 0.0},
		{Key: "level_delta", Value: pyClamp(pyFloatEnv(h.cfg.Env("SHADOW_EVAL_LEVEL_DELTA"), 10), 1, 30)},
		{Key: "samples", Value: int64(0)},
		{Key: "same_move_percent", Value: nil},
		{Key: "errors", Value: int64(0)},
		{Key: "p95_ms", Value: nil},
		{Key: "mean_abs_score_delta", Value: nil},
		{Key: "authoritative", Value: false},
	}
}

func (h *AdminObservabilityHandler) panel(ctx context.Context, from, to *string) (bson.D, error) {
	history, err := h.cfg.History(ctx, from, to, h.base.now())
	if err != nil {
		var rangeErr *obshistory.RangeError
		if errors.As(err, &rangeErr) {
			return nil, fail(400, rangeErr.Message)
		}
		return nil, err
	}
	database := h.cfg.Database(ctx)
	ai := h.cfg.Gateway.DependencyHealth()
	resilience := h.cfg.Gateway.Pressure()
	h.cfg.Deployments.EnsureCurrent(ctx)
	get := func(doc bson.D, key string) any { v, _ := pydoc.Get(doc, key); return v }
	mongoStatus := "down"
	if s := get(database, "status"); s == "ok" || s == "memory" {
		mongoStatus = "ok"
	}
	circuitOpen := get(ai, "circuitOpen")
	if circuitOpen == nil {
		circuitOpen = false
	}
	frontend := get(history, "frontend")
	if _, ok := frontend.(bson.D); !ok {
		frontend = bson.D{}
	}
	return bson.D{
		{Key: "http", Value: h.cfg.HTTP()},
		{Key: "database", Value: database},
		{Key: "history", Value: history},
		{Key: "dependencies", Value: bson.A{
			bson.D{{Key: "id", Value: "mongo"}, {Key: "label", Value: "MongoDB"}, {Key: "status", Value: mongoStatus}, {Key: "critical", Value: true}, {Key: "latencyMs", Value: get(database, "latency_ms")}},
			bson.D{{Key: "id", Value: "workers_ai"}, {Key: "label", Value: "Workers AI"}, {Key: "status", Value: get(ai, "status")}, {Key: "critical", Value: false}, {Key: "circuitOpen", Value: circuitOpen}},
		}},
		{Key: "aiDependency", Value: ai},
		{Key: "resilience", Value: resilience},
		{Key: "frontend", Value: frontend},
		{Key: "deployments", Value: h.cfg.Deployments.List(ctx)},
		{Key: "shadow", Value: h.shadowMetrics()},
		{Key: "tracing", Value: h.cfg.Tracing()},
		{Key: "backendRelease", Value: release.AppRelease},
	}, nil
}

func (h *AdminObservabilityHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, ok := AdminObservabilityRoute(r)
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
	w.Header().Set("X-Chess-Admin-Native", "go")

	// The panel is an optional path: shed before anything else to protect
	// the games (the probes are not, as in Python's _OPTIONAL_PATHS).
	if pattern == AdminObservabilityPattern {
		inflight := h.cfg.Gateway.Enter()
		defer h.cfg.Gateway.Exit()
		if h.cfg.Gateway.ShouldShed(inflight) {
			h.cfg.Gateway.RecordShed()
			w.Header().Set("Retry-After", "5")
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"detail":    "Servicio ocupado; la función secundaria se ha aplazado para proteger las partidas.",
				"requestId": w.Header().Get("X-Request-ID"),
				"degraded":  true,
			})
			return
		}
	}
	if r.ContentLength > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}
	subject, version, tokenErr := b.verify(r)
	key := "user:" + subject
	if tokenErr != nil {
		key = "ip:" + b.clientIP(r)
	}
	if !h.limits[pattern].allow(key, b.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
		return
	}
	username, status, detail := b.currentUser(r, subject, version, tokenErr)
	if status != 0 {
		writeJSON(w, status, map[string]any{"detail": detail})
		return
	}
	if b.presence != nil {
		b.presence.Touch(r, username)
	}
	if !h.admins.has(username) {
		writeJSON(w, http.StatusForbidden, map[string]any{"detail": "No tienes permisos de administrador."})
		return
	}
	ctx := context.WithoutCancel(r.Context())
	switch pattern {
	case AdminTraceProbePattern:
		writeDoc(w, http.StatusOK, h.cfg.TraceProbe(ctx))
		return
	case AdminSignalProbePattern:
		writeDoc(w, http.StatusOK, h.cfg.SignalProbe(ctx))
		return
	}
	payload, err := h.panel(ctx, lastQuery(r, "from_time"), lastQuery(r, "to_time"))
	if err != nil {
		var he *httpError
		if errors.As(err, &he) {
			writeJSON(w, he.status, map[string]any{"detail": he.detail})
			return
		}
		internalError(w)
		return
	}
	writeDoc(w, http.StatusOK, payload)
}

// DatabaseMetrics is get_database_metrics for a required MongoDB: one ping
// with Python's 1.5 s budget; any failure is "down" with an error class.
func DatabaseMetrics(ctx context.Context, ping func(context.Context) error) bson.D {
	started := time.Now()
	ctx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	err := ping(ctx)
	latency := pyRoundFloat(float64(time.Since(started))/float64(time.Millisecond), 2)
	if err == nil {
		return bson.D{{Key: "status", Value: "ok"}, {Key: "mode", Value: "mongo"}, {Key: "latency_ms", Value: latency}}
	}
	name := "PyMongoError"
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		name = "TimeoutError"
	case strings.Contains(strings.ToLower(err.Error()), "server selection"):
		name = "ServerSelectionTimeoutError"
	}
	return bson.D{{Key: "status", Value: "down"}, {Key: "mode", Value: "mongo"}, {Key: "latency_ms", Value: latency}, {Key: "error", Value: name}}
}

func pyRoundFloat(x float64, digits int) float64 {
	if math.IsNaN(x) || math.IsInf(x, 0) {
		return x
	}
	v, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'f', digits, 64), 64)
	return v
}

package gamesapi

// The Python process' own identity routes, served by Go once Python is
// retired (system_api.py; slowapi-exempt):
//
//	GET /             (authenticated index)
//	GET /api/health   (pure liveness)
//	GET /api/release  (packaged release and build commit)
//	GET /api/ready    (staging runtime contract, then a MongoDB ping)
//
// and the router's answer for anything no route matches: Starlette's
// {"detail": "Not Found"}, or "Method Not Allowed" with Allow when the path
// exists under another method, and CORSMiddleware's preflight for any path.

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	IdentityRootPattern    = "GET /"
	IdentityHealthPattern  = "GET /api/health"
	IdentityReleasePattern = "GET /api/release"
	IdentityReadyPattern   = "GET /api/ready"
	// UnmatchedRoute is the label Python's access log uses for a request no
	// route matched.
	UnmatchedRoute = "unmatched"

	runtimeSchemaKey     = "CHESS_STUDIO_RUNTIME_SCHEMA"
	runtimeSchemaVersion = "vault-git-v1"
)

var identityPaths = map[string]string{
	"/":            IdentityRootPattern,
	"/api/health":  IdentityHealthPattern,
	"/api/release": IdentityReleasePattern,
	"/api/ready":   IdentityReadyPattern,
}

// IdentityRoute reports whether a request is one of the identity routes.
func IdentityRoute(r *http.Request) (string, bool) {
	method := r.Method
	if method == http.MethodOptions {
		method = preflightMethod(r)
	}
	pattern, ok := identityPaths[r.URL.Path]
	if !ok || method != http.MethodGet {
		return "", false
	}
	return pattern, true
}

type IdentityConfig struct {
	Config
	// Release is release_info.backend_release(); Build is build_commit().
	Release string
	Build   string
	// Ping is the MongoDB readiness probe.
	Ping func(ctx context.Context) error
	// Ready records the first observed readiness (httpwindow.RecordReady).
	Ready func()
	Env   func(string) string
}

type IdentityHandler struct {
	cfg  IdentityConfig
	base *Handler
}

func NewIdentity(cfg IdentityConfig) (*IdentityHandler, error) {
	if cfg.Ping == nil || strings.TrimSpace(cfg.Release) == "" {
		return nil, errors.New("identity API needs a release and a database probe")
	}
	if cfg.Env == nil {
		cfg.Env = func(string) string { return "" }
	}
	if cfg.Ready == nil {
		cfg.Ready = func() {}
	}
	cfg.Store = readOnlyStore{}
	base, err := New(cfg.Config)
	if err != nil {
		return nil, err
	}
	return &IdentityHandler{cfg: cfg, base: base}, nil
}

// cors applies CORSMiddleware's simple-response headers; it reports true
// when the request was a preflight and has been answered.
func (h *IdentityHandler) cors(w http.ResponseWriter, r *http.Request) bool {
	b := h.base
	securityHeaders(w)
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	_, allowed := b.origins[origin]
	if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
		b.preflight(w, r, origin, allowed)
		return true
	}
	if origin != "" && allowed {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
		w.Header().Add("Vary", "Origin")
	}
	return false
}

// stagingContractReady is runtime_contract.staging_runtime_contract_ready.
func (h *IdentityHandler) stagingContractReady() bool {
	if strings.ToLower(strings.TrimSpace(h.cfg.Env("ENVIRONMENT"))) != "staging" {
		return true
	}
	return strings.TrimSpace(h.cfg.Env(runtimeSchemaKey)) == runtimeSchemaVersion
}

func (h *IdentityHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, ok := IdentityRoute(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if h.cors(w, r) {
		return
	}
	switch pattern {
	case IdentityHealthPattern:
		// Pure liveness: storage being down must not cause a restart loop.
		writeDoc(w, http.StatusOK, bson.D{{Key: "ok", Value: true}})
	case IdentityReleasePattern:
		payload := bson.D{{Key: "release", Value: h.cfg.Release}}
		if h.cfg.Build != "" {
			payload = append(payload, bson.E{Key: "build", Value: h.cfg.Build})
		}
		writeDoc(w, http.StatusOK, payload)
	case IdentityReadyPattern:
		if !h.stagingContractReady() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "Staging runtime contract is not materialized."})
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if err := h.cfg.Ping(ctx); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "MongoDB no está lista."})
			return
		}
		h.cfg.Ready()
		writeDoc(w, http.StatusOK, bson.D{{Key: "ok", Value: true}, {Key: "storage", Value: "mongo"}})
	case IdentityRootPattern:
		b := h.base
		subject, version, tokenErr := b.verify(r)
		username, status, detail := b.currentUser(r, subject, version, tokenErr)
		if status != 0 {
			writeJSON(w, status, map[string]any{"detail": detail})
			return
		}
		if b.presence != nil {
			b.presence.Touch(r, username)
		}
		writeDoc(w, http.StatusOK, bson.D{
			{Key: "ok", Value: true},
			{Key: "service", Value: "Chess Studio API"},
			{Key: "health", Value: "/api/health"},
			{Key: "ready", Value: "/api/ready"},
		})
	}
}

// Unmatched answers a request no route matched, as Starlette's router and
// CORSMiddleware would; methods are those some route answers for the path.
func (h *IdentityHandler) Unmatched(w http.ResponseWriter, r *http.Request, methods []string) {
	if h.cors(w, r) {
		return
	}
	if len(methods) > 0 {
		sort.Strings(methods)
		w.Header().Set("Allow", strings.Join(methods, ", "))
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Method Not Allowed"})
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Not Found"})
}

// Package gamesapi serves the read and delete routes of games against the CPU
// natively, mirroring game_api.py:
//
//	GET    /api/games            list_games
//	GET    /api/games/{game_id}  get_game
//	DELETE /api/games/{game_id}  delete_game
//
// Everything around the handler body is Python's too: get_current_user (JWT,
// account existence and session version, activity touch), the CORS
// middleware, the security headers, the 120/minute default rate limit and the
// 503 that PersistentStorageUnavailable becomes. The other /api/games routes
// (create, move, undo, hint) stay in Python until their own ports land.
package gamesapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/corspolicy"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamecore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamestore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
)

// Route patterns as FastAPI reports them (telemetry http.route).
const (
	ListPattern = "/api/games"
	GamePattern = "/api/games/{game_id}"
)

// Route reports whether a request is one of this package's routes and the
// FastAPI pattern it maps to. Anything else (POST /api/games, /hint, /move,
// /undo) belongs to Python.
func Route(r *http.Request) (pattern, gameID string, ok bool) {
	path := r.URL.Path
	if path == ListPattern {
		if r.Method == http.MethodGet || r.Method == http.MethodOptions && preflightMethod(r) == http.MethodGet {
			return ListPattern, "", true
		}
		return "", "", false
	}
	rest, found := strings.CutPrefix(path, "/api/games/")
	if !found || rest == "" || strings.Contains(rest, "/") {
		return "", "", false
	}
	switch r.Method {
	case http.MethodGet, http.MethodDelete:
	case http.MethodOptions:
		if m := preflightMethod(r); m != http.MethodGet && m != http.MethodDelete {
			return "", "", false
		}
	default:
		return "", "", false
	}
	id, err := url.PathUnescape(rest)
	if err != nil {
		return "", "", false
	}
	return GamePattern, id, true
}

func preflightMethod(r *http.Request) string {
	return strings.ToUpper(strings.TrimSpace(r.Header.Get("Access-Control-Request-Method")))
}

// Store is the part of gamestore the routes need.
type Store interface {
	ListSummariesByOwner(ctx context.Context, owner string, limit int) ([]gamestore.Summary, error)
	GetDocumentForOwner(ctx context.Context, id, owner string) (bson.M, bool, error)
	DeleteForOwner(ctx context.Context, id, owner string) (bool, error)
}

// Accounts answers users_store.get_auth_state.
type Accounts interface {
	AuthState(ctx context.Context, username string) (exists bool, sessionVersion int64, err error)
}

// Presence records activity (main._touch_activity_best_effort).
type Presence interface {
	Touch(r *http.Request, username string)
}

type Config struct {
	Store          Store
	Accounts       Accounts
	Presence       Presence
	JWTSecret      string
	AllowedOrigins []string
	// RatePerMinute is slowapi's default_limits ("120/minute"); 0 uses 120.
	RatePerMinute int
	// TrustCloudflare mirrors _trust_cloudflare_client_ip: anonymous requests
	// are limited per CF-Connecting-IP, not per edge peer (every visitor would
	// share the nginx/sidecar address otherwise).
	TrustCloudflare bool
	Now             func() time.Time
}

type Handler struct {
	store    Store
	accounts Accounts
	presence Presence
	secret   []byte
	origins  map[string]struct{}
	limiter  *limiter
	now      func() time.Time
	trustCF  bool
}

func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil || cfg.Accounts == nil {
		return nil, errors.New("games API needs a store and accounts")
	}
	secret := strings.TrimSpace(cfg.JWTSecret)
	if secret == "" {
		return nil, errors.New("games API needs JWT_SECRET")
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	rate := cfg.RatePerMinute
	if rate <= 0 {
		rate = 120
	}
	origins := map[string]struct{}{}
	for _, raw := range append(corspolicy.CanonicalBrowserOrigins(), cfg.AllowedOrigins...) {
		if origin := normalizeOrigin(raw); origin != "" {
			origins[origin] = struct{}{}
		}
	}
	return &Handler{
		store:    cfg.Store,
		accounts: cfg.Accounts,
		presence: cfg.Presence,
		secret:   []byte(secret),
		origins:  origins,
		limiter:  newLimiter(rate, time.Minute),
		trustCF:  cfg.TrustCloudflare,
		now:      now,
	}, nil
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, gameID, ok := Route(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	securityHeaders(w)
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	_, allowed := h.origins[origin]
	if r.Method == http.MethodOptions {
		h.preflight(w, r, origin, allowed)
		return
	}
	if origin != "" && allowed {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
		w.Header().Add("Vary", "Origin")
	}
	w.Header().Set("X-Chess-Games-Native", "go")

	subject, version, tokenErr := h.verify(r)
	key := "user:" + subject
	if tokenErr != nil {
		key = "ip:" + h.clientIP(r)
	}
	if !h.limiter.allow(key, h.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
		return
	}

	username, status, detail := h.currentUser(r, subject, version, tokenErr)
	if status != 0 {
		writeJSON(w, status, map[string]any{"detail": detail})
		return
	}
	if h.presence != nil {
		h.presence.Touch(r, username)
	}

	switch {
	case pattern == ListPattern:
		h.list(w, r, username)
	case r.Method == http.MethodDelete:
		h.delete(w, r, gameID, username)
	default:
		h.get(w, r, gameID, username)
	}
}

func (h *Handler) verify(r *http.Request) (string, int64, error) {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return "", 0, errMissingToken
	}
	return sessionauth.VerifySession(header[len("Bearer "):], h.secret, h.now())
}

var errMissingToken = errors.New("missing token")

// currentUser mirrors main.get_current_user.
func (h *Handler) currentUser(r *http.Request, subject string, version int64, tokenErr error) (string, int, string) {
	if errors.Is(tokenErr, errMissingToken) {
		return "", http.StatusUnauthorized, "Falta el token de sesión."
	}
	if tokenErr != nil {
		return "", http.StatusUnauthorized, "Sesión inválida o expirada. Inicia sesión de nuevo."
	}
	exists, accountVersion, err := h.accounts.AuthState(r.Context(), subject)
	if err != nil {
		return "", http.StatusServiceUnavailable, "No se puede verificar la sesión temporalmente."
	}
	if !exists || accountVersion != version {
		return "", http.StatusUnauthorized, "La cuenta ya no existe."
	}
	return subject, 0, ""
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request, username string) {
	games, err := h.store.ListSummariesByOwner(r.Context(), username, gamestore.DefaultSummaryLimit)
	if err != nil {
		storageUnavailable(w)
		return
	}
	if games == nil {
		games = []gamestore.Summary{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"games": games})
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request, gameID, username string) {
	doc, found, err := h.store.GetDocumentForOwner(r.Context(), gameID, username)
	if err != nil {
		storageUnavailable(w)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida no encontrada."})
		return
	}
	raw := plain(doc).(map[string]any)
	if raw["owner"] == nil {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "Partida antigua sin propietario. Inicia una partida nueva."})
		return
	}
	// load_stored_game_board: a damaged or impossible stored game is a
	// recoverable conflict, never a 500.
	entry, err := gamecore.ParseEntry(raw)
	var board *gamecore.Board
	if err == nil {
		board, err = gamecore.LoadBoard(entry)
	}
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "La partida guardada está dañada y no puede continuar. Inicia una nueva partida."})
		return
	}
	if !board.IsValid() {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "La partida guardada contiene una posición imposible. Inicia una nueva partida."})
		return
	}
	writeJSON(w, http.StatusOK, board.Snapshot(gameID, entry))
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request, gameID, username string) {
	deleted, err := h.store.DeleteForOwner(r.Context(), gameID, username)
	if err != nil {
		storageUnavailable(w)
		return
	}
	if !deleted {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida no encontrada."})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// The CORSMiddleware configuration in main.py, as Starlette expands it
// (the CORS-safelisted headers are always allowed).
var (
	corsMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
	corsHeaders = []string{"Accept", "Accept-Language", "Authorization", "Content-Language", "Content-Type", "Idempotency-Key", "X-API-Key", "X-Client-Release", "X-Presence-Session", "X-Request-ID"}
)

// preflight mirrors Starlette's CORSMiddleware.preflight_response: a 400 with
// the reasons when the origin, method or a requested header is not allowed.
func (h *Handler) preflight(w http.ResponseWriter, r *http.Request, origin string, allowed bool) {
	hdr := w.Header()
	hdr.Add("Vary", "Origin")
	hdr.Set("Access-Control-Allow-Methods", corsMethods)
	hdr.Set("Access-Control-Allow-Headers", strings.Join(corsHeaders, ", "))
	hdr.Set("Access-Control-Max-Age", "600")
	var failures []string
	if allowed {
		hdr.Set("Access-Control-Allow-Origin", origin)
	} else {
		failures = append(failures, "origin")
	}
	if !strings.Contains(", "+corsMethods+", ", ", "+preflightMethod(r)+", ") {
		failures = append(failures, "method")
	}
	allowedHeaders := map[string]bool{}
	for _, name := range corsHeaders {
		allowedHeaders[strings.ToLower(name)] = true
	}
	for _, requested := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
		if name := strings.ToLower(strings.TrimSpace(requested)); name != "" && !allowedHeaders[name] {
			failures = append(failures, "headers")
			break
		}
	}
	hdr.Set("Content-Type", "text/plain; charset=utf-8")
	if len(failures) > 0 {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("Disallowed CORS " + strings.Join(failures, ", ")))
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("OK"))
}

// securityHeaders mirrors main.security_baseline.
func securityHeaders(w http.ResponseWriter) {
	h := w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-Frame-Options", "DENY")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
	h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
}

// storageUnavailable mirrors persistent_storage_unavailable_handler.
func storageUnavailable(w http.ResponseWriter) {
	writeJSON(w, http.StatusServiceUnavailable, map[string]any{
		"detail":    "La base de datos no está disponible temporalmente.",
		"requestId": w.Header().Get("X-Request-ID"),
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(payload)
}

// normalizeOrigin mirrors main._normalize_cors_origin.
func normalizeOrigin(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	if !strings.Contains(value, "://") {
		value = "https://" + value
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	return strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host)
}

// plain turns decoded BSON into the plain maps and lists Python sees.
func plain(value any) any {
	switch v := value.(type) {
	case bson.M:
		out := make(map[string]any, len(v))
		for k, item := range v {
			out[k] = plain(item)
		}
		return out
	case bson.D:
		out := make(map[string]any, len(v))
		for _, e := range v {
			out[e.Key] = plain(e.Value)
		}
		return out
	case bson.A:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = plain(item)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(v))
		for k, item := range v {
			out[k] = plain(item)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = plain(item)
		}
		return out
	}
	return value
}

// clientIP mirrors rate_limit_key's anonymous branch.
func (h *Handler) clientIP(r *http.Request) string {
	if h.trustCF || strings.TrimSpace(r.Header.Get("CF-Ray")) != "" {
		if ip := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); ip != "" {
			return ip
		}
	}
	return remoteHost(r.RemoteAddr)
}

func remoteHost(addr string) string {
	if i := strings.LastIndex(addr, ":"); i > 0 {
		return strings.Trim(addr[:i], "[]")
	}
	return addr
}

// limiter is slowapi's fixed-window default limit, per key, per process.
type limiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	buckets map[string]bucket
}

type bucket struct {
	start time.Time
	count int
}

func newLimiter(limit int, window time.Duration) *limiter {
	return &limiter{limit: limit, window: window, buckets: map[string]bucket{}}
}

func (l *limiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	b := l.buckets[key]
	if b.start.IsZero() || now.Sub(b.start) >= l.window {
		if len(l.buckets) > 10000 {
			for k, old := range l.buckets {
				if now.Sub(old.start) >= l.window {
					delete(l.buckets, k)
				}
			}
		}
		b = bucket{start: now}
	}
	if b.count >= l.limit {
		l.buckets[key] = b
		return false
	}
	b.count++
	l.buckets[key] = b
	return true
}

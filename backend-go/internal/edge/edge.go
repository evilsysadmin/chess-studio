package edge

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamesapi"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/httpwindow"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvproute"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/runtimeidentity"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/telemetry"
)

const serviceName = runtimeidentity.LegacyPvPServiceName

type Config struct {
	UpstreamURL               string
	Release                   string
	ReadyTimeout              time.Duration
	NativePulse               http.Handler
	NativeLobbyRead           http.Handler
	NativeRoster              http.Handler
	NativeChat                http.Handler
	NativeChallengeResolution http.Handler
	NativeChallengeAccept     http.Handler
	NativeChallengeCreate     http.Handler
	NativeMatchHandoffCancel  http.Handler
	NativeMatchReady          http.Handler
	NativeMatchResign         http.Handler
	NativeMatchRead           http.Handler
	NativeMatchMove           http.Handler
	// NativeGamesRead serves GET /api/games, GET and DELETE
	// /api/games/{game_id} (games vs the CPU); nil keeps them in Python.
	NativeGamesRead http.Handler
	// NativeGamesWrite serves POST /api/games/{game_id}/move and /undo;
	// nil keeps them in Python.
	NativeGamesWrite http.Handler
	// NativeGamesHint serves GET /api/games/{game_id}/hint; nil keeps it in
	// Python.
	NativeGamesHint http.Handler
	// NativeGamesAnalyze serves POST /api/analyze and /api/analyze-move; nil
	// keeps them in Python.
	NativeGamesAnalyze http.Handler
	// NativeSystem serves GET /api/status, GET /api/features,
	// POST /api/client-telemetry and POST /api/internal/billing-costs; nil
	// keeps them in Python.
	NativeSystem http.Handler
	// NativeProfile serves GET, PUT and PATCH /api/profile; nil keeps them
	// in Python.
	NativeProfile http.Handler
	// NativeSession serves GET /api/auth/me, POST /api/auth/activity and
	// POST /api/auth/logout; nil keeps them in Python.
	NativeSession http.Handler
	// NativeLogin serves POST /api/auth/login; nil keeps it in Python.
	NativeLogin http.Handler
	// NativeAccount serves register, password and email changes and
	// delete-account; nil keeps them in Python.
	NativeAccount http.Handler
	// NativeRecovery serves forgot-password and reset-password; nil keeps
	// them in Python.
	NativeRecovery http.Handler
	// NativeFeedback serves the user feedback routes (submit, mine,
	// delete own); nil keeps them in Python.
	NativeFeedback http.Handler
	// NativeMatthias serves Matthias' daily status, briefing and memory
	// reset; nil keeps them in Python (the audience itself stays there).
	NativeMatthias http.Handler
	// NativeNarrative serves /api/narrative, the Matthias audience and the
	// admin AI reads that share its telemetry; nil keeps them in Python.
	NativeNarrative http.Handler
	// NativePawnSlug serves Pawn Slug stage content; nil keeps it in Python.
	NativePawnSlug http.Handler
	// NativeChronicles serves Chronicles area content and MapCode previews;
	// nil keeps them in Python.
	NativeChronicles http.Handler
	// NativeChroniclesRuns serves the Chronicles run routes; nil keeps them
	// in Python.
	NativeChroniclesRuns http.Handler
	// NativeAdminFeedback serves Admin's feedback management; nil keeps it
	// in Python.
	NativeAdminFeedback http.Handler
	// NativeAdminUsers serves Admin's user tools; nil keeps them in Python.
	NativeAdminUsers      http.Handler
	VirtualPlayersEnabled bool
	NativeResidentMove    bool
	// ReadyChecks are dependencies owned by the Go edge itself (MongoDB for the
	// native routes). Each must pass, alongside the Python upstream, for the
	// edge to report ready.
	ReadyChecks map[string]func(context.Context) error
	// Telemetry records the requests Go serves natively (metrics + access
	// log). Proxied requests are recorded by Python, so they are not wrapped.
	// Nil disables it.
	Telemetry *telemetry.Recorder
	// HTTPWindow is Admin's in-memory request window (observability.py's):
	// every API request the edge answers, native under its route pattern and
	// proxied as httpwindow.ProxiedRoute, plus the first observed readiness.
	// Nil disables it.
	HTTPWindow *httpwindow.Window
}

type Handler struct {
	upstream                  *url.URL
	proxy                     *httputil.ReverseProxy
	client                    *http.Client
	release                   string
	nativePulse               http.Handler
	nativeLobbyRead           http.Handler
	nativeRoster              http.Handler
	nativeChat                http.Handler
	nativeChallengeResolution http.Handler
	nativeChallengeAccept     http.Handler
	nativeChallengeCreate     http.Handler
	nativeMatchHandoffCancel  http.Handler
	nativeMatchReady          http.Handler
	nativeMatchResign         http.Handler
	nativeMatchRead           http.Handler
	nativeMatchMove           http.Handler
	nativeGamesRead           http.Handler
	nativeGamesWrite          http.Handler
	nativeGamesHint           http.Handler
	nativeGamesAnalyze        http.Handler
	nativeSystem              http.Handler
	nativeProfile             http.Handler
	nativeSession             http.Handler
	nativeLogin               http.Handler
	nativeAccount             http.Handler
	nativeRecovery            http.Handler
	nativeFeedback            http.Handler
	nativeMatthias            http.Handler
	nativeNarrative           http.Handler
	nativePawnSlug            http.Handler
	nativeChronicles          http.Handler
	nativeChroniclesRuns      http.Handler
	nativeAdminFeedback       http.Handler
	nativeAdminUsers          http.Handler
	virtualPlayersEnabled     bool
	nativeResidentMove        bool
	readyChecks               map[string]func(context.Context) error
	telemetry                 *telemetry.Recorder
	window                    *httpwindow.Window
}

func New(cfg Config) (*Handler, error) {
	raw := strings.TrimSpace(cfg.UpstreamURL)
	if raw == "" {
		return nil, errors.New("upstream URL is required")
	}
	upstream, err := url.Parse(raw)
	if err != nil || upstream.Scheme == "" || upstream.Host == "" {
		return nil, errors.New("invalid upstream URL")
	}
	if upstream.Scheme != "http" && upstream.Scheme != "https" {
		return nil, errors.New("upstream URL must use http or https")
	}
	if upstream.RawQuery != "" || upstream.Fragment != "" {
		return nil, errors.New("upstream URL must not contain query or fragment")
	}
	if upstream.Path != "" && upstream.Path != "/" {
		return nil, errors.New("upstream URL must not contain a path")
	}

	timeout := cfg.ReadyTimeout
	if timeout <= 0 {
		timeout = 2 * time.Second
	}

	proxy := httputil.NewSingleHostReverseProxy(upstream)
	// The edge fronts the whole API, not only PvP: keep a warm connection
	// pool to Python instead of the default two idle connections per host.
	proxy.Transport = &http.Transport{
		Proxy:                 nil,
		DialContext:           (&net.Dialer{Timeout: 2 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		MaxIdleConns:          128,
		MaxIdleConnsPerHost:   64,
		IdleConnTimeout:       90 * time.Second,
		ResponseHeaderTimeout: 45 * time.Second, // same as the nginx edge
		ExpectContinueTimeout: time.Second,
	}
	baseDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalHost := req.Host
		baseDirector(req)
		req.Header.Set("X-Forwarded-Host", originalHost)
		req.Header.Set("X-Chess-Edge", "go")
		if isPvPPath(req.URL.Path) {
			req.Header.Set("X-Chess-Pvp-Edge", "go")
		} else {
			req.Header.Del("X-Chess-Pvp-Edge")
		}
	}
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Set("X-Chess-Edge", "go")
		if resp.Request != nil && isPvPPath(resp.Request.URL.Path) {
			resp.Header.Set("X-Chess-Pvp-Edge", "go")
		} else {
			resp.Header.Del("X-Chess-Pvp-Edge")
		}
		return nil
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, _ error) {
		w.Header().Set("X-Chess-Edge", "go")
		if isPvPPath(r.URL.Path) {
			w.Header().Set("X-Chess-Pvp-Edge", "go")
		} else {
			w.Header().Del("X-Chess-Pvp-Edge")
		}
		code := "upstream_unavailable"
		if isPvPPath(r.URL.Path) {
			code = "pvp_upstream_unavailable"
		}
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"code":      code,
			"retryable": true,
			"service":   serviceName,
		})
	}

	return &Handler{
		upstream:                  upstream,
		proxy:                     proxy,
		client:                    &http.Client{Timeout: timeout},
		release:                   strings.TrimSpace(cfg.Release),
		nativePulse:               cfg.NativePulse,
		nativeLobbyRead:           cfg.NativeLobbyRead,
		nativeRoster:              cfg.NativeRoster,
		nativeChat:                cfg.NativeChat,
		nativeChallengeResolution: cfg.NativeChallengeResolution,
		nativeChallengeAccept:     cfg.NativeChallengeAccept,
		nativeChallengeCreate:     cfg.NativeChallengeCreate,
		nativeMatchHandoffCancel:  cfg.NativeMatchHandoffCancel,
		nativeMatchReady:          cfg.NativeMatchReady,
		nativeMatchResign:         cfg.NativeMatchResign,
		nativeMatchRead:           cfg.NativeMatchRead,
		nativeMatchMove:           cfg.NativeMatchMove,
		nativeGamesRead:           cfg.NativeGamesRead,
		nativeGamesWrite:          cfg.NativeGamesWrite,
		nativeGamesHint:           cfg.NativeGamesHint,
		nativeGamesAnalyze:        cfg.NativeGamesAnalyze,
		nativeSystem:              cfg.NativeSystem,
		nativeProfile:             cfg.NativeProfile,
		nativeSession:             cfg.NativeSession,
		nativeLogin:               cfg.NativeLogin,
		nativeAccount:             cfg.NativeAccount,
		nativeRecovery:            cfg.NativeRecovery,
		nativeFeedback:            cfg.NativeFeedback,
		nativeMatthias:            cfg.NativeMatthias,
		nativeNarrative:           cfg.NativeNarrative,
		nativePawnSlug:            cfg.NativePawnSlug,
		nativeChronicles:          cfg.NativeChronicles,
		nativeChroniclesRuns:      cfg.NativeChroniclesRuns,
		nativeAdminFeedback:       cfg.NativeAdminFeedback,
		nativeAdminUsers:          cfg.NativeAdminUsers,
		virtualPlayersEnabled:     cfg.VirtualPlayersEnabled,
		nativeResidentMove:        cfg.NativeResidentMove,
		readyChecks:               cfg.ReadyChecks,
		telemetry:                 cfg.Telemetry,
		window:                    cfg.HTTPWindow,
	}, nil
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/healthz":
		h.health(w)
		return
	case "/readyz", "/api/pvp/_edge/ready":
		h.ready(w, r)
		return
	}
	if h.nativeGamesRead != nil {
		if pattern, _, ok := gamesapi.Route(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeGamesRead, w, r)
			return
		}
	}
	if h.nativeGamesWrite != nil {
		if pattern, _, ok := gamesapi.WriteRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeGamesWrite, w, r)
			return
		}
	}
	if h.nativeGamesHint != nil {
		if pattern, _, ok := gamesapi.HintRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeGamesHint, w, r)
			return
		}
	}
	if h.nativeGamesAnalyze != nil {
		if pattern, ok := gamesapi.AnalyzeRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeGamesAnalyze, w, r)
			return
		}
	}
	if h.nativeSystem != nil {
		if pattern, ok := gamesapi.SystemRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeSystem, w, r)
			return
		}
	}
	if h.nativeProfile != nil {
		if pattern, ok := gamesapi.ProfileRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeProfile, w, r)
			return
		}
	}
	if h.nativeSession != nil {
		if pattern, ok := gamesapi.SessionRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeSession, w, r)
			return
		}
	}
	if h.nativeLogin != nil {
		if pattern, ok := gamesapi.LoginRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeLogin, w, r)
			return
		}
	}
	if h.nativeAccount != nil {
		if pattern, ok := gamesapi.AccountRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeAccount, w, r)
			return
		}
	}
	if h.nativeRecovery != nil {
		if pattern, ok := gamesapi.RecoveryRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeRecovery, w, r)
			return
		}
	}
	if h.nativeFeedback != nil {
		if pattern, _, ok := gamesapi.FeedbackRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeFeedback, w, r)
			return
		}
	}
	if h.nativeMatthias != nil {
		if pattern, ok := gamesapi.MatthiasRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeMatthias, w, r)
			return
		}
	}
	if h.nativeNarrative != nil {
		if pattern, ok := gamesapi.NarrativeRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeNarrative, w, r)
			return
		}
	}
	if h.nativePawnSlug != nil {
		if pattern, ok := gamesapi.PawnSlugRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativePawnSlug, w, r)
			return
		}
	}
	if h.nativeChronicles != nil {
		if pattern, ok := gamesapi.ChroniclesRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeChronicles, w, r)
			return
		}
	}
	if h.nativeChroniclesRuns != nil {
		if pattern, _, ok := gamesapi.ChroniclesRunsRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeChroniclesRuns, w, r)
			return
		}
	}
	if h.nativeAdminFeedback != nil {
		if pattern, ok := gamesapi.AdminFeedbackRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeAdminFeedback, w, r)
			return
		}
	}
	if h.nativeAdminUsers != nil {
		if pattern, _, ok := gamesapi.AdminUsersRoute(r); ok {
			w.Header().Set("X-Chess-Edge", "go")
			h.serveNative(pattern, h.nativeAdminUsers, w, r)
			return
		}
	}
	route := pvproute.Match(r.URL.Path)
	if native := h.nativeFor(route.Kind); native != nil {
		w.Header().Set("X-Chess-Edge", "go")
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		h.serveNative(route.Kind.Pattern(), native, w, r)
		return
	}
	if route.Kind == pvproute.LobbyPulse || route.Kind == pvproute.MatchPulse {
		// The pulse has no Python equivalent: disabled means absent.
		http.NotFound(w, r)
		return
	}
	if isPvPPath(r.URL.Path) {
		// Tell Python why this reached the fallback (logged as pvp_hop): the
		// evidence for retiring the Python PvP routes.
		reason := "unknown"
		if route.Kind != pvproute.None {
			reason = "disabled:" + route.Kind.String()
		}
		r.Header.Set("X-Chess-Pvp-Fallback", reason)
	} else {
		// Not ours yet: Python still owns it. The nginx edge only sends
		// non-PvP traffic here in api "go" mode (strangler front for the
		// whole API); in the default mode it never arrives.
		r.Header.Del("X-Chess-Pvp-Fallback")
	}
	h.serveProxied(w, r)
}

// serveNative runs a native handler under request telemetry and the
// request window.
func (h *Handler) serveNative(pattern string, next http.Handler, w http.ResponseWriter, r *http.Request) {
	if h.window == nil {
		h.telemetry.Serve(pattern, next, w, r)
		return
	}
	h.observe(pattern, w, r, func(w http.ResponseWriter) { h.telemetry.Serve(pattern, next, w, r) })
}

// serveProxied hands the request to Python; only the window sees it here
// (Python records its own telemetry).
func (h *Handler) serveProxied(w http.ResponseWriter, r *http.Request) {
	if h.window == nil {
		h.proxy.ServeHTTP(w, r)
		return
	}
	h.observe(httpwindow.ProxiedRoute, w, r, func(w http.ResponseWriter) { h.proxy.ServeHTTP(w, r) })
}

func (h *Handler) observe(route string, w http.ResponseWriter, r *http.Request, serve func(http.ResponseWriter)) {
	started := time.Now()
	recorder := &statusWriter{ResponseWriter: w}
	defer func() {
		panicked := recover()
		status := recorder.status
		if panicked != nil {
			status = http.StatusInternalServerError
		} else if status == 0 {
			status = http.StatusOK
		}
		h.window.Record(r.Method, route, status, float64(time.Since(started))/float64(time.Millisecond), r.Header.Get("X-Client-Release"))
		if panicked != nil {
			panic(panicked)
		}
	}()
	serve(recorder)
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(code int) {
	if s.status == 0 {
		s.status = code
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusWriter) Write(p []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	return s.ResponseWriter.Write(p)
}

func (s *statusWriter) Unwrap() http.ResponseWriter { return s.ResponseWriter }

func (s *statusWriter) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func isPvPPath(path string) bool {
	return path == "/api/pvp" || strings.HasPrefix(path, "/api/pvp/")
}

// nativeFor returns the Go handler for a route, or nil when that route's
// kill-switch is off and the request must go to the Python upstream.
func (h *Handler) nativeFor(kind pvproute.Kind) http.Handler {
	switch kind {
	case pvproute.LobbyRead:
		return h.nativeLobbyRead
	case pvproute.LobbyPulse, pvproute.MatchPulse:
		return h.nativePulse
	case pvproute.LobbyChat:
		return h.nativeChat
	case pvproute.Roster:
		return h.nativeRoster
	case pvproute.ChallengeCreate:
		return h.nativeChallengeCreate
	case pvproute.ChallengeAccept:
		return h.nativeChallengeAccept
	case pvproute.ChallengeCancel, pvproute.ChallengeDecline:
		return h.nativeChallengeResolution
	case pvproute.MatchHandoffCancel:
		return h.nativeMatchHandoffCancel
	case pvproute.MatchReady:
		return h.nativeMatchReady
	case pvproute.MatchResign:
		return h.nativeMatchResign
	case pvproute.MatchMove:
		return h.nativeMatchMove
	case pvproute.MatchRead:
		return h.nativeMatchRead
	}
	return nil
}

func (h *Handler) health(w http.ResponseWriter) {
	w.Header().Set("X-Chess-Edge", "go")
	w.Header().Set("X-Chess-Pvp-Edge", "go")
	writeJSON(w, http.StatusOK, h.statusPayload("ok"))
}

func (h *Handler) statusPayload(status string) map[string]any {
	payload := map[string]any{
		"status":                    status,
		"service":                   serviceName,
		"runtimeService":            runtimeidentity.CanonicalServiceName,
		"nativePulse":               h.nativePulse != nil,
		"nativeLobbyRead":           h.nativeLobbyRead != nil,
		"nativeRoster":              h.nativeRoster != nil,
		"nativeChat":                h.nativeChat != nil,
		"nativeChallengeResolution": h.nativeChallengeResolution != nil,
		"nativeChallengeAccept":     h.nativeChallengeAccept != nil,
		"nativeChallengeCreate":     h.nativeChallengeCreate != nil,
		"nativeMatchHandoffCancel":  h.nativeMatchHandoffCancel != nil,
		"nativeMatchReady":          h.nativeMatchReady != nil,
		"nativeMatchResign":         h.nativeMatchResign != nil,
		"nativeMatchRead":           h.nativeMatchRead != nil,
		"nativeMatchMove":           h.nativeMatchMove != nil,
		"virtualPlayersEnabled":     h.virtualPlayersEnabled,
		"nativeResidentMove":        h.nativeResidentMove,
		"nativeGamesRead":           h.nativeGamesRead != nil,
		"nativeGamesWrite":          h.nativeGamesWrite != nil,
		"nativeGamesHint":           h.nativeGamesHint != nil,
		"nativeGamesAnalyze":        h.nativeGamesAnalyze != nil,
		"nativeSystem":              h.nativeSystem != nil,
		"nativeProfile":             h.nativeProfile != nil,
		"nativeAuthSession":         h.nativeSession != nil,
		"nativeLogin":               h.nativeLogin != nil,
		"nativeAccount":             h.nativeAccount != nil,
		"nativeRecovery":            h.nativeRecovery != nil,
		"nativeFeedback":            h.nativeFeedback != nil,
		"nativeMatthias":            h.nativeMatthias != nil,
		"nativeNarrative":           h.nativeNarrative != nil,
		"nativePawnSlug":            h.nativePawnSlug != nil,
		"nativeChronicles":          h.nativeChronicles != nil,
		"nativeChroniclesRuns":      h.nativeChroniclesRuns != nil,
		"nativeAdminFeedback":       h.nativeAdminFeedback != nil,
		"nativeAdminUsers":          h.nativeAdminUsers != nil,
	}
	if h.release != "" {
		payload["release"] = h.release
	}
	return payload
}

func (h *Handler) ready(w http.ResponseWriter, r *http.Request) {
	readyURL := *h.upstream
	readyURL.Path = "/api/ready"
	readyURL.RawQuery = ""

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, readyURL.String(), nil)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "not_ready", "service": serviceName})
		return
	}
	resp, err := h.client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "not_ready", "service": serviceName})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "not_ready", "service": serviceName})
		return
	}
	for name, check := range h.readyChecks {
		checkCtx, cancel := context.WithTimeout(r.Context(), h.client.Timeout)
		err := check(checkCtx)
		cancel()
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "not_ready", "service": serviceName, "dependency": name})
			return
		}
	}
	if ms, first := h.window.RecordReady(); first {
		log.Printf("go_api_first_ready_observed cold_start_ms=%.2f", ms)
	}
	w.Header().Set("X-Chess-Edge", "go")
	w.Header().Set("X-Chess-Pvp-Edge", "go")
	writeJSON(w, http.StatusOK, h.statusPayload("ready"))
}

func writeJSON(w http.ResponseWriter, status int, payload map[string]any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func Shutdown(ctx context.Context, server *http.Server) error {
	if server == nil {
		return nil
	}
	return server.Shutdown(ctx)
}

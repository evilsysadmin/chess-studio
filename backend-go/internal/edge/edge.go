package edge

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvproute"
)

const serviceName = "chess-studio-pvp-go"

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
	VirtualPlayersEnabled     bool
	NativeResidentMove        bool
	// ReadyChecks are dependencies owned by the Go edge itself (MongoDB for the
	// native routes). Each must pass, alongside the Python upstream, for the
	// edge to report ready.
	ReadyChecks map[string]func(context.Context) error
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
	virtualPlayersEnabled     bool
	nativeResidentMove        bool
	readyChecks               map[string]func(context.Context) error
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
		req.Header.Set("X-Chess-Pvp-Edge", "go")
	}
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Set("X-Chess-Pvp-Edge", "go")
		resp.Header.Set("X-Chess-Edge", "go")
		return nil
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, _ error) {
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		w.Header().Set("X-Chess-Edge", "go")
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
		virtualPlayersEnabled:     cfg.VirtualPlayersEnabled,
		nativeResidentMove:        cfg.NativeResidentMove,
		readyChecks:               cfg.ReadyChecks,
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
	route := pvproute.Match(r.URL.Path)
	if native := h.nativeFor(route.Kind); native != nil {
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		native.ServeHTTP(w, r)
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
	h.proxy.ServeHTTP(w, r)
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
	payload := map[string]any{
		"status":                    "ok",
		"service":                   serviceName,
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
	}
	if h.release != "" {
		payload["release"] = h.release
	}
	w.Header().Set("X-Chess-Pvp-Edge", "go")
	writeJSON(w, http.StatusOK, payload)
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
	payload := map[string]any{
		"status":                    "ready",
		"service":                   serviceName,
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
	}
	if h.release != "" {
		payload["release"] = h.release
	}
	w.Header().Set("X-Chess-Pvp-Edge", "go")
	writeJSON(w, http.StatusOK, payload)
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

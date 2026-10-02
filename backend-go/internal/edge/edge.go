package edge

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

const serviceName = "chess-studio-pvp-go"

type Config struct {
	UpstreamURL   string
	Release       string
	ReadyTimeout  time.Duration
	NativePulse   http.Handler
	NativeRoster  http.Handler
	NativeChat    http.Handler
	NativeChallengeResolution http.Handler
	NativeChallengeAccept     http.Handler
	NativeChallengeCreate     http.Handler
	NativeMatchHandoffCancel  http.Handler
	NativeMatchReady          http.Handler
}

type Handler struct {
	upstream     *url.URL
	proxy        *httputil.ReverseProxy
	client       *http.Client
	release      string
	nativePulse  http.Handler
	nativeRoster http.Handler
	nativeChat   http.Handler
	nativeChallengeResolution http.Handler
	nativeChallengeAccept     http.Handler
	nativeChallengeCreate     http.Handler
	nativeMatchHandoffCancel  http.Handler
	nativeMatchReady          http.Handler
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
	baseDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalHost := req.Host
		baseDirector(req)
		req.Header.Set("X-Forwarded-Host", originalHost)
		req.Header.Set("X-Chess-Pvp-Edge", "go")
	}
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Set("X-Chess-Pvp-Edge", "go")
		return nil
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, _ error) {
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"code":      "pvp_upstream_unavailable",
			"retryable": true,
			"service":   serviceName,
		})
	}

	return &Handler{
		upstream:    upstream,
		proxy:       proxy,
		client:      &http.Client{Timeout: timeout},
		release:     strings.TrimSpace(cfg.Release),
		nativePulse:  cfg.NativePulse,
		nativeRoster: cfg.NativeRoster,
		nativeChat:   cfg.NativeChat,
		nativeChallengeResolution: cfg.NativeChallengeResolution,
		nativeChallengeAccept: cfg.NativeChallengeAccept,
		nativeChallengeCreate: cfg.NativeChallengeCreate,
		nativeMatchHandoffCancel: cfg.NativeMatchHandoffCancel,
		nativeMatchReady: cfg.NativeMatchReady,
	}, nil
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/healthz":
		h.health(w)
	case r.URL.Path == "/readyz" || r.URL.Path == "/api/pvp/_edge/ready":
		h.ready(w, r)
	case r.URL.Path == "/api/pvp/lobby/pulse" || isMatchPulsePath(r.URL.Path):
		if h.nativePulse == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		h.nativePulse.ServeHTTP(w, r)
	case r.URL.Path == "/api/pvp/roster" && h.nativeRoster != nil:
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		h.nativeRoster.ServeHTTP(w, r)
	case r.URL.Path == "/api/pvp/lobby/chat" && h.nativeChat != nil:
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		h.nativeChat.ServeHTTP(w, r)
	case r.URL.Path == "/api/pvp/challenges" && h.nativeChallengeCreate != nil:
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		h.nativeChallengeCreate.ServeHTTP(w, r)
	case isChallengeAcceptPath(r.URL.Path) && h.nativeChallengeAccept != nil:
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		h.nativeChallengeAccept.ServeHTTP(w, r)
	case isChallengeResolutionPath(r.URL.Path) && h.nativeChallengeResolution != nil:
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		h.nativeChallengeResolution.ServeHTTP(w, r)
	case isMatchHandoffCancelPath(r.URL.Path) && h.nativeMatchHandoffCancel != nil:
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		h.nativeMatchHandoffCancel.ServeHTTP(w, r)
	case isMatchReadyPath(r.URL.Path) && h.nativeMatchReady != nil:
		w.Header().Set("X-Chess-Pvp-Edge", "go")
		h.nativeMatchReady.ServeHTTP(w, r)
	case r.URL.Path == "/api/pvp" || strings.HasPrefix(r.URL.Path, "/api/pvp/"):
		h.proxy.ServeHTTP(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (h *Handler) health(w http.ResponseWriter) {
	payload := map[string]any{
		"status":       "ok",
		"service":      serviceName,
		"nativePulse":  h.nativePulse != nil,
		"nativeRoster": h.nativeRoster != nil,
		"nativeChat":   h.nativeChat != nil,
		"nativeChallengeResolution": h.nativeChallengeResolution != nil,
		"nativeChallengeAccept": h.nativeChallengeAccept != nil,
		"nativeChallengeCreate": h.nativeChallengeCreate != nil,
		"nativeMatchHandoffCancel": h.nativeMatchHandoffCancel != nil,
		"nativeMatchReady": h.nativeMatchReady != nil,
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
	w.Header().Set("X-Chess-Pvp-Edge", "go")
	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "ready",
		"service":      serviceName,
		"nativePulse":  h.nativePulse != nil,
		"nativeRoster": h.nativeRoster != nil,
		"nativeChat":   h.nativeChat != nil,
		"nativeChallengeResolution": h.nativeChallengeResolution != nil,
		"nativeChallengeAccept": h.nativeChallengeAccept != nil,
		"nativeChallengeCreate": h.nativeChallengeCreate != nil,
		"nativeMatchHandoffCancel": h.nativeMatchHandoffCancel != nil,
		"nativeMatchReady": h.nativeMatchReady != nil,
	})
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


func isMatchPulsePath(path string) bool {
	const prefix = "/api/pvp/matches/"
	const suffix = "/pulse"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return false
	}
	matchID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	matchID = strings.Trim(matchID, "/")
	return matchID != "" && !strings.Contains(matchID, "/")
}

func isChallengeAcceptPath(path string) bool {
	const prefix = "/api/pvp/challenges/"
	const suffix = "/accept"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return false
	}
	challengeID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	challengeID = strings.Trim(challengeID, "/")
	return challengeID != "" && !strings.Contains(challengeID, "/")
}

func isChallengeResolutionPath(path string) bool {
	const prefix = "/api/pvp/challenges/"
	if !strings.HasPrefix(path, prefix) {
		return false
	}
	rest := strings.TrimPrefix(path, prefix)
	parts := strings.Split(rest, "/")
	return len(parts) == 2 && parts[0] != "" && (parts[1] == "cancel" || parts[1] == "decline")
}

func isMatchHandoffCancelPath(path string) bool {
	const prefix = "/api/pvp/matches/"
	const suffix = "/cancel-starting"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return false
	}
	matchID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	matchID = strings.Trim(matchID, "/")
	return matchID != "" && !strings.Contains(matchID, "/")
}

func isMatchReadyPath(path string) bool {
	const prefix = "/api/pvp/matches/"
	const suffix = "/ready"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return false
	}
	matchID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	matchID = strings.Trim(matchID, "/")
	return matchID != "" && !strings.Contains(matchID, "/")
}

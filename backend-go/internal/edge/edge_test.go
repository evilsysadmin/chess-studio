package edge

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/telemetry"
)

func TestProxyPreservesPvPRequest(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got, want := r.URL.Path, "/api/pvp/matches/m-1/move"; got != want {
			t.Fatalf("path=%q want=%q", got, want)
		}
		if got, want := r.URL.RawQuery, "revision=7"; got != want {
			t.Fatalf("query=%q want=%q", got, want)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer token" {
			t.Fatalf("authorization=%q", got)
		}
		if got := r.Host; got != "api.chess.test" {
			t.Fatalf("host=%q", got)
		}
		if got := r.Header.Get("X-Chess-Pvp-Edge"); got != "go" {
			t.Fatalf("edge marker=%q", got)
		}
		if got := r.Header.Get("X-Chess-Edge"); got != "go" {
			t.Fatalf("generic edge marker=%q", got)
		}
		body, _ := io.ReadAll(r.Body)
		if string(body) != "{\"from\":\"e2\",\"to\":\"e4\"}" {
			t.Fatalf("body=%q", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{\"ok\":true}"))
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	req := httptest.NewRequest(http.MethodPost, "http://api.chess.test/api/pvp/matches/m-1/move?revision=7", bytes.NewBufferString("{\"from\":\"e2\",\"to\":\"e4\"}"))
	req.Header.Set("Authorization", "Bearer token")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("response edge marker=%q", got)
	}
	if got := rr.Header().Get("X-Chess-Edge"); got != "go" {
		t.Fatalf("response generic edge marker=%q", got)
	}
}

func TestNativePulseBypassesPythonUpstream(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native pulse must not reach Python upstream")
	}))
	defer upstream.Close()

	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/lobby/pulse" {
			t.Fatalf("native path=%q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"revision":"abc","source":"go"}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativePulse: native})
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/lobby/pulse", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge marker=%q", got)
	}
}

func TestNativePulseDisabledReturnsNotFoundInsteadOfProxying(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("disabled native pulse must not silently proxy")
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/lobby/pulse", nil))
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status=%d want=404", rr.Code)
	}
}

func TestProxiesNonPvPPathsToPython(t *testing.T) {
	// The edge fronts the whole API in api "go" mode: anything without a
	// native handler belongs to Python, and is never marked as PvP fallback.
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/me" || r.URL.RawQuery != "x=1" {
			t.Fatalf("path=%q query=%q", r.URL.Path, r.URL.RawQuery)
		}
		if got := r.Header.Get("X-Chess-Pvp-Fallback"); got != "" {
			t.Fatalf("non-PvP request carried a PvP fallback reason %q", got)
		}
		if got := r.Header.Get("X-Chess-Pvp-Edge"); got != "" {
			t.Fatalf("non-PvP request carried a PvP edge marker %q", got)
		}
		if got := r.Header.Get("X-Chess-Edge"); got != "go" {
			t.Fatalf("non-PvP request generic edge marker=%q", got)
		}
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	req := httptest.NewRequest(http.MethodGet, "http://edge/api/auth/me?x=1", nil)
	req.Header.Set("X-Chess-Pvp-Fallback", "forged")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusTeapot {
		t.Fatalf("status=%d want=418", rr.Code)
	}
	if rr.Header().Get("X-Chess-Edge") != "go" {
		t.Fatalf("missing X-Chess-Edge on proxied response: %v", rr.Header())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "" {
		t.Fatalf("non-PvP response carried a PvP edge marker %q", got)
	}
}

func TestUpstreamFailureCodeDependsOnDomain(t *testing.T) {
	h := mustHandler(t, "http://127.0.0.1:1")
	for path, want := range map[string]string{
		"/api/pvp/roster": "pvp_upstream_unavailable",
		"/api/games":      "upstream_unavailable",
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge"+path, nil))
		var body map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if rr.Code != http.StatusBadGateway || body["code"] != want || rr.Header().Get("X-Chess-Edge") != "go" {
			t.Fatalf("%s: status=%d body=%v headers=%v", path, rr.Code, body, rr.Header())
		}
	}
}

func TestHealthAndReadiness(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/ready" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	h, err := New(Config{UpstreamURL: upstream.URL, Release: "deadbeef", ReadyTimeout: 200 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}

	for _, tc := range []struct {
		path string
		want int
	}{
		{path: "/healthz", want: http.StatusOK},
		{path: "/readyz", want: http.StatusOK},
		{path: "/api/pvp/_edge/ready", want: http.StatusOK},
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge"+tc.path, nil))
		if rr.Code != tc.want {
			t.Fatalf("%s status=%d want=%d body=%s", tc.path, rr.Code, tc.want, rr.Body.String())
		}
		if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
			t.Fatalf("%s edge marker=%q", tc.path, got)
		}
		if got := rr.Header().Get("X-Chess-Edge"); got != "go" {
			t.Fatalf("%s generic edge marker=%q", tc.path, got)
		}
		var body map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
			t.Fatalf("%s decode readiness body: %v", tc.path, err)
		}
		if got := body["release"]; got != "deadbeef" {
			t.Fatalf("%s release=%#v want=deadbeef", tc.path, got)
		}
	}
}

func TestHealthAndReadinessCapabilitiesStayAligned(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()

	native := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h, err := New(Config{
		UpstreamURL:           upstream.URL,
		Release:               "deadbeef",
		NativePulse:           native,
		NativeGamesRead:       native,
		VirtualPlayersEnabled: true,
		NativeResidentMove:    true,
	})
	if err != nil {
		t.Fatal(err)
	}

	read := func(path string) map[string]any {
		t.Helper()
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge"+path, nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("%s status=%d body=%s", path, rr.Code, rr.Body.String())
		}
		var body map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
			t.Fatalf("%s decode body: %v", path, err)
		}
		return body
	}

	health := read("/healthz")
	ready := read("/readyz")
	health["status"] = "ready"
	if !reflect.DeepEqual(health, ready) {
		t.Fatalf("health/readiness capability drift: health=%v ready=%v", health, ready)
	}
}

func TestReadinessReportsNativePulseState(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/ready" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	native := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h, err := New(Config{UpstreamURL: upstream.URL, NativePulse: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["nativePulse"] != true {
		t.Fatalf("nativePulse=%#v want=true", body["nativePulse"])
	}
}

func TestReadinessReportsVirtualPlayerGate(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()

	h, err := New(Config{UpstreamURL: upstream.URL, VirtualPlayersEnabled: true})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["virtualPlayersEnabled"] != true {
		t.Fatalf("virtualPlayersEnabled=%#v want=true", body["virtualPlayersEnabled"])
	}
}

func TestReadinessFailsClosed(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d want=503", rr.Code)
	}
}

func TestReadinessRunsDependencyChecks(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	}))
	defer upstream.Close()

	var mongoErr error
	h, err := New(Config{
		UpstreamURL:  upstream.URL,
		ReadyTimeout: 200 * time.Millisecond,
		ReadyChecks: map[string]func(context.Context) error{
			"mongodb": func(context.Context) error { return mongoErr },
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("healthy dependency: status=%d body=%s", rr.Code, rr.Body.String())
	}

	mongoErr = errors.New("server selection timeout")
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("failing dependency: status=%d want=503", rr.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["dependency"] != "mongodb" || body["status"] != "not_ready" {
		t.Fatalf("body=%v", body)
	}
	if bytes.Contains(rr.Body.Bytes(), []byte("server selection")) {
		t.Fatalf("readiness leaked the dependency error: %s", rr.Body.String())
	}
}

func TestProxyFailureIsStableAndRetryable(t *testing.T) {
	h := mustHandler(t, "http://127.0.0.1:1")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/lobby", nil))
	if rr.Code != http.StatusBadGateway {
		t.Fatalf("status=%d want=502 body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["code"] != "pvp_upstream_unavailable" || body["retryable"] != true {
		t.Fatalf("unexpected body: %#v", body)
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge marker=%q", got)
	}
}

func TestConfigValidation(t *testing.T) {
	for _, raw := range []string{"", "mongo://db", "http://example.test/base", "http://example.test?a=b"} {
		if _, err := New(Config{UpstreamURL: raw}); err == nil {
			t.Fatalf("expected invalid upstream %q", raw)
		}
	}
}

func mustHandler(t *testing.T, upstream string) *Handler {
	t.Helper()
	h, err := New(Config{UpstreamURL: upstream, ReadyTimeout: 100 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func TestNativeMatchPulseBypassesPythonUpstream(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native match pulse must not reach Python upstream")
	}))
	defer upstream.Close()

	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/matches/m-9/pulse" {
			t.Fatalf("native path=%q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"revision":9,"source":"go"}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativePulse: native})
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/matches/m-9/pulse", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge marker=%q", got)
	}
}

func TestNativeRosterBypassesPythonWhenEnabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native roster must not reach Python upstream")
	}))
	defer upstream.Close()

	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/roster" || r.Method != http.MethodPost {
			t.Fatalf("native roster request=%s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"member":{"username":"alice"}}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeRoster: native})
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/roster", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestRosterFallsBackToPythonWhenNativeDisabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/roster" || r.Method != http.MethodPost {
			t.Fatalf("upstream roster request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/roster", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestNativeChallengeResolutionBypassesPythonWhenEnabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native challenge resolution must not reach Python upstream")
	}))
	defer upstream.Close()

	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/challenges/c-1/cancel" || r.Method != http.MethodPost {
			t.Fatalf("native challenge request=%s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"challenge":{"id":"c-1","status":"cancelled"}}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeChallengeResolution: native})
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-1/cancel", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge marker=%q", got)
	}
}

func TestChallengeResolutionFallsBackToPythonWhenNativeDisabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/challenges/c-1/decline" || r.Method != http.MethodPost {
			t.Fatalf("upstream challenge request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-1/decline", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestNativeMatchHandoffCancelBypassesPythonWhenEnabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native handoff cancel must not reach Python upstream")
	}))
	defer upstream.Close()

	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/matches/m-1/cancel-starting" || r.Method != http.MethodPost {
			t.Fatalf("native handoff cancel request=%s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"match":{"id":"m-1","status":"cancelled"}}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeMatchHandoffCancel: native})
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/cancel-starting", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge marker=%q", got)
	}
}

func TestMatchHandoffCancelFallsBackToPythonWhenNativeDisabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/matches/m-1/cancel-starting" || r.Method != http.MethodPost {
			t.Fatalf("upstream handoff cancel request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/cancel-starting", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestNativeMatchReadyBypassesPythonWhenEnabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native match ready must not reach Python upstream")
	}))
	defer upstream.Close()

	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/matches/m-1/ready" || r.Method != http.MethodPost {
			t.Fatalf("native match ready request=%s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"match":{"id":"m-1","status":"starting","youReady":true}}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeMatchReady: native})
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/ready", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge marker=%q", got)
	}
}

func TestMatchReadyFallsBackToPythonWhenNativeDisabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/matches/m-1/ready" || r.Method != http.MethodPost {
			t.Fatalf("upstream match ready request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/ready", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestNativeChallengeAcceptBypassesPythonWhenEnabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native challenge accept must not reach Python upstream")
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/challenges/c-1/accept" || r.Method != http.MethodPost {
			t.Fatalf("native accept request=%s %s", r.Method, r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"match":{"id":"c-1","status":"starting"}}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeChallengeAccept: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-1/accept", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge marker=%q", got)
	}
}

func TestChallengeAcceptFallsBackToPythonWhenNativeDisabled(t *testing.T) {
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/api/pvp/challenges/c-1/accept" || r.Method != http.MethodPost {
			t.Fatalf("upstream accept request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()
	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-1/accept", nil))
	if rr.Code != http.StatusOK || !called {
		t.Fatalf("fallback status=%d called=%t body=%s", rr.Code, called, rr.Body.String())
	}
}

func TestReadinessReportsNativeChallengeAcceptState(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h, err := New(Config{UpstreamURL: upstream.URL, NativeChallengeAccept: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["nativeChallengeAccept"] != true {
		t.Fatalf("nativeChallengeAccept=%#v want=true", body["nativeChallengeAccept"])
	}
}

func TestNativeChallengeCreateBypassesPythonWhenEnabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native challenge create must not reach Python upstream")
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/challenges" || r.Method != http.MethodPost {
			t.Fatalf("native create request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusCreated)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeChallengeCreate: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges", nil))
	if rr.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestChallengeCreateFallsBackToPythonWhenNativeDisabled(t *testing.T) {
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/api/pvp/challenges" || r.Method != http.MethodPost {
			t.Fatalf("upstream create request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer upstream.Close()
	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges", nil))
	if rr.Code != http.StatusCreated || !called {
		t.Fatalf("fallback status=%d called=%t", rr.Code, called)
	}
}

func TestReadinessReportsNativeChallengeCreateState(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusCreated) })
	h, err := New(Config{UpstreamURL: upstream.URL, NativeChallengeCreate: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["nativeChallengeCreate"] != true {
		t.Fatalf("nativeChallengeCreate=%#v want=true", body["nativeChallengeCreate"])
	}
}

func TestNativeMatchResignBypassesPythonWhenEnabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native resign must not reach Python upstream")
	}))
	defer upstream.Close()

	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/matches/m-1/resign" || r.Method != http.MethodPost {
			t.Fatalf("native resign request=%s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"match":{"id":"m-1","status":"finished"}}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeMatchResign: native})
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/resign", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge=%q", got)
	}
}

func TestMatchResignFallsBackToPythonWhenNativeDisabled(t *testing.T) {
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/api/pvp/matches/m-1/resign" || r.Method != http.MethodPost {
			t.Fatalf("upstream resign request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/resign", nil))
	if rr.Code != http.StatusOK || !called {
		t.Fatalf("fallback status=%d called=%t body=%s", rr.Code, called, rr.Body.String())
	}
}

func TestReadinessReportsNativeMatchResignState(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()

	native := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h, err := New(Config{UpstreamURL: upstream.URL, NativeMatchResign: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["nativeMatchResign"] != true {
		t.Fatalf("nativeMatchResign=%#v want=true", body["nativeMatchResign"])
	}
}

func TestNativeMatchReadBypassesPythonWhenEnabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native match read must not reach Python upstream")
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/matches/m-1" || r.Method != http.MethodGet {
			t.Fatalf("native match read request=%s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"match":{"id":"m-1"},"pollAfterMs":1250}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeMatchRead: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/matches/m-1", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge=%q", got)
	}
}

func TestMatchReadFallsBackToPythonWhenNativeDisabled(t *testing.T) {
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/api/pvp/matches/m-1" || r.Method != http.MethodGet {
			t.Fatalf("upstream match read request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()
	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/matches/m-1", nil))
	if rr.Code != http.StatusOK || !called {
		t.Fatalf("fallback status=%d called=%t body=%s", rr.Code, called, rr.Body.String())
	}
}

func TestReadinessReportsNativeMatchReadState(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h, err := New(Config{UpstreamURL: upstream.URL, NativeMatchRead: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["nativeMatchRead"] != true {
		t.Fatalf("nativeMatchRead=%#v want=true", body["nativeMatchRead"])
	}
}

func TestNativeMatchMoveBypassesPythonWhenEnabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native match move must not reach Python upstream")
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/matches/m-1/move" || r.Method != http.MethodPost {
			t.Fatalf("native match move request=%s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"match":{"id":"m-1","revision":8}}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeMatchMove: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/move", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge=%q", got)
	}
}

func TestMatchMoveFallsBackToPythonWhenNativeDisabled(t *testing.T) {
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/api/pvp/matches/m-1/move" || r.Method != http.MethodPost {
			t.Fatalf("upstream match move request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()
	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/move", nil))
	if rr.Code != http.StatusOK || !called {
		t.Fatalf("fallback status=%d called=%t body=%s", rr.Code, called, rr.Body.String())
	}
}

func TestReadinessReportsNativeMatchMoveState(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h, err := New(Config{UpstreamURL: upstream.URL, NativeMatchMove: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["nativeMatchMove"] != true {
		t.Fatalf("nativeMatchMove=%#v want=true", body["nativeMatchMove"])
	}
}

func TestNativeLobbyReadBypassesPythonWhenEnabled(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native lobby read must not reach Python upstream")
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/lobby" || r.Method != http.MethodGet {
			t.Fatalf("native lobby request=%s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"roster":[],"challenges":[],"activeMatch":null,"messages":[],"pollAfterMs":3000}`))
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeLobbyRead: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/lobby", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" {
		t.Fatalf("edge=%q", got)
	}
}

func TestLobbyReadFallsBackToPythonWhenNativeDisabled(t *testing.T) {
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/api/pvp/lobby" || r.Method != http.MethodGet {
			t.Fatalf("upstream lobby request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()
	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/lobby", nil))
	if rr.Code != http.StatusOK || !called {
		t.Fatalf("fallback status=%d called=%t body=%s", rr.Code, called, rr.Body.String())
	}
}

func TestLobbyReadDoesNotCaptureLobbyPulse(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("native routes must not reach Python upstream")
	}))
	defer upstream.Close()
	lobby := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("full lobby handler must not receive pulse")
	})
	pulse := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/pvp/lobby/pulse" {
			t.Fatalf("pulse path=%s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeLobbyRead: lobby, NativePulse: pulse})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/api/pvp/lobby/pulse", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestReadinessReportsNativeLobbyReadState(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h, err := New(Config{UpstreamURL: upstream.URL, NativeLobbyRead: native})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["nativeLobbyRead"] != true {
		t.Fatalf("nativeLobbyRead=%#v want=true", body["nativeLobbyRead"])
	}
}

func TestReadinessReportsNativeResidentMoveState(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" {
			w.WriteHeader(http.StatusOK)
			return
		}
		http.NotFound(w, r)
	}))
	defer upstream.Close()

	h, err := New(Config{
		UpstreamURL:        upstream.URL,
		NativeResidentMove: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["nativeResidentMove"] != true {
		t.Fatalf("nativeResidentMove=%#v want=true", body["nativeResidentMove"])
	}
}

func TestProxyTellsPythonWhyItFellBack(t *testing.T) {
	got := make(chan string, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got <- r.Header.Get("X-Chess-Pvp-Fallback")
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL) // no native handlers: every route is disabled
	for path, want := range map[string]string{
		"/api/pvp/matches/m-1/move": "disabled:match-move",
		"/api/pvp/roster":           "disabled:roster",
		"/api/pvp/something-else":   "unknown",
	} {
		req := httptest.NewRequest(http.MethodPost, "http://api.chess.test"+path, nil)
		// A client cannot pre-set the reason: the edge overwrites it.
		req.Header.Set("X-Chess-Pvp-Fallback", "forged")
		h.ServeHTTP(httptest.NewRecorder(), req)
		if reason := <-got; reason != want {
			t.Fatalf("%s: reason=%q want=%q", path, reason, want)
		}
	}
}

// Native responses are recorded once, by Go, under Python's route template;
// proxied ones are recorded by Python and must not be counted twice.
func TestTelemetryRecordsOnlyNativeRequests(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer upstream.Close()
	out := &bytes.Buffer{}
	recorder, err := telemetry.New(context.Background(), telemetry.Config{ServiceName: "test-go"}, telemetry.Options{Stdout: out})
	if err != nil {
		t.Fatal(err)
	}
	native := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusAccepted) })
	h, err := New(Config{UpstreamURL: upstream.URL, NativeMatchMove: native, Telemetry: recorder})
	if err != nil {
		t.Fatal(err)
	}

	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/api/pvp/matches/m-42/move", nil))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/games", nil))            // proxied
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/pvp/matches/m-42", nil)) // disabled → proxied

	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("recorded %d requests, want only the native one:\n%s", len(lines), out.String())
	}
	if !strings.Contains(lines[0], `"route":"/api/pvp/matches/{match_id}/move"`) || !strings.Contains(lines[0], `"status":202`) {
		t.Fatalf("event=%s", lines[0])
	}
}

func TestNativeGamesReadServesOnlyItsRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeGamesRead: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{
		{"GET", "/api/games"}, {"GET", "/api/games/g1"}, {"DELETE", "/api/games/g1"},
		{"POST", "/api/games"}, {"POST", "/api/games/g1/move"}, {"GET", "/api/games/g1/hint"},
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "GET /api/games,GET /api/games/g1,DELETE /api/games/g1" {
		t.Fatalf("served %v", served)
	}
	if strings.Join(proxied, ",") != "POST /api/games,POST /api/games/g1/move,GET /api/games/g1/hint" {
		t.Fatalf("proxied %v", proxied)
	}

	// Kill-switch off: everything stays in Python.
	proxied = nil
	off := mustHandler(t, upstream.URL)
	off.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("GET", "http://api.chess.test/api/games", nil))
	if len(proxied) != 1 {
		t.Fatalf("disabled: proxied %v", proxied)
	}
}

func TestNativeGamesWriteServesOnlyCreateMoveAndUndo(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeGamesWrite: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{
		{"POST", "/api/games/g1/move"}, {"POST", "/api/games/g1/undo"},
		{"GET", "/api/games/g1"}, {"POST", "/api/games"}, {"GET", "/api/games/g1/hint"},
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
		if strings.HasSuffix(req[1], "/move") || strings.HasSuffix(req[1], "/undo") {
			if rr.Header().Get("X-Chess-Edge") != "go" || rr.Header().Get("X-Chess-Pvp-Edge") != "" {
				t.Fatalf("%v markers=%v", req, rr.Header())
			}
		}
	}
	if strings.Join(served, ",") != "POST /api/games/g1/move,POST /api/games/g1/undo,POST /api/games" {
		t.Fatalf("served %v", served)
	}
	if strings.Join(proxied, ",") != "GET /api/games/g1,GET /api/games/g1/hint" {
		t.Fatalf("proxied %v", proxied)
	}
}

func TestNativeGamesHintServesOnlyTheHint(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeGamesHint: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"GET", "/api/games/g1/hint"}, {"POST", "/api/games/g1/move"}, {"GET", "/api/games/g1"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "GET /api/games/g1/hint" || strings.Join(proxied, ",") != "POST /api/games/g1/move,GET /api/games/g1" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeGamesAnalyzeServesOnlyTheAnalysisRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeGamesAnalyze: native})
	if err != nil {
		t.Fatal(err)
	}
	var edges []string
	for _, req := range [][2]string{{"POST", "/api/analyze"}, {"POST", "/api/analyze-move"}, {"GET", "/api/analyze"}, {"POST", "/api/analyze-moves"}} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
		edges = append(edges, w.Header().Get("X-Chess-Edge"))
	}
	if strings.Join(served, ",") != "POST /api/analyze,POST /api/analyze-move" || strings.Join(proxied, ",") != "GET /api/analyze,POST /api/analyze-moves" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
	if edges[0] != "go" || edges[1] != "go" {
		t.Fatalf("native analysis not marked: %v", edges)
	}
}

func TestNativeSystemServesOnlyItsRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeSystem: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"GET", "/api/status"}, {"GET", "/api/features"}, {"POST", "/api/client-telemetry"}, {"POST", "/api/internal/billing-costs"}, {"GET", "/api/health"}, {"POST", "/api/status"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "GET /api/status,GET /api/features,POST /api/client-telemetry,POST /api/internal/billing-costs" || strings.Join(proxied, ",") != "GET /api/health,POST /api/status" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeProfileServesOnlyTheProfile(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeProfile: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"GET", "/api/profile"}, {"PUT", "/api/profile"}, {"PATCH", "/api/profile"}, {"POST", "/api/profile"}, {"GET", "/api/profile/x"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "GET /api/profile,PUT /api/profile,PATCH /api/profile" || strings.Join(proxied, ",") != "POST /api/profile,GET /api/profile/x" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeSessionServesOnlyItsRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeSession: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"GET", "/api/auth/me"}, {"POST", "/api/auth/activity"}, {"POST", "/api/auth/logout"}, {"POST", "/api/auth/login"}, {"GET", "/api/auth/logout"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "GET /api/auth/me,POST /api/auth/activity,POST /api/auth/logout" || strings.Join(proxied, ",") != "POST /api/auth/login,GET /api/auth/logout" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeLoginServesOnlyTheLogin(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeLogin: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"POST", "/api/auth/login"}, {"POST", "/api/auth/register"}, {"GET", "/api/auth/login"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "POST /api/auth/login" || strings.Join(proxied, ",") != "POST /api/auth/register,GET /api/auth/login" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeAccountServesOnlyItsRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeAccount: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"POST", "/api/auth/register"}, {"PUT", "/api/auth/password"}, {"PUT", "/api/auth/email"}, {"POST", "/api/auth/delete-account"}, {"POST", "/api/auth/forgot-password"}, {"GET", "/api/auth/email"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "POST /api/auth/register,PUT /api/auth/password,PUT /api/auth/email,POST /api/auth/delete-account" || strings.Join(proxied, ",") != "POST /api/auth/forgot-password,GET /api/auth/email" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeRecoveryServesOnlyItsRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeRecovery: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"POST", "/api/auth/forgot-password"}, {"POST", "/api/auth/reset-password"}, {"GET", "/api/auth/reset-password"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "POST /api/auth/forgot-password,POST /api/auth/reset-password" || strings.Join(proxied, ",") != "GET /api/auth/reset-password" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeFeedbackServesOnlyItsRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeFeedback: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"POST", "/api/feedback"}, {"GET", "/api/feedback/mine"}, {"DELETE", "/api/feedback/abc"}, {"GET", "/api/admin/feedback"}, {"GET", "/api/feedback"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "POST /api/feedback,GET /api/feedback/mine,DELETE /api/feedback/abc" || strings.Join(proxied, ",") != "GET /api/admin/feedback,GET /api/feedback" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeMatthiasServesOnlyItsRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeMatthias: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"GET", "/api/matthias/daily"}, {"GET", "/api/matthias/briefing"}, {"POST", "/api/matthias/reset-memory"}, {"POST", "/api/matthias/daily"}, {"GET", "/api/admin/matthias-status"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "GET /api/matthias/daily,GET /api/matthias/briefing,POST /api/matthias/reset-memory" || strings.Join(proxied, ",") != "POST /api/matthias/daily,GET /api/admin/matthias-status" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeNarrativeServesOnlyItsRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeNarrative: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"POST", "/api/narrative"}, {"POST", "/api/matthias/daily"}, {"GET", "/api/matthias/daily"}, {"GET", "/api/admin/ai-metrics"}, {"GET", "/api/admin/matthias-status"}, {"GET", "/api/admin/observability"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "POST /api/narrative,POST /api/matthias/daily,GET /api/admin/ai-metrics,GET /api/admin/matthias-status" || strings.Join(proxied, ",") != "GET /api/matthias/daily,GET /api/admin/observability" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativePawnSlugServesOnlyItsRoute(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativePawnSlug: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{{"GET", "/api/pawn-slug/stages/pawn-slug-v1"}, {"POST", "/api/pawn-slug/stages/pawn-slug-v1"}, {"GET", "/api/pawn-slug/other"}} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "GET /api/pawn-slug/stages/pawn-slug-v1" || strings.Join(proxied, ",") != "POST /api/pawn-slug/stages/pawn-slug-v1,GET /api/pawn-slug/other" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeChroniclesServesOnlyItsRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeChronicles: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{
		{"GET", "/api/chronicles/maps/ash-vault"}, {"POST", "/api/chronicles/map-code/preview"},
		{"POST", "/api/chronicles/runs"}, {"GET", "/api/chronicles/runs/r1"}, {"PUT", "/api/chronicles/runs/r1/checkpoint"},
	} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "GET /api/chronicles/maps/ash-vault,POST /api/chronicles/map-code/preview" ||
		strings.Join(proxied, ",") != "POST /api/chronicles/runs,GET /api/chronicles/runs/r1,PUT /api/chronicles/runs/r1/checkpoint" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

func TestNativeChroniclesRunsServesOnlyItsRoutes(t *testing.T) {
	var proxied []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		proxied = append(proxied, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusTeapot)
	}))
	defer upstream.Close()
	var served []string
	native := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		served = append(served, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
	})
	h, err := New(Config{UpstreamURL: upstream.URL, NativeChroniclesRuns: native})
	if err != nil {
		t.Fatal(err)
	}
	for _, req := range [][2]string{
		{"POST", "/api/chronicles/runs"}, {"GET", "/api/chronicles/runs/r1"}, {"PUT", "/api/chronicles/runs/r1/checkpoint"},
		{"GET", "/api/chronicles/maps/ash-vault"}, {"DELETE", "/api/chronicles/runs/r1"},
	} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(req[0], "http://api.chess.test"+req[1], nil))
	}
	if strings.Join(served, ",") != "POST /api/chronicles/runs,GET /api/chronicles/runs/r1,PUT /api/chronicles/runs/r1/checkpoint" ||
		strings.Join(proxied, ",") != "GET /api/chronicles/maps/ash-vault,DELETE /api/chronicles/runs/r1" {
		t.Fatalf("served %v proxied %v", served, proxied)
	}
}

package edge

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
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

func TestRejectsNonPvPPaths(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("upstream must not receive non-PvP requests")
	}))
	defer upstream.Close()

	h := mustHandler(t, upstream.URL)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/api/auth/me", nil))
	if rr.Code != http.StatusNotFound {
		t.Fatalf("status=%d want=404", rr.Code)
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
		var body map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
			t.Fatalf("%s decode readiness body: %v", tc.path, err)
		}
		if got := body["release"]; got != "deadbeef" {
			t.Fatalf("%s release=%#v want=deadbeef", tc.path, got)
		}
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

func TestMatchResignPathIsExact(t *testing.T) {
	for path, want := range map[string]bool{
		"/api/pvp/matches/m-1/resign":  true,
		"/api/pvp/matches/m-1/resign/": false,
		"/api/pvp/matches//resign":     false,
		"/api/pvp/matches/m-1/ready":   false,
	} {
		if got := isMatchResignPath(path); got != want {
			t.Fatalf("%s got=%t want=%t", path, got, want)
		}
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

func TestMatchReadPathIsExactAtEdge(t *testing.T) {
	for path, want := range map[string]bool{
		"/api/pvp/matches/m-1":        true,
		"/api/pvp/matches/m-1/":       false,
		"/api/pvp/matches/m-1/pulse":  false,
		"/api/pvp/matches/m-1/resign": false,
		"/api/pvp/matches/m-1/move":   false,
		"/api/pvp/matches/":           false,
	} {
		if got := isMatchReadPath(path); got != want {
			t.Fatalf("%s got=%t want=%t", path, got, want)
		}
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

func TestMatchMovePathIsExactAtEdge(t *testing.T) {
	for path, want := range map[string]bool{
		"/api/pvp/matches/m-1/move":   true,
		"/api/pvp/matches/m-1/move/":  false,
		"/api/pvp/matches//move":      false,
		"/api/pvp/matches/m-1":        false,
		"/api/pvp/matches/m-1/resign": false,
	} {
		if got := isMatchMovePath(path); got != want {
			t.Fatalf("%s got=%t want=%t", path, got, want)
		}
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

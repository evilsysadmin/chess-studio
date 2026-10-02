package edge

import (
	"bytes"
	"encoding/json"
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
	if err != nil { t.Fatal(err) }

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/cancel-starting", nil))
	if rr.Code != http.StatusOK { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" { t.Fatalf("edge marker=%q", got) }
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
	if rr.Code != http.StatusOK { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
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
	if err != nil { t.Fatal(err) }

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/matches/m-1/ready", nil))
	if rr.Code != http.StatusOK { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" { t.Fatalf("edge marker=%q", got) }
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
	if rr.Code != http.StatusOK { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
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
	if err != nil { t.Fatal(err) }
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "http://edge/api/pvp/challenges/c-1/accept", nil))
	if rr.Code != http.StatusOK { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
	if got := rr.Header().Get("X-Chess-Pvp-Edge"); got != "go" { t.Fatalf("edge marker=%q", got) }
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
	if rr.Code != http.StatusOK || !called { t.Fatalf("fallback status=%d called=%t body=%s", rr.Code, called, rr.Body.String()) }
}

func TestReadinessReportsNativeChallengeAcceptState(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ready" { w.WriteHeader(http.StatusOK); return }
		http.NotFound(w, r)
	}))
	defer upstream.Close()
	native := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h, err := New(Config{UpstreamURL: upstream.URL, NativeChallengeAccept: native})
	if err != nil { t.Fatal(err) }
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge/readyz", nil))
	if rr.Code != http.StatusOK { t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String()) }
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil { t.Fatal(err) }
	if body["nativeChallengeAccept"] != true { t.Fatalf("nativeChallengeAccept=%#v want=true", body["nativeChallengeAccept"]) }
}

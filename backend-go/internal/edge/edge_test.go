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
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "http://edge"+tc.path, nil))
		if rr.Code != tc.want {
			t.Fatalf("%s status=%d want=%d body=%s", tc.path, rr.Code, tc.want, rr.Body.String())
		}
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

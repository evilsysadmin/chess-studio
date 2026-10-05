package gamesapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newIdentityFixture(t *testing.T, env map[string]string, ping error) (*IdentityHandler, *int) {
	t.Helper()
	readies := 0
	h, err := NewIdentity(IdentityConfig{
		Config:  Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, AllowedOrigins: []string{"https://staging.example"}, Now: func() time.Time { return fixedNow }},
		Release: "v16.6dm46zfrv",
		Build:   env["GIT_COMMIT_SHA"],
		Ping:    func(context.Context) error { return ping },
		Ready:   func() { readies++ },
		Env:     func(k string) string { return env[k] },
	})
	if err != nil {
		t.Fatal(err)
	}
	return h, &readies
}

func identityDo(h *IdentityHandler, method, path string, headers map[string]string, unmatched []string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, nil)
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	if unmatched != nil {
		h.Unmatched(w, r, unmatched)
	} else {
		h.ServeHTTP(w, r)
	}
	return w
}

// Expectations from system_api.py and Starlette through FastAPI's TestClient.
func TestIdentityRoutesMatchPython(t *testing.T) {
	h, readies := newIdentityFixture(t, map[string]string{}, nil)
	cases := []struct {
		method, path string
		headers      map[string]string
		status       int
		body         string
	}{
		{"GET", "/api/health", nil, 200, `{"ok":true}`},
		{"GET", "/api/release", nil, 200, `{"release":"v16.6dm46zfrv"}`},
		{"GET", "/api/ready", nil, 200, `{"ok":true,"storage":"mongo"}`},
		{"GET", "/", nil, 401, `{"detail":"Falta el token de sesión."}`},
		{"GET", "/", map[string]string{"Authorization": "Bearer " + longToken("alice")}, 200, `{"ok":true,"service":"Chess Studio API","health":"/api/health","ready":"/api/ready"}`},
	}
	for _, c := range cases {
		w := identityDo(h, c.method, c.path, c.headers, nil)
		if w.Code != c.status || strings.TrimSpace(w.Body.String()) != c.body || w.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("%s %s: %d %s", c.method, c.path, w.Code, w.Body)
		}
	}
	if *readies != 1 {
		t.Fatalf("readiness recorded %d times", *readies)
	}
	built, _ := newIdentityFixture(t, map[string]string{"GIT_COMMIT_SHA": "abc123"}, nil)
	if w := identityDo(built, "GET", "/api/release", nil, nil); strings.TrimSpace(w.Body.String()) != `{"release":"v16.6dm46zfrv","build":"abc123"}` {
		t.Fatal(w.Body.String())
	}
}

func TestIdentityReadinessMatchesPython(t *testing.T) {
	down, readies := newIdentityFixture(t, map[string]string{}, errors.New("no mongo"))
	if w := identityDo(down, "GET", "/api/ready", nil, nil); w.Code != 503 || strings.TrimSpace(w.Body.String()) != `{"detail":"MongoDB no está lista."}` || *readies != 0 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	staging, _ := newIdentityFixture(t, map[string]string{"ENVIRONMENT": " Staging "}, nil)
	if w := identityDo(staging, "GET", "/api/ready", nil, nil); w.Code != 503 || strings.TrimSpace(w.Body.String()) != `{"detail":"Staging runtime contract is not materialized."}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	materialized, _ := newIdentityFixture(t, map[string]string{"ENVIRONMENT": "staging", "CHESS_STUDIO_RUNTIME_SCHEMA": "vault-git-v1"}, nil)
	if w := identityDo(materialized, "GET", "/api/ready", nil, nil); w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestUnmatchedMatchesStarlette(t *testing.T) {
	h, _ := newIdentityFixture(t, map[string]string{}, nil)
	if w := identityDo(h, "GET", "/nope", map[string]string{"Origin": "https://staging.example"}, []string{}); w.Code != 404 ||
		strings.TrimSpace(w.Body.String()) != `{"detail":"Not Found"}` || w.Header().Get("Access-Control-Allow-Origin") != "https://staging.example" {
		t.Fatalf("%d %s %v", w.Code, w.Body, w.Header())
	}
	if w := identityDo(h, "POST", "/api/health", nil, []string{"GET"}); w.Code != 405 || w.Header().Get("Allow") != "GET" ||
		strings.TrimSpace(w.Body.String()) != `{"detail":"Method Not Allowed"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if w := identityDo(h, "OPTIONS", "/nope", map[string]string{"Origin": "https://staging.example", "Access-Control-Request-Method": "GET"}, []string{}); w.Code != 200 || w.Body.String() != "OK" ||
		w.Header().Get("Access-Control-Allow-Origin") != "https://staging.example" {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if w := identityDo(h, "OPTIONS", "/nope", map[string]string{"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"}, []string{}); w.Code != 400 || w.Body.String() != "Disallowed CORS origin" {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if w := identityDo(h, "OPTIONS", "/api/health", nil, []string{"GET"}); w.Code != 405 {
		t.Fatalf("plain OPTIONS %d", w.Code)
	}
	if _, ok := IdentityRoute(httptest.NewRequest(http.MethodPost, "/api/health", nil)); ok {
		t.Fatal("POST /api/health is not an identity route")
	}
}

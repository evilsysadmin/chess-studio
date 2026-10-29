package gamesapi

import (
	"bytes"
	"crypto/ed25519"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/ssoauth"
)

const ssoGame = "https://staging.chronicles.shadowops.dpdns.org"

func newTestSSO(t *testing.T, accounts fakeAccounts, now time.Time) *SSOHandler {
	t.Helper()
	h, err := NewSSO(SSOConfig{
		Config:      Config{Accounts: accounts, JWTSecret: "test-secret", Now: func() time.Time { return now }},
		Environment: "staging",
	})
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func ssoCall(h http.Handler, method, path, origin, auth string, cookie *http.Cookie, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	r.Header.Set("Content-Type", "application/json")
	if auth != "" {
		r.Header.Set("Authorization", "Bearer "+auth)
	}
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestSSOSessionThenSilentTokens(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	h := newTestSSO(t, fakeAccounts{version: 2}, now)
	session, _ := sessionauth.Sign("evilsysadmin", 2, []byte("test-secret"), now)

	// Hand the Chess Studio session over once: cookie + game token.
	w := ssoCall(h, http.MethodPost, "/api/identity/session", ssoGame, session, nil, `{"audience":"chronicles"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("session: %d %s", w.Code, w.Body)
	}
	if w.Header().Get("Access-Control-Allow-Credentials") != "true" || w.Header().Get("Access-Control-Allow-Origin") != ssoGame {
		t.Fatalf("credentialed CORS missing: %v", w.Header())
	}
	cookies := w.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != ssoauth.CookieName || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode || !cookies[0].Secure {
		t.Fatalf("cookie: %+v", cookies)
	}
	var issued struct {
		Token    string `json:"token"`
		Username string `json:"username"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &issued)

	// The token verifies with the published key, for this game only.
	key, kid, _ := ssoauth.Key([]byte("test-secret"))
	keys := map[string]ed25519.PublicKey{kid: key.Public().(ed25519.PublicKey)}
	claims, err := ssoauth.Verify(issued.Token, keys, ssoauth.Issuer("staging"), "chronicles", now)
	if err != nil || claims.Subject != "evilsysadmin" || claims.SessionVersion != 2 {
		t.Fatalf("token: %+v %v", claims, err)
	}

	// Later visits: the cookie alone.
	w = ssoCall(h, http.MethodPost, "/api/identity/token", ssoGame, "", cookies[0], "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"token"`) {
		t.Fatalf("silent token: %d %s", w.Code, w.Body)
	}
}

func TestSSORefusals(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	session, _ := sessionauth.Sign("evilsysadmin", 2, []byte("test-secret"), now)
	cookie := &http.Cookie{Name: ssoauth.CookieName, Value: session}
	h := newTestSSO(t, fakeAccounts{version: 2}, now)

	if w := ssoCall(h, http.MethodPost, "/api/identity/token", "https://evil.example", "", cookie, ""); w.Code != http.StatusForbidden {
		t.Fatalf("foreign origin: %d", w.Code)
	}
	if w := ssoCall(h, http.MethodPost, "/api/identity/token", ssoGame, "", nil, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("no cookie: %d", w.Code)
	}
	if w := ssoCall(h, http.MethodPost, "/api/identity/token", ssoGame, "", cookie, `{"audience":"chess"}`); w.Code != http.StatusForbidden {
		t.Fatalf("other audience: %d", w.Code)
	}
	// A password change bumps the session version: the cookie stops working
	// and is cleared.
	bumped := newTestSSO(t, fakeAccounts{version: 3}, now)
	w := ssoCall(bumped, http.MethodPost, "/api/identity/token", ssoGame, "", cookie, "")
	if w.Code != http.StatusUnauthorized || len(w.Result().Cookies()) != 1 || w.Result().Cookies()[0].MaxAge >= 0 {
		t.Fatalf("revoked session: %d %+v", w.Code, w.Result().Cookies())
	}
	// A form post (no JSON) never reaches the credentialed routes.
	r := httptest.NewRequest(http.MethodPost, "/api/identity/token", strings.NewReader("a=b"))
	r.Header.Set("Origin", ssoGame)
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	r.AddCookie(cookie)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("form post: %d", rec.Code)
	}
}

func TestSSOJWKSIsPublic(t *testing.T) {
	h := newTestSSO(t, fakeAccounts{}, time.Unix(1_800_000_000, 0))
	w := ssoCall(h, http.MethodGet, "/api/identity/jwks", "", "", nil, "")
	if w.Code != http.StatusOK || w.Header().Get("Access-Control-Allow-Origin") != "*" || !strings.Contains(w.Body.String(), `"Ed25519"`) {
		t.Fatalf("jwks: %d %v %s", w.Code, w.Header(), w.Body)
	}
}

func TestSSOLogoutClearsTheCookie(t *testing.T) {
	h := newTestSSO(t, fakeAccounts{}, time.Unix(1_800_000_000, 0))
	w := ssoCall(h, http.MethodPost, "/api/identity/logout", ssoGame, "", nil, "")
	if w.Code != http.StatusNoContent || len(w.Result().Cookies()) != 1 || w.Result().Cookies()[0].MaxAge >= 0 {
		t.Fatalf("logout: %d %+v", w.Code, w.Result().Cookies())
	}
}

func TestSSOExplicitSigningSeedDoesNotChangeChessSessionSecret(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	legacy := newTestSSO(t, fakeAccounts{version: 2}, now)
	seed := bytes.Repeat([]byte{0x42}, ed25519.SeedSize)
	h, err := NewSSO(SSOConfig{
		Config: Config{
			Accounts: fakeAccounts{version: 2},
			JWTSecret: "test-secret",
			Now: func() time.Time { return now },
		},
		Environment: "staging",
		SigningSeed: seed,
	})
	if err != nil {
		t.Fatal(err)
	}
	if h.kid == legacy.kid {
		t.Fatal("independent signing key unexpectedly matches legacy session-derived key")
	}
	wantKey := ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)
	if !bytes.Equal(h.key.Public().(ed25519.PublicKey), wantKey) {
		t.Fatal("handler is not using the injected signing key")
	}
	if !bytes.Contains(h.jwks, []byte(h.kid)) || bytes.Contains(h.jwks, []byte(legacy.kid)) {
		t.Fatal("JWKS must publish the injected public signing key only")
	}

	// Session authentication still uses the unchanged Chess JWT secret:
	// only the outward-facing game's signing key becomes independent.
	session, err := sessionauth.Sign("evilsysadmin", 2, []byte("test-secret"), now)
	if err != nil {
		t.Fatal(err)
	}
	w := ssoCall(h, http.MethodPost, "/api/identity/session", ssoGame, session, nil, `{"audience":"chronicles"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("legacy session broke: %d %s", w.Code, w.Body)
	}
	var issued struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &issued); err != nil || issued.Token == "" {
		t.Fatalf("no game token: %v", err)
	}
	newKeys := map[string]ed25519.PublicKey{h.kid: wantKey}
	claims, err := ssoauth.Verify(issued.Token, newKeys, ssoauth.Issuer("staging"), "chronicles", now)
	if err != nil || claims.Subject != "evilsysadmin" {
		t.Fatalf("new signing key did not verify: %v", err)
	}
	legacyPublic := legacy.key.Public().(ed25519.PublicKey)
	if _, err := ssoauth.Verify(issued.Token, map[string]ed25519.PublicKey{legacy.kid: legacyPublic}, ssoauth.Issuer("staging"), "chronicles", now); err == nil {
		t.Fatal("old JWKS must not validate a token signed by the independent key")
	}
}

func TestSSOInvalidExplicitSeedFailsClosed(t *testing.T) {
	for _, seed := range [][]byte{{}, {0x01}, bytes.Repeat([]byte{0x04}, ed25519.SeedSize-1), bytes.Repeat([]byte{0x05}, ed25519.SeedSize+1)} {
		_, err := NewSSO(SSOConfig{
			Config: Config{Accounts: fakeAccounts{}, JWTSecret: "test-secret"},
			Environment: "staging", SigningSeed: seed,
		})
		if err == nil {
			t.Fatalf("unexpectedly accepted invalid seed length %d", len(seed))
		}
	}
}

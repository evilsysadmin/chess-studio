package gamesapi

import (
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

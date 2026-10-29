package gamesapi

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
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
			Accounts:  fakeAccounts{version: 2},
			JWTSecret: "test-secret",
			Now:       func() time.Time { return now },
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
			Config:      Config{Accounts: fakeAccounts{}, JWTSecret: "test-secret"},
			Environment: "staging", SigningSeed: seed,
		})
		if err == nil {
			t.Fatalf("unexpectedly accepted invalid seed length %d", len(seed))
		}
	}
}

func ssoPublishedKeys(t *testing.T, handler *SSOHandler) map[string]ed25519.PublicKey {
	t.Helper()
	var jwks struct {
		Keys []struct {
			KeyType string `json:"kty"`
			Curve   string `json:"crv"`
			Use     string `json:"use"`
			Alg     string `json:"alg"`
			Kid     string `json:"kid"`
			X       string `json:"x"`
		} `json:"keys"`
	}
	if err := json.Unmarshal(handler.jwks, &jwks); err != nil {
		t.Fatal(err)
	}
	publicKeys := make(map[string]ed25519.PublicKey)
	for _, key := range jwks.Keys {
		public, err := base64.RawURLEncoding.DecodeString(key.X)
		if err != nil || len(public) != ed25519.PublicKeySize || key.KeyType != "OKP" || key.Curve != "Ed25519" || key.Alg != "EdDSA" || key.Use != "sig" {
			t.Fatalf("invalid published signing key %q", key.Kid)
		}
		if _, exists := publicKeys[key.Kid]; exists {
			t.Fatalf("duplicate JWKS key id %q", key.Kid)
		}
		publicKeys[key.Kid] = public
	}
	return publicKeys
}

func TestSSOTwoPhaseJWKSRotationPreservesExistingGameTokens(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	config := Config{
		Accounts:  fakeAccounts{version: 2},
		JWTSecret: "test-secret",
		Now:       func() time.Time { return now },
	}
	legacy := newTestSSO(t, fakeAccounts{version: 2}, now)
	seed := bytes.Repeat([]byte{0x42}, ed25519.SeedSize)
	nextPublic := ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)
	claims := ssoauth.Claims{
		Issuer:         ssoauth.Issuer("staging"),
		Audience:       "chronicles",
		Subject:        "rotating-player",
		SessionVersion: 2,
		IssuedAt:       now.Unix(),
		ExpiresAt:      now.Add(ssoauth.TokenLifetime).Unix(),
	}
	oldToken, err := ssoauth.Sign(legacy.key, legacy.kid, claims)
	if err != nil {
		t.Fatal(err)
	}
	// Phase 1: unchanged default signs with legacy; exactly one key is public.
	legacyOnly := ssoPublishedKeys(t, legacy)
	if len(legacyOnly) != 1 {
		t.Fatal("default JWKS must keep its existing single-key contract")
	}

	// Phase 2: publish new verification key first; still sign with old key.
	prepublish, err := NewSSO(SSOConfig{
		Config: config, Environment: "staging",
		NextSigningPublicKey: nextPublic,
	})
	if err != nil {
		t.Fatal(err)
	}
	if prepublish.kid != legacy.kid {
		t.Fatal("prepublication must not switch active signer")
	}
	preKeys := ssoPublishedKeys(t, prepublish)
	if len(preKeys) != 2 {
		t.Fatal("prepublication should contain two distinct public keys")
	}
	if _, err := ssoauth.Verify(oldToken, preKeys, ssoauth.Issuer("staging"), "chronicles", now); err != nil {
		t.Fatalf("old token became invalid during prepublication: %v", err)
	}
	// Phase 3: new key signs, old key remains verification-only.
	rotating, err := NewSSO(SSOConfig{
		Config: config, Environment: "staging",
		SigningSeed: seed, RetainLegacyVerificationKey: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if rotating.kid == legacy.kid {
		t.Fatal("new signer did not activate")
	}
	newToken, err := ssoauth.Sign(rotating.key, rotating.kid, claims)
	if err != nil {
		t.Fatal(err)
	}
	rotationKeys := ssoPublishedKeys(t, rotating)
	if len(rotationKeys) != 2 {
		t.Fatal("switch window must publish old and new keys")
	}
	for _, token := range []string{oldToken, newToken} {
		if _, err := ssoauth.Verify(token, rotationKeys, ssoauth.Issuer("staging"), "chronicles", now); err != nil {
			t.Fatalf("rotation window must accept both signatures: %v", err)
		}
		if _, err := ssoauth.Verify(token, rotationKeys, ssoauth.Issuer("production"), "chronicles", now); err == nil {
			t.Fatal("staging token accepted by production issuer")
		}
	}
	// Phase 4: only after max token age and JWKS cache have elapsed.
	final, err := NewSSO(SSOConfig{
		Config: config, Environment: "staging", SigningSeed: seed,
	})
	if err != nil {
		t.Fatal(err)
	}
	finalKeys := ssoPublishedKeys(t, final)
	if len(finalKeys) != 1 {
		t.Fatal("final JWKS must not retain old signing keys")
	}
	if _, err := ssoauth.Verify(newToken, finalKeys, ssoauth.Issuer("staging"), "chronicles", now); err != nil {
		t.Fatalf("new tokens must survive removal of legacy key: %v", err)
	}
	if _, err := ssoauth.Verify(oldToken, finalKeys, ssoauth.Issuer("staging"), "chronicles", now); err == nil {
		t.Fatal("old token still verified after its key was retired")
	}
	// Rollback is also explicit: the legacy-only handler remains functional.
	if _, err := ssoauth.Verify(oldToken, legacyOnly, ssoauth.Issuer("staging"), "chronicles", now); err != nil {
		t.Fatalf("legacy-only rollback path broke: %v", err)
	}
}

func TestSSOUnsafeRotationConfigFailsClosed(t *testing.T) {
	legacy := newTestSSO(t, fakeAccounts{}, time.Unix(1_800_000_000, 0))
	seed := bytes.Repeat([]byte{0x42}, ed25519.SeedSize)
	nextPublic := ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)
	cases := []SSOConfig{
		{Config: Config{Accounts: fakeAccounts{}, JWTSecret: "test-secret"}, Environment: "staging", RetainLegacyVerificationKey: true},
		{Config: Config{Accounts: fakeAccounts{}, JWTSecret: "test-secret"}, Environment: "staging", SigningSeed: seed, NextSigningPublicKey: nextPublic},
		{Config: Config{Accounts: fakeAccounts{}, JWTSecret: "test-secret"}, Environment: "staging", SigningSeed: seed, RetainLegacyVerificationKey: true, NextSigningPublicKey: nextPublic},
		{Config: Config{Accounts: fakeAccounts{}, JWTSecret: "test-secret"}, Environment: "staging", NextSigningPublicKey: ed25519.PublicKey{}},
		{Config: Config{Accounts: fakeAccounts{}, JWTSecret: "test-secret"}, Environment: "staging", NextSigningPublicKey: legacy.key.Public().(ed25519.PublicKey)},
		{Config: Config{Accounts: fakeAccounts{}, JWTSecret: "test-secret"}, Environment: "staging", SigningSeed: legacy.key.Seed(), RetainLegacyVerificationKey: true},
	}
	for index, cfg := range cases {
		if _, err := NewSSO(cfg); err == nil {
			t.Fatalf("unsafe rotation configuration %d was accepted", index)
		}
	}
}

func TestSSORejectsMissingOrAmbiguousRuntimeEnvironment(t *testing.T) {
	for _, environment := range []string{
		"", " ", "prod", "stage", "stagin", "production2", "test",
		"ci", "localhost", "https://id.shadowops.dpdns.org",
	} {
		t.Run(environment, func(t *testing.T) {
			_, err := NewSSO(SSOConfig{
				Config: Config{Accounts: fakeAccounts{}, JWTSecret: "test-secret"},
				Environment: environment,
			})
			if err == nil {
				t.Fatalf("SSO environment %q unexpectedly fell back to local identity", environment)
			}
		})
	}
}

func TestSSOCanonicalRuntimeEnvironmentPinsIssuerAndCookieSecurity(t *testing.T) {
	for _, tc := range []struct {
		input, canonical, issuer string
		secure                   bool
	}{
		{"staging", "staging", "https://api-staging.chess-studio.shadowops.dpdns.org", true},
		{" PRODUCTION ", "production", "https://api.chess-studio.shadowops.dpdns.org", true},
		{"development", "development", "http://localhost:8000", false},
	} {
		t.Run(tc.canonical, func(t *testing.T) {
			h, err := NewSSO(SSOConfig{
				Config: Config{Accounts: fakeAccounts{}, JWTSecret: "test-secret"},
				Environment: tc.input,
			})
			if err != nil {
				t.Fatal(err)
			}
			if h.env != tc.canonical || h.issuer != tc.issuer || h.secureCk != tc.secure {
				t.Fatalf("untrusted runtime identity: env=%q issuer=%q secure=%v", h.env, h.issuer, h.secureCk)
			}
			if tc.secure && ssoauth.Audience(h.env, "http://localhost:4173") != "" {
				t.Fatal("deployed SSO must not authorize local browser origins")
			}
		})
	}
}

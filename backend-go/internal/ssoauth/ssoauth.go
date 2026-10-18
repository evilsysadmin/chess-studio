// Package ssoauth makes Chess Studio the identity provider (IdP) of the
// ShadowOps games: one account, one sign-in, every game.
//
// A game never sees a password or a shared secret. It asks this API for a
// short-lived token addressed to it (`aud`), signed with Ed25519, and checks
// it with the public key published as a JWKS. The browser keeps the SSO
// session in an HttpOnly cookie of this API; since every game lives under
// shadowops.dpdns.org (its own site: dpdns.org is a public suffix), a game's
// credentialed fetch to this API carries the cookie.
//
// Design: shadowops-infra/docs/identity-sso.md.
package ssoauth

import (
	"crypto/ed25519"
	"crypto/hkdf"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

const (
	// CookieName holds the SSO session: an ordinary Chess Studio session
	// token, readable only by this API.
	CookieName = "shadowops_sso"
	// CookiePath limits the cookie to the identity routes.
	CookiePath = "/api/identity"
	// CookieLifetime matches the session token's own lifetime.
	CookieLifetime = 30 * 24 * time.Hour
	// TokenLifetime bounds how long a game token outlives a revoked session.
	TokenLifetime = time.Hour
	keyInfo       = "shadowops-identity-ed25519-v1"
)

// Each environment's issuer and the games it vouches for: browser origin →
// audience. Pinned in code, apart from CORS_ORIGINS (which the staging
// contract keeps to Chess Studio's own origin).
var environments = map[string]struct {
	issuer  string
	origins map[string]string
}{
	"staging": {
		issuer:  "https://api-staging.chess-studio.shadowops.dpdns.org",
		origins: map[string]string{"https://staging.chronicles.shadowops.dpdns.org": "chronicles"},
	},
	"production": {
		issuer:  "https://api.chess-studio.shadowops.dpdns.org",
		origins: map[string]string{"https://chronicles.shadowops.dpdns.org": "chronicles"},
	},
	"": {
		issuer: "http://localhost:8000",
		origins: map[string]string{
			"http://localhost:4173": "chronicles",
			"http://localhost:5174": "chronicles",
		},
	},
}

func environment(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	if _, ok := environments[name]; ok && name != "" {
		return name
	}
	return ""
}

// Issuer is the `iss` games pin for this environment.
func Issuer(env string) string { return environments[environment(env)].issuer }

// Audience is the game a browser origin belongs to ("" if none).
func Audience(env, origin string) string {
	return environments[environment(env)].origins[strings.TrimSpace(origin)]
}

// Key derives the signing key from the API's JWT secret: no new secret to
// provision, and rotating the JWT secret rotates the key with it.
func Key(secret []byte) (ed25519.PrivateKey, string, error) {
	if len(secret) == 0 {
		return nil, "", errors.New("ssoauth needs the JWT secret")
	}
	seed, err := hkdf.Key(sha256.New, secret, nil, keyInfo, ed25519.SeedSize)
	if err != nil {
		return nil, "", err
	}
	key := ed25519.NewKeyFromSeed(seed)
	return key, KeyID(key.Public().(ed25519.PublicKey)), nil
}

// KeyID is the public key's fingerprint.
func KeyID(public ed25519.PublicKey) string {
	sum := sha256.Sum256(public)
	return base64.RawURLEncoding.EncodeToString(sum[:12])
}

// Claims are what a game learns about the player.
type Claims struct {
	Issuer         string `json:"iss"`
	Audience       string `json:"aud"`
	Subject        string `json:"sub"`
	SessionVersion int64  `json:"sv"`
	IssuedAt       int64  `json:"iat"`
	ExpiresAt      int64  `json:"exp"`
}

// Sign issues a game token.
func Sign(key ed25519.PrivateKey, kid string, claims Claims) (string, error) {
	header, err := json.Marshal(map[string]string{"alg": "EdDSA", "typ": "JWT", "kid": kid})
	if err != nil {
		return "", err
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	signing := base64.RawURLEncoding.EncodeToString(header) + "." + base64.RawURLEncoding.EncodeToString(payload)
	return signing + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(key, []byte(signing))), nil
}

// Verify checks a game token against the issuer's public keys; the game's
// own copy of this logic must apply exactly these rules.
func Verify(token string, keys map[string]ed25519.PublicKey, issuer, audience string, now time.Time) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, errors.New("malformed token")
	}
	var header struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(raw, &header) != nil || header.Alg != "EdDSA" {
		return Claims{}, errors.New("unsupported token header")
	}
	public, ok := keys[header.Kid]
	if !ok {
		return Claims{}, errors.New("unknown signing key")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !ed25519.Verify(public, []byte(parts[0]+"."+parts[1]), signature) {
		return Claims{}, errors.New("bad signature")
	}
	var claims Claims
	raw, err = base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || json.Unmarshal(raw, &claims) != nil {
		return Claims{}, errors.New("malformed claims")
	}
	switch {
	case claims.Issuer != issuer:
		return Claims{}, errors.New("wrong issuer")
	case claims.Audience != audience:
		return Claims{}, errors.New("wrong audience")
	case strings.TrimSpace(claims.Subject) == "":
		return Claims{}, errors.New("missing subject")
	case !now.Before(time.Unix(claims.ExpiresAt, 0)):
		return Claims{}, errors.New("expired token")
	}
	return claims, nil
}

// JWKS publishes the public key (RFC 8037 OKP/Ed25519).
func JWKS(public ed25519.PublicKey) []byte {
	body, _ := json.Marshal(map[string]any{"keys": []map[string]string{{
		"kty": "OKP", "crv": "Ed25519", "use": "sig", "alg": "EdDSA",
		"kid": KeyID(public), "x": base64.RawURLEncoding.EncodeToString(public),
	}}})
	return body
}

// SetCookie stores the SSO session (a Chess Studio session token).
func SetCookie(w http.ResponseWriter, session string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: session, Path: CookiePath,
		MaxAge: int(CookieLifetime / time.Second), HttpOnly: true, Secure: secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearCookie ends the SSO session in this browser.
func ClearCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name: CookieName, Value: "", Path: CookiePath, MaxAge: -1,
		HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode,
	})
}

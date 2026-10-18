package gamesapi

// ShadowOps single sign-on: Chess Studio is the identity provider of the
// games (shadowops-infra/docs/identity-sso.md).
//
//	GET  /api/identity/jwks     public signing key (JWKS)
//	POST /api/identity/session  Bearer <Chess Studio session> → SSO cookie (+ game token)
//	POST /api/identity/token    SSO cookie → game token
//	POST /api/identity/logout   clears the SSO cookie
//
// The game logs in with the ordinary /api/auth/login or /api/auth/register
// (whichever backend serves them), hands the session it got to /session
// once, and from then on gets tokens silently from the cookie.

import (
	"crypto/ed25519"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/ssoauth"
)

var ssoRoutes = map[string]string{
	"/api/identity/jwks": http.MethodGet, "/api/identity/session": http.MethodPost,
	"/api/identity/token": http.MethodPost, "/api/identity/logout": http.MethodPost,
}

// SSORoute reports whether a request belongs to the SSO routes.
func SSORoute(r *http.Request) (string, bool) {
	method, ok := ssoRoutes[r.URL.Path]
	if !ok {
		return "", false
	}
	if r.Method == http.MethodOptions || r.Method == method {
		return method + " " + r.URL.Path, true
	}
	return "", false
}

type SSOConfig struct {
	Config
	Environment string
}

type SSOHandler struct {
	base     *Handler
	env      string
	issuer   string
	key      ed25519.PrivateKey
	kid      string
	jwks     []byte
	limit    *limiter
	secureCk bool
}

func NewSSO(cfg SSOConfig) (*SSOHandler, error) {
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	key, kid, err := ssoauth.Key(base.secret)
	if err != nil {
		return nil, err
	}
	issuer := ssoauth.Issuer(cfg.Environment)
	return &SSOHandler{
		base: base, env: cfg.Environment, issuer: issuer, key: key, kid: kid,
		jwks:  ssoauth.JWKS(key.Public().(ed25519.PublicKey)),
		limit: newLimiter(60, time.Minute),
		// Browsers drop Secure cookies over plain http (local development).
		secureCk: strings.HasPrefix(issuer, "https://"),
	}, nil
}

func (h *SSOHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if _, ok := SSORoute(r); !ok {
		http.NotFound(w, r)
		return
	}
	securityHeaders(w)
	if r.URL.Path == "/api/identity/jwks" {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "public, max-age=300")
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		_, _ = w.Write(h.jwks)
		return
	}

	// Credentialed routes: only a game origin, or Chess Studio's own.
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	audience := ssoauth.Audience(h.env, origin)
	_, ownOrigin := h.base.origins[origin]
	if audience == "" && !ownOrigin {
		writeJSON(w, http.StatusForbidden, map[string]any{"detail": "Origen no autorizado para la cuenta ShadowOps."})
		return
	}
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	if r.Method == http.MethodOptions {
		h.base.preflight(w, r, origin, true)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Add("Vary", "Origin")
	w.Header().Set("Cache-Control", "no-store")
	// JSON only: a plain cross-site form cannot reach these routes.
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeJSON(w, http.StatusUnsupportedMediaType, map[string]any{"detail": "Se espera JSON."})
		return
	}
	if !h.limit.allow("ip:"+h.base.clientIP(r), h.base.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 60 per 1 minute"})
		return
	}

	switch r.URL.Path {
	case "/api/identity/logout":
		ssoauth.ClearCookie(w, h.secureCk)
		w.WriteHeader(http.StatusNoContent)
	case "/api/identity/session":
		bearer := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(bearer, "Bearer ") {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Falta el token de sesión."})
			return
		}
		session := strings.TrimSpace(strings.TrimPrefix(bearer, "Bearer "))
		username, version, status, detail := h.session(r, session)
		if status != 0 {
			writeJSON(w, status, map[string]any{"detail": detail})
			return
		}
		ssoauth.SetCookie(w, session, h.secureCk)
		h.issue(w, r, username, version, audience)
	case "/api/identity/token":
		cookie, err := r.Cookie(ssoauth.CookieName)
		if err != nil || cookie.Value == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Sin sesión ShadowOps en este navegador."})
			return
		}
		username, version, status, detail := h.session(r, cookie.Value)
		if status != 0 {
			if status == http.StatusUnauthorized {
				ssoauth.ClearCookie(w, h.secureCk)
			}
			writeJSON(w, status, map[string]any{"detail": detail})
			return
		}
		h.issue(w, r, username, version, audience)
	}
}

// session validates a Chess Studio session token exactly like the API does
// (signature, expiry, and the account's current session version).
func (h *SSOHandler) session(r *http.Request, token string) (string, int64, int, string) {
	subject, version, err := sessionauth.VerifySession(token, h.base.secret, h.base.now())
	username, status, detail := h.base.currentUser(r, subject, version, err)
	if status != 0 {
		return "", 0, status, detail
	}
	return username, version, 0, ""
}

// issue answers with a game token when the caller is a game; Chess Studio
// itself only needed the cookie.
func (h *SSOHandler) issue(w http.ResponseWriter, r *http.Request, username string, version int64, audience string) {
	var body struct {
		Audience string `json:"audience"`
	}
	if r.ContentLength != 0 {
		raw, status := readBody(w, r)
		if status != 0 {
			return
		}
		if len(raw) > 0 && json.Unmarshal(raw, &body) != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "JSON inválido."})
			return
		}
	}
	if body.Audience != "" && body.Audience != audience {
		writeJSON(w, http.StatusForbidden, map[string]any{"detail": "Este origen no puede pedir tokens para ese juego."})
		return
	}
	if audience == "" {
		writeJSON(w, http.StatusOK, map[string]any{"username": username})
		return
	}
	now := h.base.now()
	claims := ssoauth.Claims{
		Issuer: h.issuer, Audience: audience, Subject: username, SessionVersion: version,
		IssuedAt: now.Unix(), ExpiresAt: now.Add(ssoauth.TokenLifetime).Unix(),
	}
	token, err := ssoauth.Sign(h.key, h.kid, claims)
	if err != nil {
		internalError(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token, "username": username, "audience": audience, "expiresAt": claims.ExpiresAt,
	})
}

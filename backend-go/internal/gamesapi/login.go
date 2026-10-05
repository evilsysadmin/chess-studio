package gamesapi

// Native POST /api/auth/login, mirroring main.login and the middleware
// around it: the per-IP guard checks before anything else and counts every
// 401/403 the route answers; the route validates LoginRequest, applies its
// 10/minute limit, the per-identity guard, verifies the password (Argon2id
// or legacy bcrypt) and issues the session token.

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/netip"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/accountstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/authcrypto"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/authguard"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/telemetry"
)

const LoginPattern = "/api/auth/login"

// LoginRoute reports whether a request is the native login.
func LoginRoute(r *http.Request) (string, bool) {
	if r.URL.Path != LoginPattern {
		return "", false
	}
	if r.Method == http.MethodPost || r.Method == http.MethodOptions && preflightMethod(r) == http.MethodPost {
		return LoginPattern, true
	}
	return "", false
}

// LoginAccounts finds the account to log into (accountstore.Store.ForLogin).
type LoginAccounts interface {
	ForLogin(ctx context.Context, identity string) (accountstore.LoginAccount, bool, error)
}

// Guard is one brute-force guard (authguard.Guard).
type Guard interface {
	RetryAfter(ctx context.Context, id string) (int, error)
	RecordFailure(ctx context.Context, id string) (int, error)
	Clear(ctx context.Context, id string) error
}

// LoginFailureLog records rejected logins (telemetry.Recorder).
type LoginFailureLog interface {
	EmitLoginFailed(r *http.Request, failure telemetry.LoginFailure)
}

// LoginTouch is the forced presence write of a successful login
// (presence.Sessions.Beat with no screen data).
type LoginTouch interface {
	Beat(r *http.Request, username string, beat presence.Heartbeat) error
}

type LoginConfig struct {
	Config
	LoginAccounts LoginAccounts
	IdentityGuard Guard
	IPGuard       Guard
	Touch         LoginTouch
	FailureLog    LoginFailureLog
	// Environment mirrors ENVIRONMENT: staging probes are trusted only there.
	Environment string
	// SyntheticSecret mirrors CHESS_AI_SHARED_SECRET.
	SyntheticSecret string
}

type LoginHandler struct {
	base            *Handler
	accounts        LoginAccounts
	identityGuard   Guard
	ipGuard         Guard
	touch           LoginTouch
	failureLog      LoginFailureLog
	syntheticSecret string
	tunnelEnv       bool
	limit           *limiter
}

func NewLogin(cfg LoginConfig) (*LoginHandler, error) {
	if cfg.LoginAccounts == nil || cfg.IdentityGuard == nil || cfg.IPGuard == nil {
		return nil, errors.New("login needs accounts and both guards")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	env := strings.ToLower(strings.TrimSpace(cfg.Environment))
	return &LoginHandler{
		base: base, accounts: cfg.LoginAccounts, identityGuard: cfg.IdentityGuard, ipGuard: cfg.IPGuard,
		touch: cfg.Touch, failureLog: cfg.FailureLog,
		syntheticSecret: strings.TrimSpace(cfg.SyntheticSecret),
		tunnelEnv:       env == "staging" || env == "stage",
		limit:           newLimiter(10, time.Minute),
	}, nil
}

// syntheticSources mirrors _STAGING_SYNTHETIC_SOURCES.
var syntheticSources = map[string]bool{"staging-smoke-cleanup": true, "staging-browser-smoke": true, "staging-capacity": true}

var syntheticUser = regexp.MustCompile(`^ci_smoke_[0-9a-f]{16}$`)

// trustedSynthetic mirrors _trusted_staging_smoke_request: a staging-only
// HMAC marker bound to one ephemeral smoke identity.
func (h *LoginHandler) trustedSynthetic(r *http.Request) (source, identity string, ok bool) {
	if !h.tunnelEnv || h.syntheticSecret == "" {
		return "", "", false
	}
	source = strings.TrimSpace(r.Header.Get("X-Chess-Synthetic-Source"))
	identity = strings.ToLower(strings.TrimSpace(r.Header.Get("X-Chess-Synthetic-Identity")))
	signature := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Chess-Synthetic-Signature")))
	if !syntheticSources[source] || !syntheticUser.MatchString(identity) {
		return "", "", false
	}
	mac := hmac.New(sha256.New, []byte(h.syntheticSecret))
	mac.Write([]byte("chess-studio:synthetic:" + source + "\x00" + identity))
	expected := hex.EncodeToString(mac.Sum(nil))
	if signature == "" || !hmac.Equal([]byte(signature), []byte(expected)) {
		return "", "", false
	}
	return source, identity, true
}

// guardIP mirrors _auth_ip_guard_identity's choice of address.
func (h *LoginHandler) guardIP(r *http.Request) string {
	if h.base.trustCF {
		raw := strings.TrimSpace(r.Header.Get("CF-Connecting-IP"))
		if raw == "" {
			raw = remoteHost(r.RemoteAddr)
		}
		if addr, err := netip.ParseAddr(raw); err == nil {
			return addr.String()
		}
	}
	if addr, err := netip.ParseAddr(remoteHost(r.RemoteAddr)); err == nil {
		return addr.String()
	}
	return ""
}

func tooManyAttempts(w http.ResponseWriter, retry int) {
	w.Header().Set("Retry-After", strconv.Itoa(retry))
	writeJSON(w, http.StatusTooManyRequests, map[string]any{"detail": "Demasiados intentos de acceso. Reintenta más tarde."})
}

func (h *LoginHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if _, ok := LoginRoute(r); !ok {
		http.NotFound(w, r)
		return
	}
	b := h.base
	securityHeaders(w)
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	_, allowed := b.origins[origin]
	if r.Method == http.MethodOptions {
		b.preflight(w, r, origin, allowed)
		return
	}
	if origin != "" && allowed {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
		w.Header().Add("Vary", "Origin")
	}
	w.Header().Set("X-Chess-Auth-Native", "go")

	raw, status := readBody(w, r)
	if status != 0 {
		return
	}
	ctx := context.WithoutCancel(r.Context())
	source, syntheticIdentity, trusted := h.trustedSynthetic(r)

	// Middleware: the per-IP guard, skipped for signed staging probes. Its
	// storage being down never blocks a login.
	ipID := ""
	if !trusted {
		if ip := h.guardIP(r); ip != "" {
			ipID, _ = authguard.IPKey(ip, string(b.secret))
		}
	}
	if ipID != "" {
		if retry, err := h.ipGuard.RetryAfter(ctx, ipID); err == nil && retry > 0 {
			tooManyAttempts(w, retry)
			return
		}
	}
	status = h.login(ctx, w, r, raw, source, syntheticIdentity, trusted)
	if ipID != "" && (status == http.StatusUnauthorized || status == http.StatusForbidden) {
		_, _ = h.ipGuard.RecordFailure(ctx, ipID)
	}
}

// login is the route itself; it returns the status it answered.
func (h *LoginHandler) login(ctx context.Context, w http.ResponseWriter, r *http.Request, raw []byte, source, syntheticIdentity string, trusted bool) int {
	b := h.base
	req, detail, parseStatus := parseLogin(r, raw)
	if parseStatus != 0 {
		if detail != nil {
			writeJSON(w, parseStatus, map[string]any{"detail": detail})
		} else {
			writeJSON(w, parseStatus, map[string]any{"detail": "There was an error parsing the body"})
		}
		return parseStatus
	}

	// Decorated 10/minute: per signed-in user, signed staging identity, or IP.
	key := ""
	if subject, _, err := b.verify(r); err == nil {
		key = "user:" + subject
	} else if trusted {
		key = "synthetic:" + syntheticIdentity
	} else {
		key = "ip:" + b.clientIP(r)
	}
	if !h.limit.allow(key, b.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 10 per 1 minute"})
		return http.StatusTooManyRequests
	}

	loginIdentity := strings.ToLower(strings.TrimSpace(req.Username))
	trustedIdentity := trusted && syntheticIdentity == loginIdentity
	identity := authguard.IdentityKey(loginIdentity, string(b.secret))
	if !trustedIdentity {
		retry, err := h.identityGuard.RetryAfter(ctx, identity)
		if err != nil {
			storageUnavailable(w)
			return http.StatusServiceUnavailable
		}
		if retry > 0 {
			tooManyAttempts(w, retry)
			return http.StatusTooManyRequests
		}
	}

	account, found, err := h.accounts.ForLogin(ctx, loginIdentity)
	if err != nil {
		storageUnavailable(w)
		return http.StatusServiceUnavailable
	}
	username := loginIdentity
	if found && account.Username != "" {
		username = strings.ToLower(strings.TrimSpace(account.Username))
	}
	trustedAccount := trusted && syntheticIdentity == username
	if trusted && !trustedAccount {
		source = ""
	}
	if found && !account.HasPasswordHash {
		internalError(w) // user["password_hash"] raises KeyError in Python
		return http.StatusInternalServerError
	}
	hash, _ := account.PasswordHash.(string)
	if !found || !authcrypto.VerifyPassword(req.Password, hash) {
		reason := "unknown_user"
		if found {
			reason = "bad_password"
		}
		if h.failureLog != nil {
			logSource := ""
			if trustedAccount {
				logSource = source
			}
			h.failureLog.EmitLoginFailed(r, telemetry.LoginFailure{
				RequestID: w.Header().Get("X-Request-ID"), AttemptedUsername: loginIdentity, Password: req.Password,
				FingerprintKey: string(b.secret), AccountExists: found, Reason: reason, SyntheticSource: logSource,
			})
		}
		if !trustedAccount {
			retry, err := h.identityGuard.RecordFailure(ctx, identity)
			if err != nil {
				storageUnavailable(w)
				return http.StatusServiceUnavailable
			}
			if retry > 0 {
				tooManyAttempts(w, retry)
				return http.StatusTooManyRequests
			}
		} else {
			w.Header().Set("X-Chess-Auth-Failure", reason)
		}
		writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Usuario o contraseña incorrectos."})
		return http.StatusUnauthorized
	}

	if err := h.identityGuard.Clear(ctx, identity); err != nil {
		storageUnavailable(w)
		return http.StatusServiceUnavailable
	}
	if h.touch != nil {
		_ = h.touch.Beat(r, username, presence.Heartbeat{}) // best effort
	}
	// The account's own session version (Python's email login forgets it
	// and signs sv=0, which a bumped account then rejects).
	token, err := sessionauth.Sign(username, account.SessionVersion, b.secret, b.now())
	if err != nil {
		internalError(w)
		return http.StatusInternalServerError
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "username": username})
	return http.StatusOK
}

type loginRequest struct {
	Username string
	Password string
}

// parseLogin mirrors LoginRequest under FastAPI: malformed JSON is a 422
// (non-UTF-8 a 400), then both fields are required strings of at most 64
// and 128 characters.
func parseLogin(r *http.Request, raw []byte) (loginRequest, []map[string]any, int) {
	var req loginRequest
	if len(raw) == 0 {
		return req, []map[string]any{{"type": "missing", "loc": []any{"body"}, "msg": "Field required"}}, http.StatusUnprocessableEntity
	}
	var body any = string(raw)
	if jsonContentType(r.Header.Get("Content-Type")) {
		if !utf8.Valid(raw) {
			return req, nil, http.StatusBadRequest
		}
		if err := json.Unmarshal(raw, &body); err != nil {
			return req, []map[string]any{{"type": "json_invalid", "loc": []any{"body", 0}, "msg": "JSON decode error"}}, http.StatusUnprocessableEntity
		}
	}
	fields, ok := body.(map[string]any)
	if !ok {
		return req, []map[string]any{{"type": "model_attributes_type", "loc": []any{"body"}, "msg": "Input should be a valid dictionary or object to extract fields from"}}, http.StatusUnprocessableEntity
	}
	var detail []map[string]any
	for _, f := range []struct {
		key   string
		limit int
		dst   *string
	}{{"username", 64, &req.Username}, {"password", 128, &req.Password}} {
		value, present := fields[f.key]
		s, isString := value.(string)
		switch {
		case !present:
			detail = append(detail, map[string]any{"type": "missing", "loc": []any{"body", f.key}, "msg": "Field required"})
		case !isString:
			detail = append(detail, map[string]any{"type": "string_type", "loc": []any{"body", f.key}, "msg": "Input should be a valid string"})
		case utf8.RuneCountInString(s) > f.limit:
			detail = append(detail, map[string]any{"type": "string_too_long", "loc": []any{"body", f.key}, "msg": "String should have at most " + characters(f.limit)})
		default:
			*f.dst = s
		}
	}
	if detail != nil {
		return req, detail, http.StatusUnprocessableEntity
	}
	return req, nil, 0
}

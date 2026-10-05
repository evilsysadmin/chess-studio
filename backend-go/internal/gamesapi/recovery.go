package gamesapi

// Native password recovery by email, mirroring main.py:
//
//	POST /api/auth/forgot-password  forgot_password  5/hour
//	POST /api/auth/reset-password   reset_password   10/hour
//
// Both answer 404 unless ENABLE_EMAIL_RECOVERY is on. forgot-password says
// the same thing whether or not the email has an account.

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/authcrypto"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
)

const (
	ForgotPasswordPattern = "/api/auth/forgot-password"
	ResetPasswordPattern  = "/api/auth/reset-password"
)

// RecoveryRoute reports whether a request is a native recovery route.
func RecoveryRoute(r *http.Request) (string, bool) {
	if r.URL.Path != ForgotPasswordPattern && r.URL.Path != ResetPasswordPattern {
		return "", false
	}
	if r.Method == http.MethodPost || r.Method == http.MethodOptions && preflightMethod(r) == http.MethodPost {
		return r.URL.Path, true
	}
	return "", false
}

// ResetMailer sends the reset link (resetmail.Sender).
type ResetMailer interface {
	Send(ctx context.Context, email, resetURL string) bool
}

type RecoveryConfig struct {
	Config
	LoginAccounts LoginAccounts
	Store         AccountStore
	Mailer        ResetMailer
	Touch         LoginTouch
	// EmailRecoveryEnabled mirrors ENABLE_EMAIL_RECOVERY.
	EmailRecoveryEnabled bool
	// ResetURL mirrors PASSWORD_RESET_URL.
	ResetURL        string
	Environment     string
	SyntheticSecret string
	Hash            func(string) (string, error)
}

type RecoveryHandler struct {
	base      *Handler
	accounts  LoginAccounts
	store     AccountStore
	mailer    ResetMailer
	touch     LoginTouch
	enabled   bool
	resetURL  string
	synthetic syntheticTrust
	hash      func(string) (string, error)
	limits    map[string]*limiter
}

var recoveryModels = map[string][]field{
	ForgotPasswordPattern: {{alias: "email", limit: 254, required: true}},
	ResetPasswordPattern: {
		{alias: "token", limit: 4096, required: true},
		{alias: "newPassword", name: "new_password", limit: 128, required: true},
	},
}

func NewRecovery(cfg RecoveryConfig) (*RecoveryHandler, error) {
	if cfg.LoginAccounts == nil || cfg.Store == nil || cfg.Mailer == nil {
		return nil, errors.New("recovery needs accounts and a mailer")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	hash := cfg.Hash
	if hash == nil {
		hash = authcrypto.HashPassword
	}
	resetURL := strings.TrimSpace(cfg.ResetURL)
	if resetURL == "" {
		resetURL = "http://localhost:5173/"
	}
	return &RecoveryHandler{
		base: base, accounts: cfg.LoginAccounts, store: cfg.Store, mailer: cfg.Mailer, touch: cfg.Touch,
		enabled: cfg.EmailRecoveryEnabled, resetURL: resetURL, hash: hash,
		synthetic: newSyntheticTrust(cfg.Environment, cfg.SyntheticSecret),
		limits: map[string]*limiter{
			ForgotPasswordPattern: newLimiter(5, time.Hour),
			ResetPasswordPattern:  newLimiter(10, time.Hour),
		},
	}, nil
}

// resetLink mirrors _password_reset_link.
func (h *RecoveryHandler) resetLink(token string) string {
	separator := "?"
	if strings.Contains(h.resetURL, "?") {
		separator = "&"
	}
	return h.resetURL + separator + "resetToken=" + url.PathEscape(token)
}

func (h *RecoveryHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, ok := RecoveryRoute(r)
	if !ok {
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
	body, ok := decodeModelBody(w, r, raw)
	if !ok {
		return
	}
	values, problems := validateModel(body, recoveryModels[pattern])
	if problems != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": problems})
		return
	}
	key := "ip:" + b.clientIP(r)
	if subject, _, err := b.verify(r); err == nil {
		key = "user:" + subject
	} else if _, identity, trusted := h.synthetic.trusted(r); trusted {
		key = "synthetic:" + identity
	}
	limit := h.limits[pattern]
	if !limit.allow(key, b.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: " + strconv.Itoa(limit.limit) + " per 1 hour"})
		return
	}
	if !h.enabled {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Recuperación por email no habilitada."})
		return
	}
	ctx := context.WithoutCancel(r.Context())
	if pattern == ForgotPasswordPattern {
		h.forgot(ctx, w, get(values, "email"))
		return
	}
	h.reset(ctx, w, r, get(values, "token"), get(values, "newPassword"))
}

// forgot mirrors main.forgot_password.
func (h *RecoveryHandler) forgot(ctx context.Context, w http.ResponseWriter, raw string) {
	email, valid := normalizeEmail(raw)
	if !valid {
		badRequest(w, "Introduce un email válido.")
		return
	}
	if email != "" {
		account, found, err := h.accounts.ForLogin(ctx, email)
		if err != nil {
			storageUnavailable(w)
			return
		}
		if hash, _ := account.PasswordHash.(string); found && hash != "" {
			token, err := sessionauth.SignPasswordReset(account.Username, hash, h.base.secret, h.base.now())
			if err == nil {
				_ = h.mailer.Send(ctx, email, h.resetLink(token))
			}
		}
	}
	writeDoc(w, http.StatusOK, bson.D{{Key: "ok", Value: true}, {Key: "message", Value: "Si ese email está registrado, recibirás un enlace de recuperación."}})
}

// reset mirrors main.reset_password.
func (h *RecoveryHandler) reset(ctx context.Context, w http.ResponseWriter, r *http.Request, token, next string) {
	if utf8.RuneCountInString(next) < newPasswordMinLength {
		badRequest(w, "La contraseña tiene que tener al menos 8 caracteres.")
		return
	}
	username := sessionauth.UnverifiedSubject(token)
	invalid := func() { badRequest(w, "El enlace de recuperación no es válido o ha caducado.") }
	if username == "" {
		invalid()
		return
	}
	account, found, err := h.store.ByUsername(ctx, username)
	if err != nil {
		storageUnavailable(w)
		return
	}
	hash, _ := account.PasswordHash.(string)
	if !found {
		invalid()
		return
	}
	if subject, ok := sessionauth.VerifyPasswordReset(token, hash, h.base.secret, h.base.now()); !ok || subject != username {
		invalid()
		return
	}
	newHash, err := h.hash(next)
	if err != nil {
		internalError(w)
		return
	}
	version, updated, err := h.store.UpdatePassword(ctx, username, newHash)
	if err != nil {
		storageUnavailable(w)
		return
	}
	if !updated {
		version = account.SessionVersion // Python signs with the version it last saw
	}
	if h.touch != nil {
		_ = h.touch.Beat(r, username, presence.Heartbeat{Detached: true})
	}
	session, err := sessionauth.Sign(username, version, h.base.secret, h.base.now())
	if err != nil {
		internalError(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": session, "username": username})
}

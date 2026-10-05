package gamesapi

// Native account routes, mirroring main.py and system_api.py:
//
//	POST /api/auth/register        register            5/hour (201)
//	PUT  /api/auth/password        update_password     10/hour
//	PUT  /api/auth/email           update_recovery_email 10/hour
//	POST /api/auth/delete-account  delete_own_account  5/hour
//
// Register sits behind the same per-IP guard as login; the others need a
// session and the current password.

import (
	"context"
	"crypto/hmac"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/accountstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/authcrypto"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/authguard"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/userdata"
)

const (
	RegisterPattern      = "/api/auth/register"
	PasswordPattern      = "/api/auth/password"
	EmailPattern         = "/api/auth/email"
	DeleteAccountPattern = "/api/auth/delete-account"
	// newPasswordMinLength mirrors NEW_PASSWORD_MIN_LENGTH.
	newPasswordMinLength = 8
)

// AccountRoute reports whether a request is a native account route.
func AccountRoute(r *http.Request) (string, bool) {
	want := ""
	switch r.URL.Path {
	case RegisterPattern, DeleteAccountPattern:
		want = http.MethodPost
	case PasswordPattern, EmailPattern:
		want = http.MethodPut
	default:
		return "", false
	}
	if r.Method == want || r.Method == http.MethodOptions && preflightMethod(r) == want {
		return r.URL.Path, true
	}
	return "", false
}

// AccountStore is the account side of accountstore.Store.
type AccountStore interface {
	ByUsername(ctx context.Context, username string) (accountstore.LoginAccount, bool, error)
	EmailOwner(ctx context.Context, email string) (string, bool, error)
	Create(ctx context.Context, username, passwordHash, email, createdAt string) error
	Delete(ctx context.Context, username string) (bool, error)
	UpdatePassword(ctx context.Context, username, passwordHash string) (int64, bool, error)
	UpdateEmail(ctx context.Context, username, email string) error
}

// Purger deletes every document a username owns (userdata.Purge).
type Purger func(ctx context.Context, username string) (userdata.Purged, error)

type AccountConfig struct {
	Config
	Store   AccountStore
	Purge   Purger
	IPGuard Guard
	Touch   LoginTouch
	// AllowRegistration mirrors ALLOW_REGISTRATION (default true).
	AllowRegistration bool
	// InviteCode mirrors INVITE_CODE.
	InviteCode string
	// EmailRecoveryEnabled mirrors ENABLE_EMAIL_RECOVERY.
	EmailRecoveryEnabled bool
	// Environment and SyntheticSecret: signed staging probes (login's).
	Environment     string
	SyntheticSecret string
	// Hash is authcrypto.HashPassword (replaced in tests).
	Hash func(string) (string, error)
}

type AccountHandler struct {
	base          *Handler
	store         AccountStore
	purge         Purger
	ipGuard       Guard
	touch         LoginTouch
	allowRegister bool
	invite        string
	emailRecovery bool
	hash          func(string) (string, error)
	synthetic     syntheticTrust
	limits        map[string]*limiter
}

func NewAccount(cfg AccountConfig) (*AccountHandler, error) {
	if cfg.Store == nil || cfg.Purge == nil || cfg.IPGuard == nil {
		return nil, errors.New("account API needs accounts, the purge and the IP guard")
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
	return &AccountHandler{
		base: base, store: cfg.Store, purge: cfg.Purge, ipGuard: cfg.IPGuard, touch: cfg.Touch,
		allowRegister: cfg.AllowRegistration, invite: strings.TrimSpace(cfg.InviteCode),
		emailRecovery: cfg.EmailRecoveryEnabled, hash: hash,
		synthetic: newSyntheticTrust(cfg.Environment, cfg.SyntheticSecret),
		limits: map[string]*limiter{
			RegisterPattern:      newLimiter(5, time.Hour),
			PasswordPattern:      newLimiter(10, time.Hour),
			EmailPattern:         newLimiter(10, time.Hour),
			DeleteAccountPattern: newLimiter(5, time.Hour),
		},
	}, nil
}

// field is one string field of a request model.
type field struct {
	alias, name string
	limit       int
	required    bool
}

var accountModels = map[string][]field{
	RegisterPattern: {
		{alias: "username", limit: 64, required: true},
		{alias: "password", limit: 128, required: true},
		{alias: "email", limit: 254},
		{alias: "inviteCode", name: "invite_code", limit: 128},
	},
	PasswordPattern: {
		{alias: "currentPassword", name: "current_password", limit: 128, required: true},
		{alias: "newPassword", name: "new_password", limit: 128, required: true},
	},
	EmailPattern: {
		{alias: "email", limit: 254, required: true},
		{alias: "password", limit: 128, required: true},
	},
	DeleteAccountPattern: {
		{alias: "password", limit: 128, required: true},
	},
}

// decodeModelBody is FastAPI's body step before dependencies: malformed
// JSON is a 422 (non-UTF-8 a 400) answered before authentication.
func decodeModelBody(w http.ResponseWriter, r *http.Request, raw []byte) (any, bool) {
	if len(raw) == 0 || !jsonContentType(r.Header.Get("Content-Type")) {
		if len(raw) == 0 {
			return nil, true
		}
		return string(raw), true
	}
	if !utf8.Valid(raw) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "There was an error parsing the body"})
		return nil, false
	}
	var body any
	if err := json.Unmarshal(raw, &body); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": []map[string]any{{"type": "json_invalid", "loc": []any{"body", 0}, "msg": "JSON decode error"}}})
		return nil, false
	}
	return body, true
}

// validateModel mirrors pydantic for models of optional/required strings
// (alias first, field name accepted too: populate_by_name).
func validateModel(body any, fields []field) (map[string]*string, []map[string]any) {
	if body == nil {
		return nil, []map[string]any{{"type": "missing", "loc": []any{"body"}, "msg": "Field required"}}
	}
	object, ok := body.(map[string]any)
	if !ok {
		return nil, []map[string]any{{"type": "model_attributes_type", "loc": []any{"body"}, "msg": "Input should be a valid dictionary or object to extract fields from"}}
	}
	values := map[string]*string{}
	var detail []map[string]any
	for _, f := range fields {
		key := f.alias
		value, present := object[f.alias]
		if !present && f.name != "" {
			if v, ok := object[f.name]; ok {
				key, value, present = f.name, v, true
			}
		}
		switch {
		case !present && f.required:
			detail = append(detail, map[string]any{"type": "missing", "loc": []any{"body", f.alias}, "msg": "Field required"})
		case !present, value == nil && !f.required:
		default:
			s, isString := value.(string)
			if !isString {
				detail = append(detail, map[string]any{"type": "string_type", "loc": []any{"body", key}, "msg": "Input should be a valid string"})
			} else if utf8.RuneCountInString(s) > f.limit {
				detail = append(detail, map[string]any{"type": "string_too_long", "loc": []any{"body", key}, "msg": "String should have at most " + characters(f.limit)})
			} else {
				values[f.alias] = &s
			}
		}
	}
	return values, detail
}

func get(values map[string]*string, key string) string {
	if v := values[key]; v != nil {
		return *v
	}
	return ""
}

func (h *AccountHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, ok := AccountRoute(r)
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
	ctx := context.WithoutCancel(r.Context())
	if pattern == RegisterPattern {
		h.withIPGuard(ctx, w, r, func() int { return h.register(ctx, w, r, raw) })
		return
	}
	body, ok := decodeModelBody(w, r, raw)
	if !ok {
		return
	}
	subject, version, tokenErr := b.verify(r)
	username, status, detail := b.currentUser(r, subject, version, tokenErr)
	if status != 0 {
		writeJSON(w, status, map[string]any{"detail": detail})
		return
	}
	if b.presence != nil {
		b.presence.Touch(r, username)
	}
	values, problems := validateModel(body, accountModels[pattern])
	if problems != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": problems})
		return
	}
	if !h.limits[pattern].allow("user:"+username, b.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: " + strconv.Itoa(h.limits[pattern].limit) + " per 1 hour"})
		return
	}
	switch pattern {
	case PasswordPattern:
		h.updatePassword(ctx, w, r, username, values)
	case EmailPattern:
		h.updateEmail(ctx, w, username, values)
	default:
		h.deleteAccount(ctx, w, username, values)
	}
}

// withIPGuard mirrors the middleware around public auth routes.
func (h *AccountHandler) withIPGuard(ctx context.Context, w http.ResponseWriter, r *http.Request, route func() int) {
	ipID := ""
	if _, _, trusted := h.synthetic.trusted(r); !trusted {
		if ip := guardIP(r, h.base.trustCF); ip != "" {
			ipID, _ = authguard.IPKey(ip, string(h.base.secret))
		}
	}
	if ipID != "" {
		if retry, err := h.ipGuard.RetryAfter(ctx, ipID); err == nil && retry > 0 {
			tooManyAttempts(w, retry)
			return
		}
	}
	status := route()
	if ipID != "" && (status == http.StatusUnauthorized || status == http.StatusForbidden) {
		_, _ = h.ipGuard.RecordFailure(ctx, ipID)
	}
}

// emailPattern mirrors _EMAIL_RE (Python's \s is Unicode whitespace).
var emailPattern = regexp.MustCompile(`^[^\s\p{Z}\x{85}\x{1c}-\x{1f}\v@]+@[^\s\p{Z}\x{85}\x{1c}-\x{1f}\v@]+\.[^\s\p{Z}\x{85}\x{1c}-\x{1f}\v@]+$`)

// normalizeEmail mirrors _normalize_email: "" for no email, ok false for a
// 400 "Introduce un email válido.".
func normalizeEmail(value string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(value))
	if email == "" {
		return "", true
	}
	if utf8.RuneCountInString(email) > 254 || !emailPattern.MatchString(email) {
		return "", false
	}
	return email, true
}

func badRequest(w http.ResponseWriter, detail string) int {
	writeJSON(w, http.StatusBadRequest, map[string]any{"detail": detail})
	return http.StatusBadRequest
}

// register mirrors main.register.
func (h *AccountHandler) register(ctx context.Context, w http.ResponseWriter, r *http.Request, raw []byte) int {
	b := h.base
	body, ok := decodeModelBody(w, r, raw)
	if !ok {
		if utf8.Valid(raw) {
			return http.StatusUnprocessableEntity
		}
		return http.StatusBadRequest
	}
	values, problems := validateModel(body, accountModels[RegisterPattern])
	if problems != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": problems})
		return http.StatusUnprocessableEntity
	}
	key := "ip:" + b.clientIP(r)
	if subject, _, err := b.verify(r); err == nil {
		key = "user:" + subject
	} else if _, identity, trusted := h.synthetic.trusted(r); trusted {
		key = "synthetic:" + identity
	}
	if !h.limits[RegisterPattern].allow(key, b.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 5 per 1 hour"})
		return http.StatusTooManyRequests
	}
	if !h.allowRegister {
		writeJSON(w, http.StatusForbidden, map[string]any{"detail": "El registro está deshabilitado temporalmente."})
		return http.StatusForbidden
	}
	if h.invite != "" {
		supplied := strings.TrimSpace(get(values, "inviteCode"))
		if supplied == "" || !hmac.Equal([]byte(supplied), []byte(h.invite)) {
			writeJSON(w, http.StatusForbidden, map[string]any{"detail": "Código de invitación no válido."})
			return http.StatusForbidden
		}
	}
	username := strings.ToLower(strings.TrimSpace(get(values, "username")))
	password := get(values, "password")
	if utf8.RuneCountInString(username) < 3 {
		return badRequest(w, "El usuario tiene que tener al menos 3 caracteres.")
	}
	if utf8.RuneCountInString(password) < newPasswordMinLength {
		return badRequest(w, "La contraseña tiene que tener al menos 8 caracteres.")
	}
	email := ""
	if h.emailRecovery {
		normalized, valid := normalizeEmail(get(values, "email"))
		if !valid {
			return badRequest(w, "Introduce un email válido.")
		}
		if normalized == "" {
			return badRequest(w, "El email es obligatorio para cuentas nuevas.")
		}
		email = normalized
	}
	if _, exists, err := h.store.ByUsername(ctx, username); err != nil {
		storageUnavailable(w)
		return http.StatusServiceUnavailable
	} else if exists {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ese usuario ya existe."})
		return http.StatusConflict
	}
	if email != "" {
		if _, taken, err := h.store.EmailOwner(ctx, email); err != nil {
			storageUnavailable(w)
			return http.StatusServiceUnavailable
		} else if taken {
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ese email ya está asociado a otra cuenta."})
			return http.StatusConflict
		}
	}
	hash, err := h.hash(password)
	if err != nil {
		internalError(w)
		return http.StatusInternalServerError
	}
	switch err := h.store.Create(ctx, username, hash, email, presence.PyUTCISOFormat(b.now())); {
	case errors.Is(err, accountstore.ErrEmailExists):
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ese email ya está asociado a otra cuenta."})
		return http.StatusConflict
	case errors.Is(err, accountstore.ErrUserExists):
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ese usuario ya existe."})
		return http.StatusConflict
	case err != nil:
		storageUnavailable(w)
		return http.StatusServiceUnavailable
	}
	// A new account is always vanilla: nothing a previous owner of the
	// username left may survive. If that cannot be guaranteed, undo it.
	if _, err := h.purge(ctx, username); err != nil {
		_, _ = h.store.Delete(ctx, username)
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo inicializar el perfil nuevo. Reintenta en unos segundos."})
		return http.StatusServiceUnavailable
	}
	token, err := sessionauth.Sign(username, 0, b.secret, b.now())
	if err != nil {
		internalError(w)
		return http.StatusInternalServerError
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "username": username})
	return http.StatusCreated
}

// checkPassword mirrors "get_user + verify_password or 401".
func (h *AccountHandler) checkPassword(ctx context.Context, w http.ResponseWriter, username, password string) bool {
	account, found, err := h.store.ByUsername(ctx, username)
	if err != nil {
		storageUnavailable(w)
		return false
	}
	hash, _ := account.PasswordHash.(string)
	if !found || !authcrypto.VerifyPassword(password, hash) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "La contraseña actual no es correcta."})
		return false
	}
	return true
}

// updatePassword mirrors main.update_password.
func (h *AccountHandler) updatePassword(ctx context.Context, w http.ResponseWriter, r *http.Request, username string, values map[string]*string) {
	next := get(values, "newPassword")
	if utf8.RuneCountInString(next) < newPasswordMinLength {
		badRequest(w, "La contraseña tiene que tener al menos 8 caracteres.")
		return
	}
	if !h.checkPassword(ctx, w, username, get(values, "currentPassword")) {
		return
	}
	hash, err := h.hash(next)
	if err != nil {
		internalError(w)
		return
	}
	version, found, err := h.store.UpdatePassword(ctx, username, hash)
	if err != nil {
		storageUnavailable(w)
		return
	}
	if !found {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "La cuenta ya no existe."})
		return
	}
	if h.touch != nil {
		_ = h.touch.Beat(r, username, presence.Heartbeat{})
	}
	token, err := sessionauth.Sign(username, version, h.base.secret, h.base.now())
	if err != nil {
		internalError(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "username": username})
}

// updateEmail mirrors main.update_recovery_email.
func (h *AccountHandler) updateEmail(ctx context.Context, w http.ResponseWriter, username string, values map[string]*string) {
	if !h.checkPassword(ctx, w, username, get(values, "password")) {
		return
	}
	email, valid := normalizeEmail(get(values, "email"))
	if !valid {
		badRequest(w, "Introduce un email válido.")
		return
	}
	if email == "" {
		badRequest(w, "El email de recuperación no puede quedar vacío.")
		return
	}
	owner, taken, err := h.store.EmailOwner(ctx, email)
	if err != nil {
		storageUnavailable(w)
		return
	}
	if taken && owner != username {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ese email ya está asociado a otra cuenta."})
		return
	}
	switch err := h.store.UpdateEmail(ctx, username, email); {
	case errors.Is(err, accountstore.ErrEmailExists):
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ese email ya está asociado a otra cuenta."})
		return
	case err != nil:
		storageUnavailable(w)
		return
	}
	writeDoc(w, http.StatusOK, bson.D{{Key: "username", Value: username}, {Key: "email", Value: email}})
}

// deleteAccount mirrors system_api.delete_own_account: every owned
// document first, the account last, so a partial outage leaves a retryable
// account rather than a vanished one with leftovers.
func (h *AccountHandler) deleteAccount(ctx context.Context, w http.ResponseWriter, username string, values map[string]*string) {
	if !h.checkPassword(ctx, w, username, get(values, "password")) {
		return
	}
	purged, err := h.purge(ctx, username)
	if err != nil {
		storageUnavailable(w)
		return
	}
	deleted, err := h.store.Delete(ctx, username)
	if err != nil {
		storageUnavailable(w)
		return
	}
	if !deleted {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "La cuenta ya no existe."})
		return
	}
	writeDoc(w, http.StatusOK, bson.D{{Key: "deleted", Value: true}, {Key: "username", Value: username}, {Key: "deletedGames", Value: purged.Games}})
}

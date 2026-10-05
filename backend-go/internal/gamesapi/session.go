package gamesapi

// Native session routes, mirroring main.py:
//
//	GET  /api/auth/me        me                 (default 120/minute)
//	POST /api/auth/activity  activity_heartbeat 30/minute
//	POST /api/auth/logout    logout_presence    30/minute

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
)

const (
	MePattern       = "/api/auth/me"
	ActivityPattern = "/api/auth/activity"
	LogoutPattern   = "/api/auth/logout"
)

// SessionRoute reports whether a request is a native session route.
func SessionRoute(r *http.Request) (string, bool) {
	want := ""
	switch r.URL.Path {
	case MePattern:
		want = http.MethodGet
	case ActivityPattern, LogoutPattern:
		want = http.MethodPost
	default:
		return "", false
	}
	if r.Method == want || r.Method == http.MethodOptions && preflightMethod(r) == want {
		return r.URL.Path, true
	}
	return "", false
}

// AccountEmails reads an account's email (accountstore.Store.Email).
type AccountEmails interface {
	Email(ctx context.Context, username string) (any, error)
}

// PresenceSessions writes heartbeats and logouts (presence.Sessions).
type PresenceSessions interface {
	Beat(r *http.Request, username string, beat presence.Heartbeat) error
	Logout(r *http.Request, username string) error
}

type SessionConfig struct {
	Config
	Emails   AccountEmails
	Sessions PresenceSessions
	// AdminUsernames mirrors ADMIN_USERNAMES.
	AdminUsernames []string
	// EmailRecoveryEnabled mirrors ENABLE_EMAIL_RECOVERY.
	EmailRecoveryEnabled bool
}

type SessionHandler struct {
	base          *Handler
	emails        AccountEmails
	sessions      PresenceSessions
	admins        map[string]bool
	allAdmins     bool
	emailRecovery bool
	meLimit       *limiter
	limits        map[string]*limiter
}

func NewSession(cfg SessionConfig) (*SessionHandler, error) {
	if cfg.Emails == nil || cfg.Sessions == nil {
		return nil, errors.New("session API needs accounts and presence sessions")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	h := &SessionHandler{
		base: base, emails: cfg.Emails, sessions: cfg.Sessions, admins: map[string]bool{},
		emailRecovery: cfg.EmailRecoveryEnabled,
		meLimit:       newLimiter(120, time.Minute),
		limits: map[string]*limiter{
			ActivityPattern: newLimiter(30, time.Minute),
			LogoutPattern:   newLimiter(30, time.Minute),
		},
	}
	for _, raw := range cfg.AdminUsernames {
		switch name := strings.ToLower(strings.TrimSpace(raw)); name {
		case "":
		case "*":
			h.allAdmins = true
		default:
			h.admins[name] = true
		}
	}
	return h, nil
}

// isAdmin mirrors main.is_admin.
func (h *SessionHandler) isAdmin(username string) bool {
	return h.allAdmins || h.admins[strings.ToLower(username)]
}

// allowedActivities mirrors activity_heartbeat's coarse screen labels.
var allowedActivities = map[string]bool{
	"Menú principal": true, "Partida": true, "Partida rápida": true, "Torneo": true, "Combat Chess": true, "Replay": true,
	"Así juegas": true, "Historial": true, "Puzzle": true, "Aprendizaje": true, "Aperturas": true,
	"Laboratorio": true, "Espectador": true, "Panel admin": true, "Experimento 3D": true, "Navegando": true,
}

var heartbeatRelease = regexp.MustCompile(`^v[0-9A-Za-z][0-9A-Za-z._-]{0,30}$`)

func (h *SessionHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, ok := SessionRoute(r)
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
	w.Header().Set("X-Chess-Session-Native", "go")

	subject, version, tokenErr := b.verify(r)
	if pattern == MePattern {
		key := "user:" + subject
		if tokenErr != nil {
			key = "ip:" + b.clientIP(r)
		}
		if !h.meLimit.allow(key, b.now()) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
			return
		}
	}

	var body any
	hasBody := false
	if pattern == ActivityPattern {
		raw, status := readBody(w, r)
		if status != 0 {
			return
		}
		if len(raw) > 0 && jsonContentType(r.Header.Get("Content-Type")) {
			if !utf8.Valid(raw) {
				writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "There was an error parsing the body"})
				return
			}
			if err := json.Unmarshal(raw, &body); err != nil {
				writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": []map[string]any{{"type": "json_invalid", "loc": []any{"body", 0}, "msg": "JSON decode error"}}})
				return
			}
			hasBody = true
		} else if len(raw) > 0 {
			body, hasBody = string(raw), true
		}
	}

	username, status, detail := b.currentUser(r, subject, version, tokenErr)
	if status != 0 {
		writeJSON(w, status, map[string]any{"detail": detail})
		return
	}
	if b.presence != nil {
		b.presence.Touch(r, username)
	}

	switch pattern {
	case MePattern:
		h.me(w, r, username)
	case ActivityPattern:
		beat, detail := parseHeartbeat(body, hasBody)
		if detail != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": detail})
			return
		}
		if !h.limits[pattern].allow("user:"+username, b.now()) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 30 per 1 minute"})
			return
		}
		if err := h.sessions.Beat(r, username, beat); err != nil {
			storageUnavailable(w)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		if !h.limits[pattern].allow("user:"+username, b.now()) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 30 per 1 minute"})
			return
		}
		// The token is stateless: logout only closes this tab's presence,
		// and a storage failure is logged by Python, never surfaced.
		_ = h.sessions.Logout(r, username)
		w.WriteHeader(http.StatusNoContent)
	}
}

func readBody(w http.ResponseWriter, r *http.Request) ([]byte, int) {
	if r.ContentLength > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return nil, http.StatusRequestEntityTooLarge
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBodyBytes+1))
	if err != nil || len(raw) > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return nil, http.StatusRequestEntityTooLarge
	}
	return raw, 0
}

// me mirrors main.me.
func (h *SessionHandler) me(w http.ResponseWriter, r *http.Request, username string) {
	email, err := h.emails.Email(context.WithoutCancel(r.Context()), username)
	if err != nil {
		storageUnavailable(w)
		return
	}
	writeDoc(w, http.StatusOK, bson.D{
		{Key: "username", Value: username},
		{Key: "isAdmin", Value: h.isAdmin(username)},
		{Key: "email", Value: email},
		{Key: "emailRecoveryEnabled", Value: h.emailRecovery},
	})
}

// parseHeartbeat mirrors Optional[ActivityHeartbeatRequest] and the route's
// sanitising: unknown screens and malformed releases are dropped.
func parseHeartbeat(body any, hasBody bool) (presence.Heartbeat, []map[string]any) {
	var beat presence.Heartbeat
	if !hasBody || body == nil {
		return beat, nil
	}
	fields, ok := body.(map[string]any)
	if !ok {
		return beat, []map[string]any{{"type": "model_attributes_type", "loc": []any{"body"}, "msg": "Input should be a valid dictionary or object to extract fields from"}}
	}
	var detail []map[string]any
	str := func(key string, limit int) string {
		value, present := fields[key]
		if !present || value == nil {
			return ""
		}
		s, isString := value.(string)
		if !isString {
			detail = append(detail, map[string]any{"type": "string_type", "loc": []any{"body", key}, "msg": "Input should be a valid string"})
			return ""
		}
		if utf8.RuneCountInString(s) > limit {
			detail = append(detail, map[string]any{"type": "string_too_long", "loc": []any{"body", key}, "msg": "String should have at most " + characters(limit)})
			return ""
		}
		return s
	}
	activity := str("activity", 40)
	if raw, present := fields["foreground"]; present && raw != nil {
		value, problem := laxBool(raw)
		if problem != nil {
			problem["loc"] = []any{"body", "foreground"}
			detail = append(detail, problem)
		} else {
			beat.Foreground = &value
		}
	}
	release := strings.TrimSpace(str("release", 32))
	if detail != nil {
		return beat, detail
	}
	if allowedActivities[activity] {
		beat.Activity = activity
	}
	if heartbeatRelease.MatchString(release) {
		beat.Release = release
	}
	return beat, nil
}

// laxBool mirrors pydantic's lax bool from JSON.
func laxBool(raw any) (bool, map[string]any) {
	parsing := map[string]any{"type": "bool_parsing", "msg": "Input should be a valid boolean, unable to interpret input"}
	switch v := raw.(type) {
	case bool:
		return v, nil
	case float64:
		switch v {
		case 0:
			return false, nil
		case 1:
			return true, nil
		}
		return false, parsing
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "0", "off", "f", "false", "n", "no":
			return false, nil
		case "1", "on", "t", "true", "y", "yes":
			return true, nil
		}
		return false, parsing
	}
	return false, map[string]any{"type": "bool_type", "msg": "Input should be a valid boolean"}
}

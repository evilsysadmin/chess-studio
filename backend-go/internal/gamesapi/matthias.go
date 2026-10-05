package gamesapi

// Native read side of Matthias' audience, mirroring matthias_daily_api.py:
//
//	GET  /api/matthias/daily         daily_status       (default 120/minute)
//	GET  /api/matthias/briefing      game_briefing      (default 120/minute)
//	POST /api/matthias/reset-memory  reset_own_memory   (default 120/minute)
//
// POST /api/matthias/daily (the Workers AI audience) stays in Python.

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matthiasmem"
)

const (
	MatthiasDailyPattern    = "/api/matthias/daily"
	MatthiasBriefingPattern = "/api/matthias/briefing"
	MatthiasResetPattern    = "/api/matthias/reset-memory"
)

// MatthiasRoute reports whether a request is a native Matthias read route.
func MatthiasRoute(r *http.Request) (string, bool) {
	want := ""
	switch r.URL.Path {
	case MatthiasDailyPattern, MatthiasBriefingPattern:
		want = http.MethodGet
	case MatthiasResetPattern:
		want = http.MethodPost
	default:
		return "", false
	}
	if r.Method == want || r.Method == http.MethodOptions && preflightMethod(r) == want {
		return r.URL.Path, true
	}
	return "", false
}

// MatthiasStore is matthiasmem.Store.
type MatthiasStore interface {
	Memory(ctx context.Context, username string) (bson.D, error)
	Daily(ctx context.Context, username string) (bson.D, error)
	DeleteMemory(ctx context.Context, username string) error
}

type MatthiasConfig struct {
	Config
	Matthias MatthiasStore
	// AdminUsernames mirrors ADMIN_USERNAMES (admins have unlimited audiences).
	AdminUsernames []string
}

type MatthiasHandler struct {
	base      *Handler
	store     MatthiasStore
	limits    map[string]*limiter
	admins    map[string]bool
	allAdmins bool
}

func NewMatthias(cfg MatthiasConfig) (*MatthiasHandler, error) {
	if cfg.Matthias == nil {
		return nil, errors.New("matthias API needs a store")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	h := &MatthiasHandler{base: base, store: cfg.Matthias, admins: map[string]bool{}, limits: map[string]*limiter{
		MatthiasDailyPattern:    newLimiter(120, time.Minute),
		MatthiasBriefingPattern: newLimiter(120, time.Minute),
		MatthiasResetPattern:    newLimiter(120, time.Minute),
	}}
	for _, raw := range cfg.AdminUsernames {
		name := strings.ToLower(strings.TrimSpace(raw))
		if name == "*" {
			h.allAdmins = true
		} else if name != "" {
			h.admins[name] = true
		}
	}
	return h, nil
}

func (h *MatthiasHandler) isAdmin(username string) bool {
	return h.allAdmins || h.admins[strings.ToLower(username)]
}

func (h *MatthiasHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, ok := MatthiasRoute(r)
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
	w.Header().Set("X-Chess-Matthias-Native", "go")
	if r.ContentLength > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}

	subject, version, tokenErr := b.verify(r)
	key := "user:" + subject
	if tokenErr != nil {
		key = "ip:" + b.clientIP(r)
	}
	if !h.limits[pattern].allow(key, b.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
		return
	}
	username, status, detail := b.currentUser(r, subject, version, tokenErr)
	if status != 0 {
		writeJSON(w, status, map[string]any{"detail": detail})
		return
	}
	if b.presence != nil {
		b.presence.Touch(r, username)
	}
	ctx := context.WithoutCancel(r.Context())
	switch pattern {
	case MatthiasDailyPattern:
		h.daily(ctx, w, username)
	case MatthiasBriefingPattern:
		h.briefing(ctx, w, username)
	default:
		if err := h.store.DeleteMemory(ctx, username); err != nil {
			storageUnavailable(w)
			return
		}
		writeDoc(w, http.StatusOK, bson.D{{Key: "reset", Value: true}})
	}
}

// memory is _memory_summary, or nil when Python's would raise.
func (h *MatthiasHandler) memory(ctx context.Context, username string) (*matthiasmem.Summary, bson.D) {
	row, err := h.store.Memory(ctx, username)
	if err != nil {
		return nil, nil
	}
	summary, doc, err := matthiasmem.MemorySummary(row, h.base.now())
	if err != nil {
		return nil, nil
	}
	return summary, doc
}

// daily mirrors daily_status.
func (h *MatthiasHandler) daily(ctx context.Context, w http.ResponseWriter, username string) {
	var base bson.D
	if h.isAdmin(username) {
		base = bson.D{{Key: "used", Value: false}, {Key: "pending", Value: false}, {Key: "unlimited", Value: true}}
	} else {
		row, err := h.store.Daily(ctx, username)
		if err != nil {
			storageUnavailable(w)
			return
		}
		base = append(matthiasmem.DailyStatus(row, matthiasmem.MadridDay(h.base.now())), bson.E{Key: "unlimited", Value: false})
	}
	_, memory := h.memory(ctx, username)
	if memory == nil {
		memory = matthiasmem.EmptyMemorySummary()
	}
	writeDoc(w, http.StatusOK, append(base, bson.E{Key: "memory", Value: memory}))
}

// briefing mirrors game_briefing: any failure answers the fixed briefing.
func (h *MatthiasHandler) briefing(ctx context.Context, w http.ResponseWriter, username string) {
	summary, memory := h.memory(ctx, username)
	if summary == nil {
		writeDoc(w, http.StatusOK, bson.D{{Key: "text", Value: matthiasmem.FallbackBriefing}, {Key: "memory", Value: nil}})
		return
	}
	writeDoc(w, http.StatusOK, bson.D{{Key: "text", Value: summary.Briefing()}, {Key: "memory", Value: memory}})
}

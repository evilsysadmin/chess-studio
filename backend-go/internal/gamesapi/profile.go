package gamesapi

// Native profile routes, mirroring main.py:
//
//	GET   /api/profile  get_profile    60/minute
//	PUT   /api/profile  save_profile   20/minute
//	PATCH /api/profile  patch_profile  60/minute
//
// The owner always comes from the session, never from the body. FastAPI's
// order is kept: a malformed JSON body is a 422 before authentication, a
// well-formed body of the wrong shape is a 422 after it, and the decorated
// rate limit runs last.

import (
	"context"
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/profilestore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

const ProfilePattern = "/api/profile"

// ProfileRoute reports whether a request is a native profile route.
func ProfileRoute(r *http.Request) (string, bool) {
	if r.URL.Path != ProfilePattern {
		return "", false
	}
	method := r.Method
	if method == http.MethodOptions {
		method = preflightMethod(r)
	}
	switch method {
	case http.MethodGet, http.MethodPut, http.MethodPatch:
		return ProfilePattern, true
	}
	return "", false
}

// ProfileStore is profilestore.Store.
type ProfileStore interface {
	Get(ctx context.Context, username string) (bson.D, bool, error)
	Save(ctx context.Context, username string, body bson.D) (bson.D, error)
	Patch(ctx context.Context, username string, changes, expected bson.D) (bson.D, *profilestore.Conflict, error)
}

type ProfileConfig struct {
	Config
	Profiles ProfileStore
}

type ProfileHandler struct {
	base     *Handler
	profiles ProfileStore
	limits   map[string]*limiter
}

func NewProfile(cfg ProfileConfig) (*ProfileHandler, error) {
	if cfg.Profiles == nil {
		return nil, errors.New("profile API needs a profile store")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	return &ProfileHandler{
		base: base, profiles: cfg.Profiles,
		limits: map[string]*limiter{
			http.MethodGet:   newLimiter(60, time.Minute),
			http.MethodPut:   newLimiter(20, time.Minute),
			http.MethodPatch: newLimiter(60, time.Minute),
		},
	}, nil
}

// jsonContentType mirrors FastAPI's check: application/json or */*+json.
func jsonContentType(raw string) bool {
	if raw == "" {
		return false
	}
	mediaType, _, err := mime.ParseMediaType(raw)
	if err != nil {
		mediaType = strings.ToLower(strings.TrimSpace(strings.SplitN(raw, ";", 2)[0]))
	}
	main, sub, _ := strings.Cut(mediaType, "/")
	return main == "application" && (sub == "json" || strings.HasSuffix(sub, "+json"))
}

var errNotJSONBody = errors.New("body was not read as JSON")

func (h *ProfileHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if _, ok := ProfileRoute(r); !ok {
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
	w.Header().Set("X-Chess-Profile-Native", "go")

	var body any
	bodyErr := errNotJSONBody
	if r.Method != http.MethodGet {
		if r.ContentLength > MaxRequestBodyBytes {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
			return
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBodyBytes+1))
		if err != nil || len(raw) > MaxRequestBodyBytes {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
			return
		}
		switch {
		case len(raw) == 0:
			bodyErr = io.EOF
		case jsonContentType(r.Header.Get("Content-Type")):
			if !utf8.Valid(raw) {
				// json.loads fails decoding the bytes, not parsing them.
				writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "There was an error parsing the body"})
				return
			}
			value, err := pydoc.Decode(raw)
			if errors.Is(err, pydoc.ErrIntegerTooLarge) {
				// pymongo cannot store it: Python fails after authenticating.
				body, bodyErr = value, err
				break
			}
			if err != nil {
				writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": []map[string]any{{"type": "json_invalid", "loc": []any{"body", 0}, "msg": "JSON decode error"}}})
				return
			}
			body, bodyErr = value, nil
		}
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

	var doc bson.D
	if r.Method != http.MethodGet {
		switch {
		case errors.Is(bodyErr, io.EOF):
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": []map[string]any{{"type": "missing", "loc": []any{"body"}, "msg": "Field required"}}})
			return
		case errors.Is(bodyErr, pydoc.ErrIntegerTooLarge):
			internalError(w)
			return
		}
		object, ok := body.(bson.D)
		if bodyErr != nil || !ok {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": []map[string]any{{"type": "dict_type", "loc": []any{"body"}, "msg": "Input should be a valid dictionary"}}})
			return
		}
		doc = object
	}

	if !h.limits[r.Method].allow("user:"+username, b.now()) {
		limit := h.limits[r.Method].limit
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: " + strconv.Itoa(limit) + " per 1 minute"})
		return
	}

	ctx := context.WithoutCancel(r.Context())
	switch r.Method {
	case http.MethodGet:
		profile, found, err := h.profiles.Get(ctx, username)
		if err != nil {
			storageUnavailable(w)
			return
		}
		if !found {
			profile = bson.D{}
		}
		writeDoc(w, http.StatusOK, profile)
	case http.MethodPut:
		saved, err := h.profiles.Save(ctx, username, doc)
		if err != nil {
			storageUnavailable(w)
			return
		}
		writeDoc(w, http.StatusOK, saved)
	default:
		h.patch(ctx, w, username, doc)
	}
}

func (h *ProfileHandler) patch(ctx context.Context, w http.ResponseWriter, username string, body bson.D) {
	rawChanges, _ := pydoc.Get(body, "data")
	rawRevisions, _ := pydoc.Get(body, "revisions")
	changes, okChanges := rawChanges.(bson.D)
	revisions, okRevisions := rawRevisions.(bson.D)
	if !okChanges || !okRevisions {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "PATCH de perfil inválido."})
		return
	}
	if len(changes) > 128 || len(revisions) > 128 {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "PATCH de perfil demasiado grande."})
		return
	}
	for _, set := range []bson.D{changes, revisions} {
		for _, e := range set {
			if utf8.RuneCountInString(e.Key) > 160 {
				writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "PATCH de perfil contiene una clave inválida."})
				return
			}
		}
	}
	result, conflict, err := h.profiles.Patch(ctx, username, changes, revisions)
	if err != nil {
		storageUnavailable(w)
		return
	}
	if conflict != nil {
		writeDoc(w, http.StatusConflict, bson.D{{Key: "detail", Value: bson.D{
			{Key: "message", Value: "El perfil cambió en otra pestaña; relee y fusiona las claves en conflicto."},
			{Key: "conflicts", Value: conflict.Conflicts},
			{Key: "profile", Value: conflict.Profile},
			{Key: "revisions", Value: conflict.Revisions.Doc()},
		}}})
		return
	}
	writeDoc(w, http.StatusOK, result)
}

// writeDoc answers an ordered document like FastAPI's JSONResponse; a value
// JSON cannot carry (an infinite float someone stored) is Python's 500.
func writeDoc(w http.ResponseWriter, status int, doc bson.D) {
	encoded, err := pydoc.Encode(doc)
	if err != nil {
		internalError(w)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(encoded)
}

// internalError mirrors main's unhandled-exception handler.
func internalError(w http.ResponseWriter) {
	writeJSON(w, http.StatusInternalServerError, map[string]any{
		"detail":    "Error interno del servidor.",
		"requestId": w.Header().Get("X-Request-ID"),
	})
}

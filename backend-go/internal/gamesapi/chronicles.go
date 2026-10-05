package gamesapi

// Native Chronicles area content, mirroring chronicles_api.py:
//
//	POST /api/chronicles/map-code/preview  (default 120/minute)
//	GET  /api/chronicles/maps/{map_id}?seed=  (default 120/minute)
//
// The run routes (/api/chronicles/runs...) stay on Python for now.

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chronicles"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesmap"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

const (
	ChroniclesPreviewPattern = "POST /api/chronicles/map-code/preview"
	ChroniclesMapPattern     = "GET /api/chronicles/maps/{map_id}"
	chroniclesPreviewPath    = "/api/chronicles/map-code/preview"
	chroniclesMapPrefix      = "/api/chronicles/maps/"
)

// ChroniclesRoute reports whether a request is a native Chronicles route.
func ChroniclesRoute(r *http.Request) (string, bool) {
	method := r.Method
	if method == http.MethodOptions {
		method = preflightMethod(r)
	}
	switch {
	case method == http.MethodPost && r.URL.Path == chroniclesPreviewPath:
		return ChroniclesPreviewPattern, true
	case method == http.MethodGet && strings.HasPrefix(r.URL.Path, chroniclesMapPrefix):
		id := strings.TrimPrefix(r.URL.Path, chroniclesMapPrefix)
		if id != "" && !strings.Contains(id, "/") {
			return ChroniclesMapPattern, true
		}
	}
	return "", false
}

type ChroniclesHandler struct {
	base   *Handler
	limits map[string]*limiter
}

func NewChronicles(cfg Config) (*ChroniclesHandler, error) {
	cfg.Store = readOnlyStore{}
	base, err := New(cfg)
	if err != nil {
		return nil, err
	}
	return &ChroniclesHandler{base: base, limits: map[string]*limiter{
		ChroniclesPreviewPattern: newLimiter(120, time.Minute),
		ChroniclesMapPattern:     newLimiter(120, time.Minute),
	}}, nil
}

// previewProblems mirrors PreviewChroniclesMapCodeRequest (alias mapCode,
// populate_by_name, 1..256 characters, extra="forbid").
func previewProblems(body any) (string, bson.A) {
	problem := func(kind string, loc bson.A, msg string, input any, ctx bson.D) bson.D {
		d := bson.D{{Key: "type", Value: kind}, {Key: "loc", Value: loc}, {Key: "msg", Value: msg}, {Key: "input", Value: input}}
		if ctx != nil {
			d = append(d, bson.E{Key: "ctx", Value: ctx})
		}
		return d
	}
	if body == nil {
		return "", bson.A{problem("missing", bson.A{"body"}, "Field required", nil, nil)}
	}
	object, ok := body.(bson.D)
	if !ok {
		return "", bson.A{problem("model_attributes_type", bson.A{"body"}, "Input should be a valid dictionary or object to extract fields from", body, nil)}
	}
	var problems bson.A
	used := "mapCode"
	value, present := pydoc.Get(object, used)
	if !present {
		used = "map_code"
		value, present = pydoc.Get(object, used)
	}
	code := ""
	switch s, isString := value.(string); {
	case !present:
		used = ""
		problems = append(problems, problem("missing", bson.A{"body", "mapCode"}, "Field required", object, nil))
	case !isString:
		problems = append(problems, problem("string_type", bson.A{"body", used}, "Input should be a valid string", value, nil))
	case s == "":
		problems = append(problems, problem("string_too_short", bson.A{"body", used}, "String should have at least 1 character", s, bson.D{{Key: "min_length", Value: int64(1)}}))
	case utf8.RuneCountInString(s) > chroniclesmap.MapCodeMaxLength:
		problems = append(problems, problem("string_too_long", bson.A{"body", used}, "String should have at most 256 characters", s, bson.D{{Key: "max_length", Value: int64(chroniclesmap.MapCodeMaxLength)}}))
	default:
		code = s
	}
	for _, e := range object {
		if e.Key != used {
			problems = append(problems, problem("extra_forbidden", bson.A{"body", e.Key}, "Extra inputs are not permitted", e.Value, nil))
		}
	}
	return code, problems
}

// decodeOrderedBody is decodeModelBody keeping the object's key order.
func decodeOrderedBody(w http.ResponseWriter, r *http.Request, raw []byte) (any, bool) {
	if _, ok := decodeModelBody(w, r, raw); !ok {
		return nil, false
	}
	if len(raw) == 0 {
		return nil, true
	}
	if !jsonContentType(r.Header.Get("Content-Type")) {
		return string(raw), true
	}
	body, err := pydoc.Decode(raw)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": []map[string]any{{"type": "json_invalid", "loc": []any{"body", 0}, "msg": "JSON decode error"}}})
		return nil, false
	}
	return body, true
}

func (h *ChroniclesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, ok := ChroniclesRoute(r)
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
	w.Header().Set("X-Chess-Chronicles-Native", "go")
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
	var body any
	if pattern == ChroniclesPreviewPattern {
		raw, status := readBody(w, r)
		if status != 0 {
			return
		}
		if body, ok = decodeOrderedBody(w, r, raw); !ok {
			return
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
	if pattern == ChroniclesPreviewPattern {
		code, problems := previewProblems(body)
		if problems != nil {
			writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: problems}})
			return
		}
		layout, err := chronicles.Preview(code)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
			return
		}
		writeDoc(w, http.StatusOK, layout)
		return
	}
	seed, problem := seedQuery(r, chroniclesmap.MapCodeMaxSeed)
	if problem != nil {
		writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: bson.A{problem}}})
		return
	}
	envelope, err := chronicles.AreaEnvelope(strings.TrimPrefix(r.URL.Path, chroniclesMapPrefix), seed, chronicles.AreaOptions{})
	switch {
	case errors.Is(err, chronicles.ErrMapNotFound):
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Mapa de Chronicles no encontrado."})
	case errors.Is(err, chronicles.ErrManifestInvalid):
		writeJSON(w, http.StatusInternalServerError, map[string]any{"detail": "El manifiesto de Chronicles no supera validación."})
	case err != nil:
		internalError(w)
	default:
		writeDoc(w, http.StatusOK, envelope)
	}
}

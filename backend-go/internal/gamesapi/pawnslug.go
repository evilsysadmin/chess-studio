package gamesapi

// Native Pawn Slug stage content, mirroring pawn_slug_api.py:
//
//	GET /api/pawn-slug/stages/{stage_id}?seed=  (default 120/minute)

import (
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pawnslug"
)

const (
	PawnSlugStagePrefix  = "/api/pawn-slug/stages/"
	PawnSlugStagePattern = "/api/pawn-slug/stages/{stage_id}"
)

// PawnSlugRoute reports whether a request is the native stage route.
func PawnSlugRoute(r *http.Request) (string, bool) {
	method := r.Method
	if method == http.MethodOptions {
		method = preflightMethod(r)
	}
	if method != http.MethodGet || !strings.HasPrefix(r.URL.Path, PawnSlugStagePrefix) {
		return "", false
	}
	id := strings.TrimPrefix(r.URL.Path, PawnSlugStagePrefix)
	if id == "" || strings.Contains(id, "/") {
		return "", false
	}
	return PawnSlugStagePattern, true
}

type PawnSlugHandler struct {
	base  *Handler
	limit *limiter
}

func NewPawnSlug(cfg Config) (*PawnSlugHandler, error) {
	cfg.Store = readOnlyStore{}
	base, err := New(cfg)
	if err != nil {
		return nil, err
	}
	return &PawnSlugHandler{base: base, limit: newLimiter(120, time.Minute)}, nil
}

// queryInt mirrors pydantic's lax str -> int for a query parameter: the
// surrounding whitespace, a sign, ASCII digits with single underscores and
// an all-zero fraction are accepted; nil when it is not an integer.
func queryInt(raw string) *big.Int {
	s := strings.TrimSpace(raw)
	sign := ""
	if s != "" && (s[0] == '+' || s[0] == '-') {
		if s[0] == '-' {
			sign = "-"
		}
		s = s[1:]
	}
	if whole, frac, hasDot := strings.Cut(s, "."); hasDot {
		if frac == "" || strings.Trim(frac, "0") != "" {
			return nil
		}
		s = whole
	}
	if s == "" || s[0] == '_' || s[len(s)-1] == '_' || strings.Contains(s, "__") {
		return nil
	}
	digits := strings.ReplaceAll(s, "_", "")
	for i := 0; i < len(digits); i++ {
		if digits[i] < '0' || digits[i] > '9' {
			return nil
		}
	}
	n, ok := new(big.Int).SetString(sign+digits, 10)
	if !ok {
		return nil
	}
	return n
}

// seedQuery is `seed: int = Query(default=0, ge=0, le=maxSeed)`: the
// value, or the pydantic error FastAPI answers as a 422.
func seedQuery(r *http.Request, maxSeed int64) (int64, bson.D) {
	values, present := r.URL.Query()["seed"]
	if !present || len(values) == 0 {
		return 0, nil
	}
	raw := values[len(values)-1]
	n := queryInt(raw)
	loc := bson.A{"query", "seed"}
	switch {
	case n == nil:
		return 0, bson.D{{Key: "type", Value: "int_parsing"}, {Key: "loc", Value: loc}, {Key: "msg", Value: "Input should be a valid integer, unable to parse string as an integer"}, {Key: "input", Value: raw}}
	case n.Sign() < 0:
		return 0, bson.D{{Key: "type", Value: "greater_than_equal"}, {Key: "loc", Value: loc}, {Key: "msg", Value: "Input should be greater than or equal to 0"}, {Key: "input", Value: raw}, {Key: "ctx", Value: bson.D{{Key: "ge", Value: int64(0)}}}}
	case n.Cmp(big.NewInt(maxSeed)) > 0:
		return 0, bson.D{{Key: "type", Value: "less_than_equal"}, {Key: "loc", Value: loc}, {Key: "msg", Value: fmt.Sprintf("Input should be less than or equal to %d", maxSeed)}, {Key: "input", Value: raw}, {Key: "ctx", Value: bson.D{{Key: "le", Value: maxSeed}}}}
	}
	return n.Int64(), nil
}

func (h *PawnSlugHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if _, ok := PawnSlugRoute(r); !ok {
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
	w.Header().Set("X-Chess-PawnSlug-Native", "go")
	if r.ContentLength > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}
	subject, version, tokenErr := b.verify(r)
	key := "user:" + subject
	if tokenErr != nil {
		key = "ip:" + b.clientIP(r)
	}
	if !h.limit.allow(key, b.now()) {
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
	seed, problem := seedQuery(r, pawnslug.MaxSeed)
	if problem != nil {
		writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: bson.A{problem}}})
		return
	}
	envelope, err := pawnslug.Envelope(strings.TrimPrefix(r.URL.Path, PawnSlugStagePrefix), seed)
	switch {
	case errors.Is(err, pawnslug.ErrNotFound):
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Stage de Pawn Slug no encontrado."})
	case err != nil:
		writeJSON(w, http.StatusInternalServerError, map[string]any{"detail": "El manifiesto de Pawn Slug no supera validación."})
	default:
		writeDoc(w, http.StatusOK, envelope)
	}
}

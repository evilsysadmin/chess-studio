package gamesapi

// Native analysis routes, mirroring game_api.py:
//
//	POST /api/analyze       analyze
//
// They authenticate a session OR a machine API key (main.get_user_or_m2m,
// X-API-Key in M2M_API_KEYS), rate-limit 60/min per user (API keys: 1000/min
// per key instead), and run as OPTIONAL engine work: when the pool is busy
// they answer 503 with Retry-After instead of queueing behind gameplay.

import (
	"context"
	"crypto/hmac"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamecore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gameops"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentpolicy"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
)

// AnalyzePattern is the FastAPI route of the position analysis.
const AnalyzePattern = "/api/analyze"

// mateScore mirrors chess_ai.MATE_SCORE.
const mateScore = 100000.0

// AnalyzeRoute reports whether a request is a native analysis route.
func AnalyzeRoute(r *http.Request) (pattern string, ok bool) {
	if r.URL.Path != AnalyzePattern {
		return "", false
	}
	if r.Method == http.MethodPost || r.Method == http.MethodOptions && preflightMethod(r) == http.MethodPost {
		return AnalyzePattern, true
	}
	return "", false
}

// Mover is get_cpu_move (residentmove.EngineMover).
type Mover interface {
	Move(ctx context.Context, positions []*chess.Position, level float64) (string, error)
}

// RootAnalyzer runs one factual root pass (residentsearch.AnalyzeDepth).
type RootAnalyzer interface {
	AnalyzeDepth(ctx context.Context, positions []*chess.Position, depth int, budget time.Duration) (residentsearch.Snapshot, error)
}

type AnalyzeConfig struct {
	Config
	Mover    Mover
	Analyzer RootAnalyzer
	Pool     *EnginePool
	// APIKeys mirrors M2M_API_KEYS.
	APIKeys []string
}

type AnalyzeHandler struct {
	base       *Handler
	mover      Mover
	analyzer   RootAnalyzer
	pool       *EnginePool
	keys       []string
	userLimit  *limiter
	keyLimiter *limiter
}

func NewAnalyze(cfg AnalyzeConfig) (*AnalyzeHandler, error) {
	if cfg.Mover == nil || cfg.Analyzer == nil {
		return nil, errors.New("analysis API needs an engine")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	pool := cfg.Pool
	if pool == nil {
		pool = NewEnginePool(1, 0)
	}
	var keys []string
	for _, key := range cfg.APIKeys {
		if key = strings.TrimSpace(key); key != "" {
			keys = append(keys, key)
		}
	}
	return &AnalyzeHandler{
		base: base, mover: cfg.Mover, analyzer: cfg.Analyzer, pool: pool, keys: keys,
		userLimit: newLimiter(60, time.Minute), keyLimiter: newLimiter(1000, time.Minute),
	}, nil
}

// apiKey mirrors main.get_api_key: the configured key matching X-API-Key in
// constant time, "" otherwise.
func (h *AnalyzeHandler) apiKey(r *http.Request) string {
	presented := r.Header.Get("X-API-Key")
	if presented == "" {
		return ""
	}
	for _, key := range h.keys {
		if hmac.Equal([]byte(presented), []byte(key)) {
			return key
		}
	}
	return ""
}

func (h *AnalyzeHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, ok := AnalyzeRoute(r)
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
	w.Header().Set("X-Chess-Games-Native", "go")

	if r.ContentLength > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBodyBytes+1))
	if err != nil || len(body) > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}

	// get_user_or_m2m: a valid API key is a machine actor, otherwise the
	// session must be valid (and touches presence like get_current_user).
	key := h.apiKey(r)
	actor := "m2m"
	if key == "" {
		subject, version, tokenErr := b.verify(r)
		username, status, detail := b.currentUser(r, subject, version, tokenErr)
		if status != 0 {
			writeJSON(w, status, map[string]any{"detail": detail})
			return
		}
		if b.presence != nil {
			b.presence.Touch(r, username)
		}
		actor = username
	}

	if pattern == AnalyzePattern {
		req, detail := parseAnalyze(body)
		if detail != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": detail})
			return
		}
		if !h.allow(w, key, actor, 60) {
			return
		}
		h.analyze(context.WithoutCancel(r.Context()), w, req)
	}
}

// allow applies the route limit: per user, or per API key when one is valid.
func (h *AnalyzeHandler) allow(w http.ResponseWriter, key, actor string, perMinute int) bool {
	if key != "" {
		if !h.keyLimiter.allow("key:"+key, h.base.now()) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 1000 per 1 minute"})
			return false
		}
		return true
	}
	if !h.userLimit.allow("user:"+actor, h.base.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: " + strconv.Itoa(perMinute) + " per 1 minute"})
		return false
	}
	return true
}

func engineBusy(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "1")
	writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "Análisis temporalmente ocupado. Reintenta en un instante."})
}

type analyzeRequest struct {
	FEN            string
	Level          float64
	CandidateLimit *int
}

// parseAnalyze mirrors AnalyzeRequest (fen <= 128, level lax float default
// HINT_STRENGTH, candidateLimit int 2..5 or null). The 422 detail keeps
// pydantic's type/loc/msg.
func parseAnalyze(body []byte) (analyzeRequest, []map[string]any) {
	req := analyzeRequest{Level: HintStrength}
	if len(strings.TrimSpace(string(body))) == 0 {
		return req, []map[string]any{{"type": "missing", "loc": []any{"body"}, "msg": "Field required"}}
	}
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return req, []map[string]any{{"type": "json_invalid", "loc": []any{"body", 0}, "msg": "JSON decode error"}}
	}
	fields, ok := raw.(map[string]any)
	if !ok {
		return req, []map[string]any{{"type": "model_attributes_type", "loc": []any{"body"}, "msg": "Input should be a valid dictionary or object to extract fields from"}}
	}
	var detail []map[string]any
	switch fen, present := fields["fen"]; {
	case !present:
		detail = append(detail, map[string]any{"type": "missing", "loc": []any{"body", "fen"}, "msg": "Field required"})
	default:
		if s, isString := fen.(string); !isString {
			detail = append(detail, map[string]any{"type": "string_type", "loc": []any{"body", "fen"}, "msg": "Input should be a valid string"})
		} else if len([]rune(s)) > 128 {
			detail = append(detail, map[string]any{"type": "string_too_long", "loc": []any{"body", "fen"}, "msg": "String should have at most 128 characters"})
		} else {
			req.FEN = s
		}
	}
	if level, present := fields["level"]; present {
		encoded, _ := json.Marshal(level)
		if value, err := gameops.LaxFloat(encoded); err != nil {
			detail = append(detail, map[string]any{"type": "float_parsing", "loc": []any{"body", "level"}, "msg": "Input should be a valid number"})
		} else {
			req.Level = value
		}
	}
	// populate_by_name: the alias wins, the field name is accepted too.
	limitKey := "candidateLimit"
	if _, present := fields[limitKey]; !present {
		limitKey = "candidate_limit"
	}
	if limit, present := fields[limitKey]; present && limit != nil {
		value, ok := laxInt(limit)
		switch {
		case !ok:
			detail = append(detail, map[string]any{"type": "int_parsing", "loc": []any{"body", limitKey}, "msg": "Input should be a valid integer"})
		case value < 2:
			detail = append(detail, map[string]any{"type": "greater_than_equal", "loc": []any{"body", limitKey}, "msg": "Input should be greater than or equal to 2"})
		case value > 5:
			detail = append(detail, map[string]any{"type": "less_than_equal", "loc": []any{"body", limitKey}, "msg": "Input should be less than or equal to 5"})
		default:
			req.CandidateLimit = &value
		}
	}
	return req, detail
}

// laxInt mirrors pydantic's lax int: integral numbers and numeric strings.
func laxInt(value any) (int, bool) {
	switch v := value.(type) {
	case float64:
		if v != math.Trunc(v) || math.IsInf(v, 0) {
			return 0, false
		}
		return int(v), true
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(v))
		return n, err == nil
	case bool:
		if v {
			return 1, true
		}
		return 0, true
	}
	return 0, false
}

func validLevel(level float64) bool { return !math.IsNaN(level) && level >= 0 && level <= 100 }

// analyze mirrors game_api.analyze.
func (h *AnalyzeHandler) analyze(ctx context.Context, w http.ResponseWriter, req analyzeRequest) {
	board, err := gamecore.BoardFromValidFEN(req.FEN)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "FEN inválido o posición imposible."})
		return
	}
	if board.IsGameOver() {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "Esa posición ya está terminada."})
		return
	}
	level := float64(HintStrength)
	if validLevel(req.Level) {
		level = req.Level
	}
	var uci string
	if err := h.pool.RunOptional(func() { uci, err = h.mover.Move(ctx, board.Positions(), level) }); err != nil {
		engineBusy(w)
		return
	}
	move, found := findMove(board, uci)
	if err != nil || !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "No hay jugadas disponibles."})
		return
	}
	suggestion := board.MoveDict(move)
	if req.CandidateLimit != nil && len(board.LegalMoves()) > 1 {
		var candidates []map[string]any
		if err := h.pool.RunOptional(func() { candidates = h.candidates(ctx, board, level, *req.CandidateLimit) }); err != nil {
			engineBusy(w)
			return
		}
		if len(candidates) > 0 {
			payload := copyMap(suggestion)
			list := make([]any, len(candidates))
			for i := range candidates {
				list[i] = candidates[i]
			}
			payload["candidates"] = list
			writeJSON(w, http.StatusOK, payload)
			return
		}
	}
	writeJSON(w, http.StatusOK, suggestion)
}

// candidates mirrors root_candidate_service.factual_candidate_payloads_for_level:
// a shallow, tightly budgeted single pass; a timeout means no shortlist.
func (h *AnalyzeHandler) candidates(ctx context.Context, board *gamecore.Board, level float64, limit int) []map[string]any {
	maxDepth, budget := residentpolicy.SearchSettings(level)
	depth := min(3, maxDepth)
	budget = math.Min(0.45, math.Max(0.12, budget*0.30))
	snapshot, err := h.analyzer.AnalyzeDepth(ctx, board.Positions(), depth, time.Duration(budget*float64(time.Second)))
	if err != nil {
		return nil
	}
	limit = min(limit, len(snapshot.Candidates))
	white := board.Turn() == "w"
	out := make([]map[string]any, 0, limit)
	for _, candidate := range snapshot.Candidates[:limit] {
		move, ok := findMove(board, candidate.UCI)
		if !ok {
			return nil
		}
		score := candidate.Score
		if !white {
			score = -score
		}
		payload := board.MoveDict(move)
		payload["moveKey"] = candidate.UCI
		payload["chessScoreCp"] = score
		payload["isLegal"] = true
		payload["isMate"] = score >= mateScore-1000
		out = append(out, payload)
	}
	return out
}

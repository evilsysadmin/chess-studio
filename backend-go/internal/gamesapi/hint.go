package gamesapi

// Native hint route of games against the CPU, mirroring game_api.py:
//
//	GET /api/games/{game_id}/hint  hint
//
// The payload is hint_analysis_service.build_hint_payload at HINT_STRENGTH:
// the best move with the reply and line the same bounded search proved
// (residentsearch.PrincipalVariation), or the forced move when only one is
// legal.

import (
	"context"
	"errors"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	chess "github.com/corentings/chess/v2"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamecore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residenteval"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentpolicy"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
)

// HintPattern is the FastAPI route of the hint (telemetry http.route).
const HintPattern = "/api/games/{game_id}/hint"

// HintStrength mirrors game_api.HINT_STRENGTH.
const HintStrength = 95

// HintRoute reports whether a request is the native hint route.
func HintRoute(r *http.Request) (pattern, gameID string, ok bool) {
	rest, found := strings.CutPrefix(r.URL.Path, "/api/games/")
	if !found {
		return "", "", false
	}
	rawID, isHint := strings.CutSuffix(rest, "/hint")
	if !isHint || rawID == "" || strings.Contains(rawID, "/") {
		return "", "", false
	}
	switch r.Method {
	case http.MethodGet:
	case http.MethodOptions:
		if preflightMethod(r) != http.MethodGet {
			return "", "", false
		}
	default:
		return "", "", false
	}
	id, err := url.PathUnescape(rawID)
	if err != nil {
		return "", "", false
	}
	return HintPattern, id, true
}

// HintStore is the part of gamestore the hint needs.
type HintStore interface {
	GetDocumentForOwner(ctx context.Context, id, owner string) (bson.M, bool, error)
}

// Engine proves the line (residentsearch.Searcher.PrincipalVariation).
type Engine interface {
	PrincipalVariation(ctx context.Context, positions []*chess.Position, maxDepth int, budget time.Duration) (*residentsearch.PrincipalVariation, error)
}

type HintConfig struct {
	Config
	Store         HintStore
	Engine        Engine
	EngineWorkers int
}

type HintHandler struct {
	base    *Handler
	store   HintStore
	engine  Engine
	engines chan struct{}
}

func NewHint(cfg HintConfig) (*HintHandler, error) {
	if cfg.Store == nil || cfg.Engine == nil {
		return nil, errors.New("games hint API needs a store and an engine")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	workers := max(1, min(cfg.EngineWorkers, 4))
	return &HintHandler{base: base, store: cfg.Store, engine: cfg.Engine, engines: make(chan struct{}, workers)}, nil
}

func (h *HintHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	_, gameID, ok := HintRoute(r)
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

	subject, version, tokenErr := b.verify(r)
	key := "user:" + subject
	if tokenErr != nil {
		key = "ip:" + b.clientIP(r)
	}
	if !b.limiter.allow(key, b.now()) {
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
	doc, found, err := h.store.GetDocumentForOwner(ctx, gameID, username)
	if err != nil {
		storageUnavailable(w)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida no encontrada."})
		return
	}
	raw := plain(doc).(map[string]any)
	if raw["owner"] == nil {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "Partida antigua sin propietario. Inicia una partida nueva."})
		return
	}
	l := loaded{raw: raw}
	board, ok := l.board(w)
	if !ok {
		return
	}
	if board.IsGameOver() {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "La partida ya terminó."})
		return
	}
	if board.Turn() != l.entry.HumanColor {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "No es tu turno."})
		return
	}
	h.engines <- struct{}{}
	payload := h.hintPayload(ctx, board)
	<-h.engines
	if payload == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "No hay jugadas disponibles."})
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

// hintPayload mirrors build_hint_payload(board, HINT_STRENGTH).
func (h *HintHandler) hintPayload(ctx context.Context, board *gamecore.Board) map[string]any {
	legal := board.LegalMoves()
	if len(legal) == 0 {
		return nil
	}
	if len(legal) == 1 {
		move := board.MoveDict(legal[0])
		payload := copyMap(move)
		payload["forced"] = true
		payload["reply"] = nil
		payload["line"] = []any{move}
		payload["analysisDepth"] = 0
		payload["candidateCount"] = 1
		return payload
	}
	depth, budget := residentpolicy.SearchSettings(HintStrength)
	pv, err := h.engine.PrincipalVariation(ctx, board.Positions(), depth, time.Duration(budget*float64(time.Second)))
	if err == nil && pv != nil {
		if line := serializeLine(board, pv.Moves); len(line) > 0 {
			payload := copyMap(line[0])
			payload["reply"] = nil
			if len(line) > 1 {
				payload["reply"] = line[1]
			}
			lineAny := make([]any, len(line))
			for i := range line {
				lineAny[i] = line[i]
			}
			payload["line"] = lineAny
			payload["analysisDepth"] = pv.Depth
			payload["candidateCount"] = pv.CandidateCount
			return payload
		}
	}
	// Python falls back to get_cpu_move(board, 95) when not even a depth-1
	// pass fits the budget; at that level it is the static one-ply best move.
	return board.MoveDict(staticBest(board, legal))
}

// serializeLine mirrors hint_analysis_service._serialize_line: the line as
// move dicts, cut at the first move that is not legal where it is played.
func serializeLine(board *gamecore.Board, moves []string) []map[string]any {
	probe := board.Copy()
	line := make([]map[string]any, 0, len(moves))
	for _, uci := range moves {
		move, ok := findMove(probe, uci)
		if !ok {
			break
		}
		line = append(line, probe.MoveDict(move))
		probe.Push(move)
	}
	return line
}

func findMove(board *gamecore.Board, uci string) (chess.Move, bool) {
	for _, move := range board.LegalMoves() {
		if move.String() == uci {
			return move, true
		}
	}
	return chess.Move{}, false
}

// staticBest mirrors chess_ai._static_best_move: the legal move whose
// resulting position evaluates best for the side to move.
func staticBest(board *gamecore.Board, legal []chess.Move) chess.Move {
	pos := board.Position()
	maximizing := pos.Turn() == chess.White
	best := legal[0]
	bestScore := math.Inf(-1)
	if !maximizing {
		bestScore = math.Inf(1)
	}
	for i := range legal {
		score := residenteval.EvaluatePosition(pos.Update(&legal[i]))
		if (maximizing && score > bestScore) || (!maximizing && score < bestScore) {
			best, bestScore = legal[i], score
		}
	}
	return best
}

func copyMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in)+6)
	for k, v := range in {
		out[k] = v
	}
	return out
}

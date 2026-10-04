package gamesapi

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"time"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamecore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gameops"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentpolicy"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
)

// analyzeMoveLevel is AnalyzeMoveRequest's default level.
const analyzeMoveLevel = 45.0

// factualMaxDepth is analyze_move_payload's cap on the factual comparison.
const factualMaxDepth = 6

type analyzeMoveRequest struct {
	FEN       string
	From      *string
	To        *string
	Promotion *string
	Level     float64
}

// parseAnalyzeMove mirrors AnalyzeMoveRequest: fen <= 128, from (alias of
// from_square) and to of exactly 2 characters, promotion <= 1, all optional
// strings, level lax float default 45.
func parseAnalyzeMove(body []byte) (analyzeMoveRequest, []map[string]any) {
	req := analyzeMoveRequest{Level: analyzeMoveLevel}
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
	if fen, present := fields["fen"]; !present {
		detail = append(detail, map[string]any{"type": "missing", "loc": []any{"body", "fen"}, "msg": "Field required"})
	} else if s, isString := fen.(string); !isString {
		detail = append(detail, map[string]any{"type": "string_type", "loc": []any{"body", "fen"}, "msg": "Input should be a valid string"})
	} else if len([]rune(s)) > 128 {
		detail = append(detail, map[string]any{"type": "string_too_long", "loc": []any{"body", "fen"}, "msg": "String should have at most 128 characters"})
	} else {
		req.FEN = s
	}
	fromKey := "from"
	if _, present := fields[fromKey]; !present {
		fromKey = "from_square"
	}
	for _, field := range []struct {
		key      string
		min, max int
		dst      **string
	}{
		{fromKey, 2, 2, &req.From},
		{"to", 2, 2, &req.To},
		{"promotion", 0, 1, &req.Promotion},
	} {
		value, present := fields[field.key]
		if !present || value == nil {
			continue
		}
		s, isString := value.(string)
		n := len([]rune(s))
		switch {
		case !isString:
			detail = append(detail, map[string]any{"type": "string_type", "loc": []any{"body", field.key}, "msg": "Input should be a valid string"})
		case n < field.min:
			detail = append(detail, map[string]any{"type": "string_too_short", "loc": []any{"body", field.key}, "msg": "String should have at least " + plural(field.min)})
		case n > field.max:
			detail = append(detail, map[string]any{"type": "string_too_long", "loc": []any{"body", field.key}, "msg": "String should have at most " + plural(field.max)})
		default:
			*field.dst = &s
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
	return req, detail
}

func plural(n int) string {
	if n == 1 {
		return "1 character"
	}
	return string(rune('0'+n)) + " characters"
}

// analyzeMove mirrors game_api.analyze_move_endpoint (without the sampled
// background shadow check, disabled by default in Python).
func (h *AnalyzeHandler) analyzeMove(ctx context.Context, w http.ResponseWriter, req analyzeMoveRequest) {
	board, err := gamecore.BoardFromValidFEN(req.FEN)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "FEN inválido o posición imposible."})
		return
	}
	if board.IsGameOver() {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "Esa posición ya está terminada."})
		return
	}
	level := analyzeMoveLevel
	if validLevel(req.Level) {
		level = req.Level
	}
	var payload map[string]any
	if err := h.pool.RunOptional(func() { payload = h.moveAnalysisPayload(ctx, board, req, level) }); err != nil {
		engineBusy(w)
		return
	}
	if payload == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "No hay jugadas disponibles."})
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

// moveAnalysisPayload mirrors move_analysis_service.analyze_move_payload: the
// factual comparison for a legal played move, else (or when not even depth 1
// fits the budget) the deterministic engine move with static evaluations.
func (h *AnalyzeHandler) moveAnalysisPayload(ctx context.Context, board *gamecore.Board, req analyzeMoveRequest, level float64) map[string]any {
	var played *chess.Move
	if req.From != nil && *req.From != "" && req.To != nil && *req.To != "" {
		if move, ok := board.ResolveMove(*req.From, *req.To, req.Promotion); ok {
			played = &move
		}
	}
	maxDepth, budgetSeconds := residentpolicy.SearchSettings(level)
	budget := time.Duration(budgetSeconds * float64(time.Second))
	if played != nil {
		if payload, ok := FactualMoveAnalysis(ctx, h.analyzer, board, *played, min(factualMaxDepth, maxDepth), budget); ok {
			return payload
		}
	}

	// chess_ai.analyze_move: _search without randomness or noise.
	uci, score, err := h.analyzer.Classic(ctx, board.Positions(), maxDepth, budget)
	if err != nil {
		return nil
	}
	move, found := findMove(board, uci)
	if !found {
		legal := residentsearch.LegalInPythonOrder(board.Position())
		if len(legal) == 0 {
			return nil
		}
		move, score = legal[0], residentsearch.EvaluateStatic(board.Position())
	}
	var evalAfterPlayed any
	if played != nil {
		evalAfterPlayed = sanitizeEval(residentsearch.EvaluateStatic(board.Position().Update(played)))
	}
	suggested := board.MoveDict(move)
	delete(suggested, "captured")
	return map[string]any{
		"suggested":          suggested,
		"evalAfterSuggested": sanitizeEval(score),
		"evalAfterPlayed":    evalAfterPlayed,
	}
}

// FactualMoveAnalysis mirrors engine_analysis.build_factual_move_analysis plus
// the payload fixes of analyze_move_payload: the deepest COMPLETE root pass
// (iterative, up to maxDepth, inside budget) compares the played move with the
// best one on one scale. ok is false when not even depth 1 completes.
func FactualMoveAnalysis(
	ctx context.Context,
	analyzer RootAnalyzer,
	board *gamecore.Board,
	played chess.Move,
	maxDepth int,
	budget time.Duration,
) (map[string]any, bool) {
	positions := board.Positions()
	deadline := time.Now().Add(max(0, budget))
	var completed *residentsearch.Snapshot
	for depth := 1; depth <= maxDepth; depth++ {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}
		snapshot, err := analyzer.AnalyzeDepth(ctx, positions, depth, remaining)
		if err != nil {
			break
		}
		completed = &snapshot
	}
	if completed == nil || len(completed.Candidates) == 0 {
		return nil, false
	}
	ranked := completed.Candidates
	best := ranked[0]
	var playedCandidate *residentsearch.Candidate
	for i := range ranked {
		if ranked[i].UCI == played.String() {
			playedCandidate = &ranked[i]
			break
		}
	}
	if playedCandidate == nil {
		return nil, false
	}
	maximizing := board.Turn() == "w"
	rawLoss := playedCandidate.Score - best.Score
	if maximizing {
		rawLoss = best.Score - playedCandidate.Score
	}
	var secondBest, evalSecond, gap any
	if len(ranked) > 1 {
		second := ranked[1]
		move, _ := findMove(board, second.UCI)
		secondBest = board.MoveDict(move)
		evalSecond = sanitizeEval(second.Score)
		if best.Score == second.Score {
			gap = 0.0
		} else {
			rawGap := second.Score - best.Score
			if maximizing {
				rawGap = best.Score - second.Score
			}
			gap = sanitizeEval(pyMax0(rawGap))
		}
	}
	bestMove, _ := findMove(board, best.UCI)
	suggestedEval := sanitizeEval(best.Score)
	return map[string]any{
		"suggested":                 board.MoveDict(bestMove),
		"played":                    board.MoveDict(played),
		"suggestedReply":            replyDict(board, bestMove, best.Reply),
		"playedReply":               replyDict(board, played, playedCandidate.Reply),
		"suggestedLine":             lineDicts(board, best),
		"playedLine":                lineDicts(board, *playedCandidate),
		"evalAfterSuggested":        suggestedEval,
		"factualEvalAfterSuggested": suggestedEval,
		"factualEvalAfterPlayed":    sanitizeEval(playedCandidate.Score),
		// The legacy field keeps its static one-ply semantics.
		"evalAfterPlayed":     sanitizeEval(residentsearch.EvaluateStatic(board.Position().Update(&played))),
		"loss":                sanitizeEval(pyMax0(rawLoss)),
		"analysisDepth":       completed.Depth,
		"candidateCount":      completed.CandidateCount,
		"secondBest":          secondBest,
		"evalAfterSecondBest": evalSecond,
		"bestToSecondGap":     gap,
	}, true
}

func replyDict(board *gamecore.Board, root chess.Move, reply string) any {
	if reply == "" {
		return nil
	}
	child := board.Copy()
	child.Push(root)
	move, ok := findMove(child, reply)
	if !ok {
		return nil
	}
	return child.MoveDict(move)
}

func lineDicts(board *gamecore.Board, candidate residentsearch.Candidate) []any {
	moves := candidate.PV
	if len(moves) == 0 {
		moves = []string{candidate.UCI}
	}
	line := serializeLine(board, moves)
	out := make([]any, len(line))
	for i := range line {
		out[i] = line[i]
	}
	return out
}

// pyMax0 is Python's max(0.0, x): NaN (inf - inf) is not greater, so 0.
func pyMax0(x float64) float64 {
	if x > 0 {
		return x
	}
	return 0
}

// sanitizeEval mirrors move_analysis_service.sanitize_eval: JSON-safe scores
// that keep decisive mates (±100000).
func sanitizeEval(score float64) float64 {
	switch {
	case math.IsInf(score, 1):
		return mateScore
	case math.IsInf(score, -1):
		return -mateScore
	case math.IsNaN(score):
		return 0
	}
	return score
}

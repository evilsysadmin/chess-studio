package residentsearch

import (
	"context"
	"errors"
	"math"
	"time"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/residenteval"
)

// Classic mirrors chess_ai._search: the engine's own iterative deepening
// behind get_cpu_move and analyze_move. Unlike AnalyzeGame (engine_analysis'
// factual root pass), it keeps one transposition table across depths, tries
// the previous depth's best move first, narrows the root window as it goes,
// and starts from the static one-ply best move, which it keeps if not even
// depth 1 completes. The last COMPLETE depth wins; a depth cut by the clock is
// discarded whole.
func (s *Searcher) Classic(
	ctx context.Context,
	positions []*chess.Position,
	maxDepth int,
	budget time.Duration,
) (best string, score float64, err error) {
	if s == nil || s.now == nil {
		s = New()
	}
	if len(positions) == 0 || positions[len(positions)-1] == nil {
		return "", 0, errors.New("game has no position")
	}
	pos := positions[len(positions)-1]
	path := newSearchPath(pos, positions[:len(positions)-1])
	inCheck := kingInCheck(pos)
	legal := pythonGenerationOrder(pos, pos.ValidMovesUnsafe(), inCheck)
	if len(legal) == 0 {
		return "", 0, nil
	}
	deadline := s.now().Add(budget)
	tt := make(map[ttKey]ttEntry, 4096)
	bestMove, bestScore := staticBestMove(pos, legal, path)
	best, score = bestMove.String(), bestScore

	preferred := ""
	for depth := 1; depth <= maxDepth; depth++ {
		if err := s.checkDeadline(ctx, deadline); err != nil {
			if errors.Is(err, ErrTimeout) {
				break
			}
			return "", 0, err
		}
		move, value, err := s.rootSearch(ctx, pos, depth, deadline, tt, path, preferred, inCheck)
		if err != nil {
			if errors.Is(err, ErrTimeout) {
				break
			}
			return "", 0, err
		}
		if move != "" {
			best, score, preferred = move, value, move
		}
	}
	return best, score, nil
}

// rootSearch mirrors chess_ai._root_search.
func (s *Searcher) rootSearch(
	ctx context.Context,
	pos *chess.Position,
	depth int,
	deadline time.Time,
	tt map[ttKey]ttEntry,
	path *searchPath,
	preferred string,
	inCheck bool,
) (string, float64, error) {
	moves := orderMoves(pos, pos.ValidMovesUnsafe(), preferred, inCheck)
	if len(moves) == 0 {
		return "", 0, nil
	}
	maximizing := pos.Turn() == chess.White
	best := ""
	bestScore := math.Inf(1)
	if maximizing {
		bestScore = math.Inf(-1)
	}
	alpha, beta := math.Inf(-1), math.Inf(1)
	for i := range moves {
		if err := s.checkDeadline(ctx, deadline); err != nil {
			return "", 0, err
		}
		move := moves[i]
		child := pos.Update(&move)
		incrementPath(path, child.ZobristHash())
		score, _, err := s.minimax(ctx, child, depth-1, alpha, beta, 1, deadline, tt, path, move.HasTag(chess.Check))
		decrementPath(path, child.ZobristHash())
		if err != nil {
			return "", 0, err
		}
		if (maximizing && score > bestScore) || (!maximizing && score < bestScore) {
			best, bestScore = move.String(), score
		}
		if maximizing {
			alpha = math.Max(alpha, bestScore)
		} else {
			beta = math.Min(beta, bestScore)
		}
	}
	return best, bestScore, nil
}

// StaticBest mirrors chess_ai._static_best_move for a game's positions: the
// legal move (in python-chess order) whose resulting position evaluates best
// for the side to move, with evaluate_board's terminal and draw rules.
func StaticBest(positions []*chess.Position) (string, float64, bool) {
	if len(positions) == 0 || positions[len(positions)-1] == nil {
		return "", 0, false
	}
	pos := positions[len(positions)-1]
	legal := pythonGenerationOrder(pos, pos.ValidMovesUnsafe(), kingInCheck(pos))
	if len(legal) == 0 {
		return "", 0, false
	}
	move, score := staticBestMove(pos, legal, newSearchPath(pos, positions[:len(positions)-1]))
	return move.String(), score, true
}

func staticBestMove(pos *chess.Position, legal []chess.Move, path *searchPath) (chess.Move, float64) {
	maximizing := pos.Turn() == chess.White
	best := legal[0]
	bestScore := math.Inf(1)
	if maximizing {
		bestScore = math.Inf(-1)
	}
	for i := range legal {
		child := pos.Update(&legal[i])
		incrementPath(path, child.ZobristHash())
		score := evaluateBoard(child, path, 1)
		decrementPath(path, child.ZobristHash())
		if (maximizing && score > bestScore) || (!maximizing && score < bestScore) {
			best, bestScore = legal[i], score
		}
	}
	return best, bestScore
}

// evaluateBoard mirrors chess_ai.evaluate_board without terminal_checked:
// checkmate is infinite, materialised draws are 0, otherwise the static
// evaluation. ply counts the plies played since the path's root.
func evaluateBoard(pos *chess.Position, path *searchPath, ply int) float64 {
	switch pos.Status() {
	case chess.Checkmate:
		if pos.Turn() == chess.White {
			return math.Inf(-1)
		}
		return math.Inf(1)
	case chess.Stalemate:
		return 0
	}
	count := path.counts[pos.ZobristHash()]
	if count >= 5 || pos.HalfMoveClock() >= 150 || insufficientMaterial(pos.Board()) {
		return 0
	}
	if pos.HalfMoveClock() >= 100 && len(pos.ValidMovesUnsafe()) > 0 {
		return 0
	}
	if path.offset+ply >= 8 && count >= 3 {
		return 0
	}
	return residenteval.EvaluatePosition(pos)
}

package residentsearch

import (
	"context"
	"errors"
	"math"
	"sort"
	"strings"
	"time"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chessrules"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residenteval"
)

const (
	mateScore = 100000.0
	qDepth    = 3
)

var ErrTimeout = errors.New("resident search timeout")

type Candidate struct {
	UCI   string
	Score float64
	// Reply is the best immediate answer the child search returned (depth 2+).
	Reply string
	// PV is the proven line starting with UCI: the reply, then only EXACT
	// transposition entries deep enough (engine_analysis
	// _principal_variation_from_tt). Never extended by an extra search.
	PV []string
}

type Snapshot struct {
	Candidates     []Candidate
	Depth          int
	CandidateCount int
}

type Searcher struct {
	now func() time.Time
}

func New() *Searcher {
	return &Searcher{now: time.Now}
}

func (s *Searcher) AnalyzeFEN(
	ctx context.Context,
	fen string,
	maxDepth int,
	budget time.Duration,
) (Snapshot, error) {
	if maxDepth < 1 {
		return Snapshot{}, errors.New("max depth must be at least 1")
	}
	option, err := chess.FEN(strings.TrimSpace(fen))
	if err != nil {
		return Snapshot{}, err
	}
	game := chess.NewGame(option)
	return s.analyzeIterative(ctx, game.Position(), nil, maxDepth, budget)
}

// AnalyzeGame searches the last position of a game whose earlier positions
// (oldest first, the root last) still count for repetitions, as python-chess
// does when the search runs on a board carrying the game's move stack.
func (s *Searcher) AnalyzeGame(
	ctx context.Context,
	positions []*chess.Position,
	maxDepth int,
	budget time.Duration,
) (Snapshot, error) {
	if maxDepth < 1 {
		return Snapshot{}, errors.New("max depth must be at least 1")
	}
	if len(positions) == 0 || positions[len(positions)-1] == nil {
		return Snapshot{}, errors.New("game has no position")
	}
	return s.analyzeIterative(ctx, positions[len(positions)-1], positions[:len(positions)-1], maxDepth, budget)
}

// searchPath counts how often each position occurs on the line from the
// game's start to the node being searched; offset is how many game plies
// precede the search root.
type searchPath struct {
	counts map[uint64]int
	offset int
}

func newSearchPath(root *chess.Position, history []*chess.Position) *searchPath {
	path := &searchPath{counts: make(map[uint64]int, len(history)+16), offset: len(history)}
	for _, pos := range history {
		if pos != nil {
			path.counts[pos.ZobristHash()]++
		}
	}
	path.counts[root.ZobristHash()]++
	return path
}

type ttFlag uint8

const (
	ttExact ttFlag = iota
	ttLower
	ttUpper
)

type ttKey struct {
	hash     uint64
	halfmove int
	ply      int
}

type ttEntry struct {
	depth int
	score float64
	flag  ttFlag
	move  string
}

func (s *Searcher) analyzeIterative(
	ctx context.Context,
	pos *chess.Position,
	history []*chess.Position,
	maxDepth int,
	budget time.Duration,
) (Snapshot, error) {
	if s == nil || s.now == nil {
		s = New()
	}
	if budget < 0 {
		budget = 0
	}
	deadline := s.now().Add(budget)
	var completed *Snapshot

	for depth := 1; depth <= maxDepth; depth++ {
		if err := s.checkDeadline(ctx, deadline); err != nil {
			if errors.Is(err, ErrTimeout) {
				break
			}
			return Snapshot{}, err
		}
		candidates, err := s.analyzeRootCandidates(ctx, pos, history, depth, deadline)
		if err != nil {
			if errors.Is(err, ErrTimeout) {
				break
			}
			return Snapshot{}, err
		}
		rankCandidates(pos.Turn(), candidates)
		current := Snapshot{
			Candidates:     candidates,
			Depth:          depth,
			CandidateCount: len(candidates),
		}
		completed = &current
		if len(candidates) == 0 {
			return current, nil
		}
	}

	if completed == nil {
		return Snapshot{}, ErrTimeout
	}
	return *completed, nil
}

func (s *Searcher) analyzeRootCandidates(
	ctx context.Context,
	pos *chess.Position,
	history []*chess.Position,
	depth int,
	deadline time.Time,
) ([]Candidate, error) {
	moves := orderMoves(pos, pos.ValidMovesUnsafe(), "", kingInCheck(pos))
	if len(moves) == 0 {
		return []Candidate{}, nil
	}

	tt := make(map[ttKey]ttEntry, 1024)
	path := newSearchPath(pos, history)
	candidates := make([]Candidate, 0, len(moves))

	for i := range moves {
		if err := s.checkDeadline(ctx, deadline); err != nil {
			return nil, err
		}
		move := moves[i]
		child := pos.Update(&move)
		incrementPath(path, child.ZobristHash())
		score, reply, err := s.minimax(
			ctx,
			child,
			max(0, depth-1),
			math.Inf(-1),
			math.Inf(1),
			1,
			deadline,
			tt,
			path,
			move.HasTag(chess.Check),
		)
		decrementPath(path, child.ZobristHash())
		if err != nil {
			return nil, err
		}
		candidates = append(candidates, Candidate{
			UCI:   move.String(),
			Score: score,
			Reply: reply,
			PV:    principalVariationFromTT(child, move.String(), reply, depth, tt),
		})
	}
	return candidates, nil
}

func (s *Searcher) minimax(
	ctx context.Context,
	pos *chess.Position,
	depth int,
	alpha float64,
	beta float64,
	ply int,
	deadline time.Time,
	tt map[ttKey]ttEntry,
	path *searchPath,
	inCheck bool,
) (float64, string, error) {
	if err := s.checkDeadline(ctx, deadline); err != nil {
		return 0, "", err
	}
	if score, terminal := terminalScore(pos, ply, path); terminal {
		return score, "", nil
	}

	key := ttKey{
		hash:     pos.ZobristHash(),
		halfmove: pos.HalfMoveClock(),
		ply:      ply,
	}
	alphaOrig, betaOrig := alpha, beta
	if cached, ok := tt[key]; ok && cached.depth >= depth {
		switch cached.flag {
		case ttExact:
			return cached.score, cached.move, nil
		case ttLower:
			if cached.score > alpha {
				alpha = cached.score
			}
		case ttUpper:
			if cached.score < beta {
				beta = cached.score
			}
		}
		if alpha >= beta {
			return cached.score, cached.move, nil
		}
	}

	if depth == 0 {
		score, err := s.quiescence(ctx, pos, alpha, beta, ply, deadline, qDepth, path, inCheck)
		return score, "", err
	}

	preferred := ""
	if cached, ok := tt[key]; ok {
		preferred = cached.move
	}
	moves := orderMoves(pos, pos.ValidMovesUnsafe(), preferred, inCheck)
	if len(moves) == 0 {
		return residenteval.EvaluatePosition(pos), "", nil
	}

	maximizing := pos.Turn() == chess.White
	bestScore := math.Inf(1)
	if maximizing {
		bestScore = math.Inf(-1)
	}
	bestMove := ""

	for i := range moves {
		move := moves[i]
		child := pos.Update(&move)
		incrementPath(path, child.ZobristHash())
		score, _, err := s.minimax(
			ctx,
			child,
			depth-1,
			alpha,
			beta,
			ply+1,
			deadline,
			tt,
			path,
			move.HasTag(chess.Check),
		)
		decrementPath(path, child.ZobristHash())
		if err != nil {
			return 0, "", err
		}

		if maximizing {
			if score > bestScore {
				bestScore = score
				bestMove = move.String()
			}
			if bestScore > alpha {
				alpha = bestScore
			}
		} else {
			if score < bestScore {
				bestScore = score
				bestMove = move.String()
			}
			if bestScore < beta {
				beta = bestScore
			}
		}
		if alpha >= beta {
			break
		}
	}

	flag := ttExact
	if bestScore <= alphaOrig {
		flag = ttUpper
	} else if bestScore >= betaOrig {
		flag = ttLower
	}
	tt[key] = ttEntry{depth: depth, score: bestScore, flag: flag, move: bestMove}
	return bestScore, bestMove, nil
}

func (s *Searcher) quiescence(
	ctx context.Context,
	pos *chess.Position,
	alpha float64,
	beta float64,
	ply int,
	deadline time.Time,
	depth int,
	path *searchPath,
	inCheck bool,
) (float64, error) {
	if err := s.checkDeadline(ctx, deadline); err != nil {
		return 0, err
	}
	if score, terminal := terminalScore(pos, ply, path); terminal {
		return score, nil
	}

	standPat := residenteval.EvaluatePosition(pos)
	if !inCheck {
		if pos.Turn() == chess.White {
			if standPat >= beta {
				return standPat, nil
			}
			if standPat > alpha {
				alpha = standPat
			}
		} else {
			if standPat <= alpha {
				return standPat, nil
			}
			if standPat < beta {
				beta = standPat
			}
		}
	}

	if depth == 0 && !inCheck {
		return standPat, nil
	}

	moves := pos.ValidMovesUnsafe()
	if !inCheck {
		tactical := make([]chess.Move, 0, len(moves))
		for i := range moves {
			move := moves[i]
			if chessrules.IsCapture(&move) || move.Promo() != chess.NoPieceType {
				tactical = append(tactical, move)
			}
		}
		moves = tactical
	}
	ordered := orderMoves(pos, moves, "", inCheck)
	if len(ordered) == 0 {
		return standPat, nil
	}

	maximizing := pos.Turn() == chess.White
	if depth == 0 {
		best := math.Inf(1)
		if maximizing {
			best = math.Inf(-1)
		}
		for i := range ordered {
			if err := s.checkDeadline(ctx, deadline); err != nil {
				return 0, err
			}
			move := ordered[i]
			child := pos.Update(&move)
			incrementPath(path, child.ZobristHash())
			score, terminal := terminalScore(child, ply+1, path)
			if !terminal {
				score = residenteval.EvaluatePosition(child)
			}
			decrementPath(path, child.ZobristHash())
			if maximizing {
				if score > best {
					best = score
				}
			} else if score < best {
				best = score
			}
		}
		return best, nil
	}

	best := standPat
	if inCheck {
		if maximizing {
			best = math.Inf(-1)
		} else {
			best = math.Inf(1)
		}
	}

	for i := range ordered {
		if err := s.checkDeadline(ctx, deadline); err != nil {
			return 0, err
		}
		move := ordered[i]
		child := pos.Update(&move)
		incrementPath(path, child.ZobristHash())
		score, err := s.quiescence(
			ctx,
			child,
			alpha,
			beta,
			ply+1,
			deadline,
			depth-1,
			path,
			move.HasTag(chess.Check),
		)
		decrementPath(path, child.ZobristHash())
		if err != nil {
			return 0, err
		}

		if maximizing {
			if score > best {
				best = score
			}
			if best > alpha {
				alpha = best
			}
		} else {
			if score < best {
				best = score
			}
			if best < beta {
				beta = best
			}
		}
		if alpha >= beta {
			break
		}
	}
	return best, nil
}

func terminalScore(pos *chess.Position, ply int, path *searchPath) (float64, bool) {
	switch pos.Status() {
	case chess.Checkmate:
		if pos.Turn() == chess.White {
			return -mateScore + float64(ply), true
		}
		return mateScore - float64(ply), true
	case chess.Stalemate:
		return 0, true
	}

	count := path.counts[pos.ZobristHash()]
	if count >= 5 {
		return 0, true
	}
	// python-chess: len(board.move_stack) >= 8 and board.is_repetition(3),
	// where the stack holds the game's own moves before the search's.
	if path.offset+ply >= 8 && count >= 3 {
		return 0, true
	}
	if pos.HalfMoveClock() >= 150 {
		return 0, true
	}
	if insufficientMaterial(pos.Board()) {
		return 0, true
	}
	if pos.HalfMoveClock() >= 100 && len(pos.ValidMovesUnsafe()) > 0 {
		return 0, true
	}
	return 0, false
}

func insufficientMaterial(board *chess.Board) bool {
	if board == nil {
		return false
	}
	pieces := board.SquareMap()
	kings := 0
	bishops := 0
	knights := 0
	bishopColor := -1
	allBishopsSameColor := true

	for square, piece := range pieces {
		switch piece.Type() {
		case chess.Queen, chess.Rook, chess.Pawn:
			return false
		case chess.King:
			kings++
		case chess.Bishop:
			bishops++
			color := (int(square.File()) + int(square.Rank())) & 1
			if bishopColor == -1 {
				bishopColor = color
			} else if color != bishopColor {
				allBishopsSameColor = false
			}
		case chess.Knight:
			knights++
		}
	}
	if kings < 2 {
		return false
	}
	if bishops == 0 && knights == 0 {
		return true
	}
	if bishops == 1 && knights == 0 {
		return true
	}
	if bishops == 0 && knights == 1 {
		return true
	}
	return knights == 0 && bishops > 0 && allBishopsSameColor
}

func orderMoves(pos *chess.Position, source []chess.Move, preferred string, inCheck bool) []chess.Move {
	moves := pythonGenerationOrder(pos, source, inCheck)
	sort.SliceStable(moves, func(i, j int) bool {
		return moveOrderScore(pos, &moves[i], preferred) > moveOrderScore(pos, &moves[j], preferred)
	})
	return moves
}

func moveOrderScore(pos *chess.Position, move *chess.Move, preferred string) int {
	if preferred != "" && move.String() == preferred {
		return 1000000
	}
	score := 0
	if chessrules.IsCapture(move) {
		victimValue := 0
		if move.HasTag(chess.EnPassant) {
			victimValue = pieceValue(chess.Pawn)
		} else {
			victimValue = pieceValue(pos.Board().Piece(move.S2()).Type())
		}
		attackerValue := pieceValue(pos.Board().Piece(move.S1()).Type())
		if attackerValue == 0 {
			attackerValue = 1
		}
		score += 100000 + (victimValue * 10) - attackerValue
	}
	if move.Promo() != chess.NoPieceType {
		score += 80000 + pieceValue(move.Promo())
	}
	if move.HasTag(chess.Check) {
		score += 50000
	}
	return score
}

func pieceValue(piece chess.PieceType) int {
	switch piece {
	case chess.Pawn:
		return 100
	case chess.Knight:
		return 320
	case chess.Bishop:
		return 330
	case chess.Rook:
		return 500
	case chess.Queen:
		return 900
	default:
		return 0
	}
}

func rankCandidates(turn chess.Color, candidates []Candidate) {
	sort.SliceStable(candidates, func(i, j int) bool {
		if turn == chess.White {
			return candidates[i].Score > candidates[j].Score
		}
		return candidates[i].Score < candidates[j].Score
	})
}

func incrementPath(path *searchPath, hash uint64) {
	path.counts[hash]++
}

func decrementPath(path *searchPath, hash uint64) {
	path.counts[hash]--
	if path.counts[hash] <= 0 {
		delete(path.counts, hash)
	}
}

func (s *Searcher) checkDeadline(ctx context.Context, deadline time.Time) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if !s.now().Before(deadline) {
		return ErrTimeout
	}
	return nil
}

func max(left, right int) int {
	if left > right {
		return left
	}
	return right
}

// principalVariationFromTT mirrors engine_analysis._principal_variation_from_tt
// from the child position the root move led to.
func principalVariationFromTT(child *chess.Position, rootUCI, reply string, depth int, tt map[ttKey]ttEntry) []string {
	line := []string{rootUCI}
	if depth <= 1 || reply == "" {
		return line
	}
	probe, ok := playUCI(child, reply)
	if !ok {
		return line
	}
	line = append(line, reply)
	ply := 2
	for remaining := depth - 2; remaining > 0; remaining-- {
		entry, found := tt[ttKey{hash: probe.ZobristHash(), halfmove: probe.HalfMoveClock(), ply: ply}]
		if !found || entry.flag != ttExact || entry.depth < remaining || entry.move == "" {
			break
		}
		next, ok := playUCI(probe, entry.move)
		if !ok {
			break
		}
		line = append(line, entry.move)
		probe = next
		ply++
	}
	return line
}

func playUCI(pos *chess.Position, uci string) (*chess.Position, bool) {
	for _, move := range pos.ValidMovesUnsafe() {
		if move.String() == uci {
			return pos.Update(&move), true
		}
	}
	return nil, false
}

// PrincipalVariation mirrors engine_analysis.principal_variation: the best
// proven line from the deepest complete iterative pass, nil for a terminal
// position.
type PrincipalVariation struct {
	Moves          []string
	Score          float64
	Depth          int
	CandidateCount int
}

func (s *Searcher) PrincipalVariation(
	ctx context.Context,
	positions []*chess.Position,
	maxDepth int,
	budget time.Duration,
) (*PrincipalVariation, error) {
	snapshot, err := s.AnalyzeGame(ctx, positions, maxDepth, budget)
	if err != nil {
		return nil, err
	}
	if len(snapshot.Candidates) == 0 {
		return nil, nil
	}
	best := snapshot.Candidates[0]
	moves := best.PV
	if len(moves) == 0 {
		moves = []string{best.UCI}
	}
	return &PrincipalVariation{
		Moves:          append([]string(nil), moves...),
		Score:          best.Score,
		Depth:          snapshot.Depth,
		CandidateCount: snapshot.CandidateCount,
	}, nil
}

// pythonGenerationOrder puts legal moves in the order python-chess's
// generate_legal_moves yields them, so the stable move ordering breaks ties
// (equal scores, which root move wins, which reply the transposition table
// keeps) exactly as Python does. Squares count a1=0 .. h8=63 in both.
//
// Outside check: piece moves by origin then target (both descending), then
// castling (rook square descending), pawn captures (origin, target
// descending; promotions q, r, b, n), single pushes and double pushes (target
// descending), en passant. In check (_generate_evasions): king moves first by
// target descending, then the same order for the other pieces.
func pythonGenerationOrder(pos *chess.Position, source []chess.Move, inCheck bool) []chess.Move {
	board := pos.Board()
	type keyed struct {
		move chess.Move
		key  int64
	}
	rows := make([]keyed, len(source))
	for i := range source {
		rows[i] = keyed{move: source[i], key: pythonOrderKey(board, source[i], inCheck)}
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].key < rows[j].key })
	moves := make([]chess.Move, len(rows))
	for i := range rows {
		moves[i] = rows[i].move
	}
	return moves
}

func pythonOrderKey(board *chess.Board, move chess.Move, inCheck bool) int64 {
	from, to := int64(move.S1()), int64(move.S2())
	piece := board.Piece(move.S1()).Type()
	promo := int64(0)
	switch move.Promo() {
	case chess.Rook:
		promo = 1
	case chess.Bishop:
		promo = 2
	case chess.Knight:
		promo = 3
	}
	var category int64
	switch {
	case inCheck && piece == chess.King:
		category = 0
	case move.HasTag(chess.KingSideCastle) || move.HasTag(chess.QueenSideCastle):
		category = 2
		// rook square descending: the king side rook sits on the higher square
		if move.HasTag(chess.KingSideCastle) {
			return category<<20 | 0
		}
		return category<<20 | 1
	case piece != chess.Pawn:
		category = 1
	case move.HasTag(chess.EnPassant):
		category = 6
	case chessrules.IsCapture(&move):
		category = 3
	case abs64(to-from) == 16:
		category = 5
		return category<<20 | (63-to)<<6
	default:
		category = 4
		return category<<20 | (63-to)<<6 | promo
	}
	return category<<20 | (63-from)<<12 | (63-to)<<6 | promo
}

func abs64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

// kingInCheck reports whether the side to move is in check.
func kingInCheck(pos *chess.Position) bool {
	board := pos.Board()
	var king chess.Square
	found := false
	for square, piece := range board.SquareMap() {
		if piece.Type() == chess.King && piece.Color() == pos.Turn() {
			king, found = square, true
			break
		}
	}
	if !found {
		return false
	}
	for square, piece := range board.SquareMap() {
		if piece.Color() == pos.Turn() {
			continue
		}
		for _, target := range board.AttacksFrom(square) {
			if target == king {
				return true
			}
		}
	}
	return false
}

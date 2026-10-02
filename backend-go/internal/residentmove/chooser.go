package residentmove

import (
	"context"
	"errors"
	"math"
	rand "math/rand/v2"
	"strings"
	"time"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentpolicy"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
)

const mateGuardThreshold = 99000.0

var (
	ErrUnknownResident = errors.New("unknown resident")
	ErrNoLegalMove      = errors.New("no legal move")
)

type searcher interface {
	AnalyzeFEN(context.Context, string, int, time.Duration) (residentsearch.Snapshot, error)
}

type Chooser struct {
	search searcher
	rand   func() float64
}

func New() *Chooser {
	return &Chooser{
		search: residentsearch.New(),
		rand:   rand.Float64,
	}
}

func NewWith(search searcher, random func() float64) *Chooser {
	if random == nil {
		random = rand.Float64
	}
	return &Chooser{search: search, rand: random}
}

// Move implements the same narrow contract as the temporary Python resident
// oracle: given an authoritative FEN plus a known resident identity, return one
// legal UCI move. It performs no match-state I/O.
func (c *Chooser) Move(ctx context.Context, fen, resident string) (string, error) {
	level, ok := residentLevel(resident)
	if !ok {
		return "", ErrUnknownResident
	}
	return c.chooseLevel(ctx, strings.TrimSpace(fen), float64(level))
}

func residentLevel(username string) (int, bool) {
	switch strings.ToLower(strings.TrimSpace(username)) {
	case "otto_falk":
		return 20, true
	case "marta_stein":
		return 45, true
	case "viktor_kraus":
		return 70, true
	default:
		return 0, false
	}
}

func (c *Chooser) chooseLevel(ctx context.Context, fen string, level float64) (string, error) {
	option, err := chess.FEN(fen)
	if err != nil {
		return "", err
	}
	game := chess.NewGame(option)
	pos := game.Position()
	legal := append([]chess.Move(nil), pos.ValidMovesUnsafe()...)
	if len(legal) == 0 {
		return "", ErrNoLegalMove
	}
	if len(legal) == 1 {
		return legal[0].String(), nil
	}
	if c == nil || c.search == nil {
		c = New()
	}

	band := residentpolicy.Band(level)
	complexity := positionComplexity(pos)
	snapshot, err := c.search.AnalyzeFEN(
		ctx,
		fen,
		band.MaxDepth,
		seconds(band.BudgetSeconds),
	)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return "", ctxErr
		}
		if !errors.Is(err, residentsearch.ErrTimeout) {
			return "", err
		}
		return c.deterministicFallback(ctx, fen, level, legal)
	}
	if len(snapshot.Candidates) == 0 {
		return "", ErrNoLegalMove
	}

	best := snapshot.Candidates[0]
	if math.Abs(best.Score) >= mateGuardThreshold {
		return best.UCI, nil
	}

	maximizing := pos.Turn() == chess.White
	alternatives := eligibleAlternatives(
		snapshot,
		maximizing,
		band,
		complexity,
	)
	if len(alternatives) == 0 ||
		c.random() >= residentpolicy.EffectiveMistakeChance(band, complexity) {
		return best.UCI, nil
	}

	scores := make([]float64, len(alternatives))
	for i := range alternatives {
		scores[i] = alternatives[i].Score
	}
	weights := residentpolicy.ImperfectCandidateWeights(
		best.Score,
		scores,
		maximizing,
		band,
		complexity,
	)
	return alternatives[weightedIndex(weights, c.random())].UCI, nil
}

func (c *Chooser) deterministicFallback(
	ctx context.Context,
	fen string,
	level float64,
	legal []chess.Move,
) (string, error) {
	fallbackLevel := level
	if fallbackLevel > 35 {
		fallbackLevel = 35
	}
	maxDepth, budgetSeconds := residentpolicy.SearchSettings(fallbackLevel)
	snapshot, err := c.search.AnalyzeFEN(ctx, fen, maxDepth, seconds(budgetSeconds))
	if err == nil && len(snapshot.Candidates) > 0 {
		return snapshot.Candidates[0].UCI, nil
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		return "", ctxErr
	}
	// Python's deterministic fallback eventually uses the first generated legal
	// move when its factual search cannot produce a principal move. Preserve the
	// same non-random safety property here.
	if len(legal) > 0 {
		return legal[0].String(), nil
	}
	return "", ErrNoLegalMove
}

func eligibleAlternatives(
	snapshot residentsearch.Snapshot,
	maximizing bool,
	band residentpolicy.DifficultyBand,
	complexity float64,
) []residentsearch.Candidate {
	if len(snapshot.Candidates) < 2 {
		return nil
	}
	best := snapshot.Candidates[0]
	cap := residentpolicy.EffectiveLossCap(band, complexity)
	limit := band.CandidateLimit - 1
	if limit < 0 {
		limit = 0
	}
	result := make([]residentsearch.Candidate, 0, limit)
	for _, candidate := range snapshot.Candidates[1:] {
		if residentpolicy.LossFromBest(best.Score, candidate.Score, maximizing) <= cap {
			result = append(result, candidate)
		}
		if len(result) >= limit {
			break
		}
	}
	return result
}

func weightedIndex(weights []float64, random float64) int {
	if len(weights) <= 1 {
		return 0
	}
	total := 0.0
	for _, weight := range weights {
		if weight > 0 {
			total += weight
		}
	}
	if total <= 0 {
		return 0
	}
	if random < 0 {
		random = 0
	}
	if random >= 1 {
		random = math.Nextafter(1, 0)
	}
	target := random * total
	running := 0.0
	for index, weight := range weights {
		if weight > 0 {
			running += weight
		}
		if target < running {
			return index
		}
	}
	return len(weights) - 1
}

func positionComplexity(pos *chess.Position) float64 {
	if pos == nil {
		return 0
	}
	legal := pos.ValidMovesUnsafe()
	if len(legal) == 0 {
		return 0
	}
	captures := 0
	checks := 0
	for i := range legal {
		if legal[i].HasTag(chess.Capture) {
			captures++
		}
		if legal[i].HasTag(chess.Check) {
			checks++
		}
	}
	forcing := float64(captures) + (float64(checks) * 1.5)
	branching := clamp((float64(len(legal))-18)/24, 0, 1)
	forcingRatio := math.Min(1, forcing/math.Max(4, float64(len(legal))*0.35))
	inCheck := 0.0
	if sideToMoveInCheck(pos) {
		inCheck = 1
	}
	return math.Min(1, (branching*0.45)+(forcingRatio*0.40)+(inCheck*0.15))
}

func sideToMoveInCheck(pos *chess.Position) bool {
	if pos == nil || pos.Board() == nil {
		return false
	}
	board := pos.Board()
	var king chess.Square
	foundKing := false
	for square, piece := range board.SquareMap() {
		if piece.Type() == chess.King && piece.Color() == pos.Turn() {
			king = square
			foundKing = true
			break
		}
	}
	if !foundKing {
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

func seconds(value float64) time.Duration {
	if value <= 0 {
		return 0
	}
	return time.Duration(value * float64(time.Second))
}

func clamp(value, low, high float64) float64 {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}

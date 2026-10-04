package residentmove

import (
	"context"
	"math"
	rand "math/rand/v2"
	"time"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentpolicy"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
)

type classicSearcher interface {
	Classic(context.Context, []*chess.Position, int, time.Duration) (string, float64, error)
	StaticScores([]*chess.Position, time.Duration) []residentsearch.ScoredMove
}

// EngineMover mirrors chess_ai.get_cpu_move: the classic engine move for a
// 0-100 level, with pure randomness below level 40 and a near-best static
// alternative below level 45. It is what /api/analyze suggests.
type EngineMover struct {
	search classicSearcher
	rand   func() float64
}

func NewEngineMover() *EngineMover {
	return &EngineMover{search: residentsearch.New(), rand: rand.Float64}
}

func NewEngineMoverWith(search classicSearcher, random func() float64) *EngineMover {
	if random == nil {
		random = rand.Float64
	}
	return &EngineMover{search: search, rand: random}
}

// Move returns one legal UCI move, or "" when the position has none.
func (e *EngineMover) Move(ctx context.Context, positions []*chess.Position, level float64) (string, error) {
	if len(positions) == 0 || positions[len(positions)-1] == nil {
		return "", ErrNoLegalMove
	}
	pos := positions[len(positions)-1]
	legal := residentsearch.LegalInPythonOrder(pos)
	if len(legal) == 0 {
		return "", nil
	}
	if len(legal) == 1 {
		return legal[0].String(), nil
	}
	if e.rand() < residentpolicy.Randomness(level) {
		return legal[pick(e.rand(), len(legal))].String(), nil
	}
	depth, budget := residentpolicy.SearchSettings(level)
	best, _, err := e.search.Classic(ctx, positions, depth, seconds(budget))
	if err != nil {
		return "", err
	}
	if best == "" {
		best = legal[pick(e.rand(), len(legal))].String()
	}
	noise := residentpolicy.Noise(level)
	if noise > 0 {
		scored := e.search.StaticScores(positions, seconds(math.Min(budget*0.15, 0.15)))
		if len(scored) > 0 {
			white := pos.Turn() == chess.White
			edge := scored[0].Score
			for _, s := range scored {
				if (white && s.Score > edge) || (!white && s.Score < edge) {
					edge = s.Score
				}
			}
			var near []string
			for _, s := range scored {
				if (white && s.Score >= edge-noise) || (!white && s.Score <= edge+noise) {
					near = append(near, s.UCI)
				}
			}
			if len(near) > 0 && e.rand() < 0.35*(noise/90) {
				best = near[pick(e.rand(), len(near))]
			}
		}
	}
	return best, nil
}

func pick(random float64, n int) int {
	index := int(random * float64(n))
	return min(max(index, 0), n-1)
}

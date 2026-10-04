package residentmove

import (
	"context"
	"testing"
	"time"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
)

type fakeClassic struct {
	best   string
	scored []residentsearch.ScoredMove
	depth  int
	budget time.Duration
}

func (f *fakeClassic) Classic(_ context.Context, _ []*chess.Position, depth int, budget time.Duration) (string, float64, error) {
	f.depth, f.budget = depth, budget
	return f.best, 0, nil
}

func (f *fakeClassic) StaticScores([]*chess.Position, time.Duration) []residentsearch.ScoredMove {
	return f.scored
}

func start() []*chess.Position { return []*chess.Position{chess.NewGame().Position()} }

func TestEngineMoveAtStrongLevelsIsTheClassicSearch(t *testing.T) {
	search := &fakeClassic{best: "e2e4"}
	move, err := NewEngineMoverWith(search, randomSequence(0)).Move(context.Background(), start(), 95)
	if err != nil || move != "e2e4" || search.depth != 5 {
		t.Fatalf("move=%q err=%v depth=%d", move, err, search.depth)
	}
}

func TestEngineMoveLowLevelsCanPlayAnyLegalMove(t *testing.T) {
	// Level 10: randomness 0.48*(30/40)^1.7 ~ 0.29; a 0.1 roll plays random.
	search := &fakeClassic{best: "e2e4"}
	move, err := NewEngineMoverWith(search, randomSequence(0.1, 0.0)).Move(context.Background(), start(), 10)
	// python-chess generates the knight on g1 first: g1h3.
	if err != nil || move != "g1h3" || search.depth != 0 {
		t.Fatalf("move=%q err=%v", move, err)
	}
}

func TestEngineMoveNoiseChoosesANearStaticAlternative(t *testing.T) {
	// Level 42: no randomness, noise 110*(3/45)^1.4 ~ 2.5 cp.
	search := &fakeClassic{best: "e2e4", scored: []residentsearch.ScoredMove{
		{UCI: "d2d4", Score: 40}, {UCI: "e2e4", Score: 39}, {UCI: "a2a3", Score: 0},
	}}
	move, _ := NewEngineMoverWith(search, randomSequence(0.99, 0.0, 0.0)).Move(context.Background(), start(), 42)
	if move != "d2d4" {
		t.Fatalf("noise pick=%q", move)
	}
	move, _ = NewEngineMoverWith(search, randomSequence(0.99, 0.99)).Move(context.Background(), start(), 42)
	if move != "e2e4" {
		t.Fatalf("kept=%q", move)
	}
}

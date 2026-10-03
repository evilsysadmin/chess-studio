package residenteval

import (
	"errors"
	"math"
	"testing"
)

func TestEvaluateFENInitialPositionIsSymmetric(t *testing.T) {
	got, err := EvaluateFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	if got != 0 {
		t.Fatalf("score=%v want=0", got)
	}
}

func TestEvaluateFENCheckmateMatchesPythonInfinitySign(t *testing.T) {
	got, err := EvaluateFEN("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3")
	if err != nil {
		t.Fatal(err)
	}
	if !math.IsInf(got, -1) {
		t.Fatalf("score=%v want=-Inf", got)
	}
}

func TestEvaluateFENInsufficientMaterialIsDraw(t *testing.T) {
	got, err := EvaluateFEN("8/8/8/8/8/k7/8/K6N w - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	if got != 0 {
		t.Fatalf("score=%v want=0", got)
	}
}

func TestEvaluateFENImmediateFiftyMoveDrawIsZero(t *testing.T) {
	got, err := EvaluateFEN("4k2r/8/8/8/8/8/8/R3K3 w Qk - 100 50")
	if err != nil {
		t.Fatal(err)
	}
	if got != 0 {
		t.Fatalf("score=%v want=0", got)
	}
}

func TestEndgameEvaluationPrefersActiveKingLikePython(t *testing.T) {
	active, err := EvaluateFEN("7k/7p/8/8/3K4/8/P7/8 w - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	passive, err := EvaluateFEN("7k/7p/8/8/8/8/P7/K7 w - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	if active <= passive {
		t.Fatalf("active=%v passive=%v", active, passive)
	}
}

func TestMaterialAndCenterScoresAreDeterministic(t *testing.T) {
	queen, err := EvaluateFEN("4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	if queen != 900 {
		t.Fatalf("queen score=%v want=900", queen)
	}
	centered, err := EvaluateFEN("4k3/8/8/8/3Q4/8/8/4K3 w - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	if centered != 914 {
		t.Fatalf("centered queen score=%v want=914", centered)
	}
}

func TestEvaluationIsColorSymmetricForBareQueen(t *testing.T) {
	white, err := EvaluateFEN("4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	black, err := EvaluateFEN("4k3/4q3/8/8/8/8/8/4K3 w - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	if white != -black {
		t.Fatalf("white=%v black=%v", white, black)
	}
}

func TestEvaluateFENRejectsInvalidInput(t *testing.T) {
	if _, err := EvaluateFEN("not a fen"); !errors.Is(err, ErrInvalidFEN) {
		t.Fatalf("err=%v", err)
	}
}

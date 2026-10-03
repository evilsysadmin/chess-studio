package residentsearch

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/residenteval"
)

func TestAnalyzeFENPrefersMateOverImmediateStalemate(t *testing.T) {
	const fen = "7k/5K2/8/6Q1/8/8/8/8 w - - 0 1"
	searcher := New()
	snapshot, err := searcher.AnalyzeFEN(
		context.Background(),
		fen,
		1,
		2*time.Second,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Candidates) == 0 {
		t.Fatal("expected legal candidates")
	}
	if snapshot.Candidates[0].Score < mateScore-2 {
		t.Fatalf("mate score=%v", snapshot.Candidates[0].Score)
	}

	option, err := chess.FEN(fen)
	if err != nil {
		t.Fatal(err)
	}
	pos := chess.NewGame(option).Position()
	found := false
	for _, candidate := range pos.ValidMovesUnsafe() {
		move := candidate
		if move.String() != snapshot.Candidates[0].UCI {
			continue
		}
		found = true
		child := pos.Update(&move)
		if child.Status() != chess.Checkmate {
			t.Fatalf("best=%s score=%v is not checkmate", snapshot.Candidates[0].UCI, snapshot.Candidates[0].Score)
		}
		if child.Status() == chess.Stalemate {
			t.Fatalf("best=%s chose stalemate instead of mate", snapshot.Candidates[0].UCI)
		}
		break
	}
	if !found {
		t.Fatalf("best move %s is not legal in fixture", snapshot.Candidates[0].UCI)
	}
}

func TestAnalyzeFENPawnTakesHangingQueen(t *testing.T) {
	searcher := New()
	snapshot, err := searcher.AnalyzeFEN(
		context.Background(),
		"4k3/8/8/4q3/3P4/8/8/4K3 w - - 0 1",
		1,
		2*time.Second,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Candidates) == 0 {
		t.Fatal("expected legal candidates")
	}
	if got := snapshot.Candidates[0].UCI; got != "d4e5" {
		t.Fatalf("best=%s score=%v want=d4e5 candidates=%#v", got, snapshot.Candidates[0].Score, snapshot.Candidates[:min(5, len(snapshot.Candidates))])
	}
}

func TestAnalyzeFENTerminalRootReturnsEmptyCompleteSnapshot(t *testing.T) {
	searcher := New()
	snapshot, err := searcher.AnalyzeFEN(
		context.Background(),
		"rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
		3,
		time.Second,
	)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Depth != 1 || snapshot.CandidateCount != 0 || len(snapshot.Candidates) != 0 {
		t.Fatalf("snapshot=%#v", snapshot)
	}
}

func TestAnalyzeFENZeroBudgetIsAtomicTimeout(t *testing.T) {
	searcher := New()
	_, err := searcher.AnalyzeFEN(
		context.Background(),
		"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		4,
		0,
	)
	if !errors.Is(err, ErrTimeout) {
		t.Fatalf("err=%v want=%v", err, ErrTimeout)
	}
}

func TestAnalyzeFENHonorsCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	searcher := New()
	_, err := searcher.AnalyzeFEN(
		ctx,
		"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		1,
		time.Second,
	)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err=%v want=context.Canceled", err)
	}
}

func TestQuiescenceNeverStandPatsWhileInCheck(t *testing.T) {
	option, err := chess.FEN("7k/8/8/8/8/8/7r/7K w - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	pos := chess.NewGame(option).Position()
	standPat := residenteval.EvaluatePosition(pos)
	if standPat >= 0 {
		t.Fatalf("fixture stand-pat=%v expected losing white position", standPat)
	}

	searcher := New()
	path := map[uint64]int{pos.ZobristHash(): 1}
	score, err := searcher.quiescence(
		context.Background(),
		pos,
		math.Inf(-1),
		math.Inf(1),
		0,
		time.Now().Add(time.Second),
		1,
		path,
		true,
	)
	if err != nil {
		t.Fatal(err)
	}
	if score == standPat {
		t.Fatalf("quiescence illegally used stand-pat=%v while in check", score)
	}
	if score != 0 {
		t.Fatalf("score=%v want=0 after Kxh2 draw line", score)
	}
}

func TestInsufficientMaterialMatchesLibraryContract(t *testing.T) {
	tests := map[string]bool{
		"8/2k5/8/8/8/3K4/8/8 w - - 1 1":     true,
		"8/2k5/8/8/8/3K1N2/8/8 w - - 1 1":   true,
		"8/2k5/8/8/8/3K1B2/8/8 w - - 1 1":   true,
		"8/2k5/2b5/8/8/3K1B2/8/8 w - - 1 1": true,
		"8/2k5/8/8/8/3K1B2/4N3/8 w - - 1 1": false,
		"8/2k5/8/8/4P3/3K4/8/8 w - - 1 1":   false,
	}
	for fen, want := range tests {
		option, err := chess.FEN(fen)
		if err != nil {
			t.Fatal(err)
		}
		got := insufficientMaterial(chess.NewGame(option).Position().Board())
		if got != want {
			t.Fatalf("fen=%s got=%t want=%t", fen, got, want)
		}
	}
}

func TestInitialRootPassScoresEveryLegalMove(t *testing.T) {
	searcher := New()
	snapshot, err := searcher.AnalyzeFEN(
		context.Background(),
		"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		1,
		2*time.Second,
	)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Depth != 1 || snapshot.CandidateCount != 20 || len(snapshot.Candidates) != 20 {
		t.Fatalf("snapshot depth/count=%d/%d len=%d", snapshot.Depth, snapshot.CandidateCount, len(snapshot.Candidates))
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

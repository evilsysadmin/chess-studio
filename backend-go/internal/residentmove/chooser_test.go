package residentmove

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentpolicy"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
)

type searchCall struct {
	fen      string
	maxDepth int
	budget   time.Duration
}

type scriptedSearcher struct {
	snapshots []residentsearch.Snapshot
	errors    []error
	calls     []searchCall
}

func (s *scriptedSearcher) AnalyzeFEN(
	_ context.Context,
	fen string,
	maxDepth int,
	budget time.Duration,
) (residentsearch.Snapshot, error) {
	s.calls = append(s.calls, searchCall{fen: fen, maxDepth: maxDepth, budget: budget})
	index := len(s.calls) - 1
	var snapshot residentsearch.Snapshot
	var err error
	if index < len(s.snapshots) {
		snapshot = s.snapshots[index]
	}
	if index < len(s.errors) {
		err = s.errors[index]
	}
	return snapshot, err
}

func randomSequence(values ...float64) func() float64 {
	index := 0
	return func() float64 {
		if len(values) == 0 {
			return 0
		}
		if index >= len(values) {
			return values[len(values)-1]
		}
		value := values[index]
		index++
		return value
	}
}

func startFEN() string {
	return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
}

func TestResidentLevelsMatchPythonProfiles(t *testing.T) {
	for username, want := range map[string]int{
		"otto_falk":      20,
		"MARTA_STEIN":    45,
		" viktor_kraus ": 70,
	} {
		got, ok := residentLevel(username)
		if !ok || got != want {
			t.Fatalf("%q level=%d ok=%t want=%d", username, got, ok, want)
		}
	}
	if _, ok := residentLevel("matthias"); ok {
		t.Fatal("unknown resident accepted")
	}
}

func TestChooserRejectsUnknownResident(t *testing.T) {
	chooser := NewWith(&scriptedSearcher{}, randomSequence(0))
	if _, err := chooser.Move(context.Background(), startFEN(), "matthias"); !errors.Is(err, ErrUnknownResident) {
		t.Fatalf("err=%v", err)
	}
}

func TestChooserReturnsNoMoveForTerminalPosition(t *testing.T) {
	chooser := NewWith(&scriptedSearcher{}, randomSequence(0))
	_, err := chooser.Move(
		context.Background(),
		"7k/6Q1/6K1/8/8/8/8/8 b - - 0 1",
		"otto_falk",
	)
	if !errors.Is(err, ErrNoLegalMove) {
		t.Fatalf("err=%v", err)
	}
}

func TestChooserProtectsForcedMateFromHumanMistakePolicy(t *testing.T) {
	search := &scriptedSearcher{snapshots: []residentsearch.Snapshot{{
		Candidates: []residentsearch.Candidate{
			{UCI: "f7g7", Score: 99999},
			{UCI: "f7f8", Score: 99900},
		},
		Depth: 3,
	}}}
	chooser := NewWith(search, randomSequence(0, 0))
	got, err := chooser.Move(context.Background(), startFEN(), "otto_falk")
	if err != nil {
		t.Fatal(err)
	}
	if got != "f7g7" {
		t.Fatalf("move=%q want forced mate", got)
	}
	if len(search.calls) != 1 {
		t.Fatalf("search calls=%d", len(search.calls))
	}
}

func TestChooserKeepsBestMoveWhenMistakeRollMisses(t *testing.T) {
	search := &scriptedSearcher{snapshots: []residentsearch.Snapshot{{
		Candidates: []residentsearch.Candidate{
			{UCI: "e2e4", Score: 100},
			{UCI: "d2d4", Score: 80},
			{UCI: "g1f3", Score: 60},
		},
		Depth: 3,
	}}}
	chooser := NewWith(search, randomSequence(0.999))
	got, err := chooser.Move(context.Background(), startFEN(), "marta_stein")
	if err != nil {
		t.Fatal(err)
	}
	if got != "e2e4" {
		t.Fatalf("move=%q want best", got)
	}
}

func TestChooserCanSelectBoundedHumanAlternative(t *testing.T) {
	search := &scriptedSearcher{snapshots: []residentsearch.Snapshot{{
		Candidates: []residentsearch.Candidate{
			{UCI: "e2e4", Score: 100},
			{UCI: "d2d4", Score: 90},
			{UCI: "g1f3", Score: -1000},
		},
		Depth: 3,
	}}}
	// First roll enters the mistake branch, second roll chooses the first
	// weighted alternative. The catastrophic candidate is outside Otto's loss cap.
	chooser := NewWith(search, randomSequence(0, 0))
	got, err := chooser.Move(context.Background(), startFEN(), "otto_falk")
	if err != nil {
		t.Fatal(err)
	}
	if got != "d2d4" {
		t.Fatalf("move=%q want bounded alternative", got)
	}
}

func TestChooserTimeoutUsesDeterministicLowerLevelFallback(t *testing.T) {
	search := &scriptedSearcher{
		snapshots: []residentsearch.Snapshot{
			{},
			{Candidates: []residentsearch.Candidate{{UCI: "d2d4", Score: 40}}, Depth: 3},
		},
		errors: []error{residentsearch.ErrTimeout, nil},
	}
	chooser := NewWith(search, randomSequence(0))
	got, err := chooser.Move(context.Background(), startFEN(), "viktor_kraus")
	if err != nil {
		t.Fatal(err)
	}
	if got != "d2d4" {
		t.Fatalf("move=%q", got)
	}
	if len(search.calls) != 2 {
		t.Fatalf("calls=%#v", search.calls)
	}
	primary := residentpolicy.Band(70)
	if search.calls[0].maxDepth != primary.MaxDepth ||
		search.calls[0].budget != seconds(primary.BudgetSeconds) {
		t.Fatalf("primary=%#v band=%#v", search.calls[0], primary)
	}
	fallbackDepth, fallbackSeconds := residentpolicy.SearchSettings(35)
	if search.calls[1].maxDepth != fallbackDepth ||
		search.calls[1].budget != seconds(fallbackSeconds) {
		t.Fatalf("fallback=%#v want depth=%d budget=%s", search.calls[1], fallbackDepth, seconds(fallbackSeconds))
	}
}

func TestChooserDoubleTimeoutFallsBackToFirstGeneratedLegalMove(t *testing.T) {
	search := &scriptedSearcher{
		errors: []error{residentsearch.ErrTimeout, residentsearch.ErrTimeout},
	}
	option, err := chess.FEN(startFEN())
	if err != nil {
		t.Fatal(err)
	}
	pos := chess.NewGame(option).Position()
	want := pos.ValidMovesUnsafe()[0].String()

	chooser := NewWith(search, randomSequence(0))
	got, err := chooser.Move(context.Background(), startFEN(), "otto_falk")
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("move=%q want=%q", got, want)
	}
}

func TestChooserDoesNotHideCancelledContextBehindFallback(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	search := &scriptedSearcher{errors: []error{residentsearch.ErrTimeout}}
	chooser := NewWith(search, randomSequence(0))
	if _, err := chooser.Move(ctx, startFEN(), "otto_falk"); !errors.Is(err, context.Canceled) {
		t.Fatalf("err=%v", err)
	}
	if len(search.calls) != 1 {
		t.Fatalf("calls=%d want=1", len(search.calls))
	}
}

func TestEligibleAlternativesHonorsLossCapAndCandidateLimit(t *testing.T) {
	band := residentpolicy.DifficultyBand{
		MaxLossCP:      100,
		CandidateLimit: 3,
	}
	snapshot := residentsearch.Snapshot{Candidates: []residentsearch.Candidate{
		{UCI: "a2a3", Score: 100},
		{UCI: "b2b3", Score: 80},
		{UCI: "c2c3", Score: 20},
		{UCI: "d2d3", Score: -200},
	}}
	got := eligibleAlternatives(snapshot, true, band, 0)
	if len(got) != 2 || got[0].UCI != "b2b3" || got[1].UCI != "c2c3" {
		t.Fatalf("alternatives=%#v", got)
	}
}

func TestWeightedIndexUsesCumulativeWeights(t *testing.T) {
	weights := []float64{1, 3, 6}
	for draw, want := range map[float64]int{
		0:    0,
		0.09: 0,
		0.10: 1,
		0.39: 1,
		0.40: 2,
		0.99: 2,
	} {
		if got := weightedIndex(weights, draw); got != want {
			t.Fatalf("draw=%f got=%d want=%d", draw, got, want)
		}
	}
}

func TestPositionComplexityMatchesPythonFormulaAtStart(t *testing.T) {
	option, err := chess.FEN(startFEN())
	if err != nil {
		t.Fatal(err)
	}
	pos := chess.NewGame(option).Position()
	got := positionComplexity(pos)
	// 20 legal moves, no captures/checks, not in check:
	// ((20-18)/24) * 0.45 = 0.0375.
	if math.Abs(got-0.0375) > 1e-9 {
		t.Fatalf("complexity=%f want=0.0375", got)
	}
}

func TestSideToMoveInCheckUsesBoardAttacks(t *testing.T) {
	option, err := chess.FEN("4k3/8/8/8/8/8/4R3/4K3 b - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	if !sideToMoveInCheck(chess.NewGame(option).Position()) {
		t.Fatal("expected black king to be in check")
	}

	option, err = chess.FEN(startFEN())
	if err != nil {
		t.Fatal(err)
	}
	if sideToMoveInCheck(chess.NewGame(option).Position()) {
		t.Fatal("starting position must not be in check")
	}
}

func TestMoveForLevelUsesTheGameDifficultyBand(t *testing.T) {
	search := &scriptedSearcher{snapshots: []residentsearch.Snapshot{{
		Candidates: []residentsearch.Candidate{{UCI: "e2e4", Score: 30}, {UCI: "d2d4", Score: 25}},
		Depth:      2,
	}}}
	chooser := NewWith(search, randomSequence(0.999))
	move, err := chooser.MoveForLevel(context.Background(), chess.StartingPosition().String(), 87)
	if err != nil || move != "e2e4" {
		t.Fatalf("move=%q err=%v", move, err)
	}
	band := residentpolicy.Band(87)
	if len(search.calls) != 1 || search.calls[0].maxDepth != band.MaxDepth || search.calls[0].budget != seconds(band.BudgetSeconds) {
		t.Fatalf("calls=%+v band=%+v", search.calls, band)
	}
}

func TestMoveForLevelRejectsNonFiniteDifficulty(t *testing.T) {
	chooser := NewWith(&scriptedSearcher{}, randomSequence(0))
	for _, level := range []float64{math.NaN(), math.Inf(1)} {
		if _, err := chooser.MoveForLevel(context.Background(), chess.StartingPosition().String(), level); err == nil {
			t.Fatalf("level %v accepted", level)
		}
	}
}

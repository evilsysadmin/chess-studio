package chessrules

import (
	"errors"
	"testing"

	chess "github.com/corentings/chess/v2"
)

func strptr(value string) *string { return &value }

func TestApplyUCIParityVectors(t *testing.T) {
	tests := []struct {
		name       string
		fen        string
		uci        string
		wantSAN    string
		wantFEN    string
		wantTurn   string
		wantStatus string
		wantResult *string
	}{
		{
			name:       "starting e4 suppresses unusable ep target",
			fen:        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			uci:        "e2e4",
			wantSAN:    "e4",
			wantFEN:    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
			wantTurn:   "b",
			wantStatus: "active",
		},
		{
			name:       "legal ep target is preserved",
			fen:        "k7/3p4/8/4P3/8/8/8/4K3 b - - 0 1",
			uci:        "d7d5",
			wantSAN:    "d5",
			wantFEN:    "k7/8/8/3pP3/8/8/8/4K3 w - d6 0 2",
			wantTurn:   "w",
			wantStatus: "active",
		},
		{
			name:       "en passant capture",
			fen:        "k7/8/8/3pP3/8/8/8/4K3 w - d6 0 2",
			uci:        "e5d6",
			wantSAN:    "exd6",
			wantFEN:    "k7/8/3P4/8/8/8/8/4K3 b - - 0 2",
			wantTurn:   "b",
			wantStatus: "active",
		},
		{
			name:       "pinned pseudo ep target is suppressed",
			fen:        "k3r3/3p4/8/4P3/8/8/8/4K3 b - - 0 1",
			uci:        "d7d5",
			wantSAN:    "d5",
			wantFEN:    "k3r3/8/8/3pP3/8/8/8/4K3 w - - 0 2",
			wantTurn:   "w",
			wantStatus: "active",
		},
		{
			name:       "king side castling",
			fen:        "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
			uci:        "e1g1",
			wantSAN:    "O-O",
			wantFEN:    "r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1",
			wantTurn:   "b",
			wantStatus: "active",
		},
		{
			name:       "queen promotion with check",
			fen:        "7k/P7/8/8/8/8/8/7K w - - 0 1",
			uci:        "a7a8q",
			wantSAN:    "a8=Q+",
			wantFEN:    "Q6k/8/8/8/8/8/8/7K b - - 0 1",
			wantTurn:   "b",
			wantStatus: "active",
		},
		{
			name:       "fools mate",
			fen:        "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
			uci:        "d8h4",
			wantSAN:    "Qh4#",
			wantFEN:    "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
			wantTurn:   "w",
			wantStatus: "finished",
			wantResult: strptr("0-1"),
		},
		{
			name:       "stalemate",
			fen:        "k7/2Q5/2K5/8/8/8/8/8 w - - 0 1",
			uci:        "c7b6",
			wantSAN:    "Qb6",
			wantFEN:    "k7/8/1QK5/8/8/8/8/8 b - - 1 1",
			wantTurn:   "b",
			wantStatus: "finished",
			wantResult: strptr("1/2-1/2"),
		},
		{
			name:       "insufficient material after capture",
			fen:        "4k3/8/8/8/1n6/2B5/8/4K3 w - - 0 1",
			uci:        "c3b4",
			wantSAN:    "Bxb4",
			wantFEN:    "4k3/8/8/8/1B6/8/8/4K3 b - - 0 1",
			wantTurn:   "b",
			wantStatus: "finished",
			wantResult: strptr("1/2-1/2"),
		},
		{
			name:       "claimable fifty move draw by announced next move",
			fen:        "4k2r/8/8/8/8/8/8/R3K3 w Qk - 98 50",
			uci:        "a1a2",
			wantSAN:    "Ra2",
			wantFEN:    "4k2r/8/8/8/8/8/R7/4K3 b k - 99 50",
			wantTurn:   "b",
			wantStatus: "finished",
			wantResult: strptr("1/2-1/2"),
		},
		{
			name:       "claimable fifty move draw",
			fen:        "4k2r/8/8/8/8/8/8/R3K3 w Qk - 99 50",
			uci:        "a1a2",
			wantSAN:    "Ra2",
			wantFEN:    "4k2r/8/8/8/8/8/R7/4K3 b k - 100 50",
			wantTurn:   "b",
			wantStatus: "finished",
			wantResult: strptr("1/2-1/2"),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ApplyUCI(tc.fen, tc.uci)
			if err != nil {
				t.Fatalf("ApplyUCI(%q): %v", tc.uci, err)
			}
			if got.UCI != tc.uci {
				t.Fatalf("uci=%q want=%q", got.UCI, tc.uci)
			}
			if got.SAN != tc.wantSAN {
				t.Fatalf("san=%q want=%q", got.SAN, tc.wantSAN)
			}
			if got.FEN != tc.wantFEN {
				t.Fatalf("fen=%q want=%q", got.FEN, tc.wantFEN)
			}
			if got.Turn != tc.wantTurn || got.Status != tc.wantStatus {
				t.Fatalf("turn/status=%q/%q want=%q/%q", got.Turn, got.Status, tc.wantTurn, tc.wantStatus)
			}
			if (got.Result == nil) != (tc.wantResult == nil) {
				t.Fatalf("result=%v want=%v", got.Result, tc.wantResult)
			}
			if got.Result != nil && *got.Result != *tc.wantResult {
				t.Fatalf("result=%q want=%q", *got.Result, *tc.wantResult)
			}
		})
	}
}

func TestApplyUCINormalizesPromotionCase(t *testing.T) {
	got, err := ApplyUCI("7k/P7/8/8/8/8/8/7K w - - 0 1", "A7A8Q")
	if err != nil {
		t.Fatal(err)
	}
	if got.UCI != "a7a8q" {
		t.Fatalf("uci=%q", got.UCI)
	}
}

func TestApplyUCISeparatesMalformedFromIllegal(t *testing.T) {
	start := "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

	if _, err := ApplyUCI(start, "e2e9"); !errors.Is(err, ErrInvalidMove) {
		t.Fatalf("malformed err=%v", err)
	}
	if _, err := ApplyUCI(start, "e2e5"); !errors.Is(err, ErrIllegalMove) {
		t.Fatalf("illegal err=%v", err)
	}
}

func TestApplyUCIRejectsInvalidFEN(t *testing.T) {
	if _, err := ApplyUCI("not a fen", "e2e4"); !errors.Is(err, ErrInvalidFEN) {
		t.Fatalf("err=%v", err)
	}
}

func TestTurnReadsAuthoritativeFENSide(t *testing.T) {
	for fen, want := range map[string]string{
		"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1": "w",
		"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1": "b",
	} {
		got, err := Turn(fen)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("fen=%q turn=%q want=%q", fen, got, want)
		}
	}
	if _, err := Turn("not a fen"); !errors.Is(err, ErrInvalidFEN) {
		t.Fatalf("err=%v", err)
	}
}

func TestIsCaptureIncludesEnPassant(t *testing.T) {
	option, err := chess.FEN("4k3/8/8/3Pp3/8/8/8/4K3 w - e6 0 1")
	if err != nil {
		t.Fatal(err)
	}
	game := chess.NewGame(option)
	seen := map[string]bool{}
	for _, move := range game.Position().ValidMoves() {
		m := move
		seen[m.String()] = IsCapture(&m)
	}
	if !seen["d5e6"] {
		t.Fatalf("en passant d5e6 must count as a capture: %v", seen)
	}
	if seen["d5d6"] || seen["e1e2"] {
		t.Fatalf("quiet moves counted as captures: %v", seen)
	}
	if IsCapture(nil) {
		t.Fatal("nil move")
	}
}

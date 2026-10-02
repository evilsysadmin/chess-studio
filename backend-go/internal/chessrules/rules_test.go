package chessrules

import (
	"errors"
	"testing"
)

func resultValue(t *testing.T, got *string) string {
	t.Helper()
	if got == nil {
		return ""
	}
	return *got
}

func TestApplyMatchesPythonChessCoreVectors(t *testing.T) {
	tests := []struct {
		name       string
		fen        string
		move       MoveInput
		wantFEN    string
		wantSAN    string
		wantTurn   string
		wantStatus string
		wantResult string
	}{
		{
			name: "opening double pawn suppresses non-capturable ep",
			fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			move: MoveInput{From:"e2",To:"e4"},
			wantFEN:"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
			wantSAN:"e4", wantTurn:"b", wantStatus:"active",
		},
		{
			name:"legal en passant target is retained",
			fen:"7k/3p4/8/4P3/8/8/8/K7 b - - 0 1",
			move:MoveInput{From:"d7",To:"d5"},
			wantFEN:"7k/8/8/3pP3/8/8/8/K7 w - d6 0 2",
			wantSAN:"d5", wantTurn:"w", wantStatus:"active",
		},
		{
			name:"pinned en passant target is suppressed",
			fen:"4r2k/3p4/8/4P3/8/8/8/4K3 b - - 0 1",
			move:MoveInput{From:"d7",To:"d5"},
			wantFEN:"4r2k/8/8/3pP3/8/8/8/4K3 w - - 0 2",
			wantSAN:"d5", wantTurn:"w", wantStatus:"active",
		},
		{
			name:"castling",
			fen:"r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
			move:MoveInput{From:"e1",To:"g1"},
			wantFEN:"r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1",
			wantSAN:"O-O", wantTurn:"b", wantStatus:"active",
		},
		{
			name:"promotion",
			fen:"7k/P7/8/8/8/8/8/K7 w - - 0 1",
			move:MoveInput{From:"a7",To:"a8",Promotion:"q"},
			wantFEN:"Q6k/8/8/8/8/8/8/K7 b - - 0 1",
			wantSAN:"a8=Q+", wantTurn:"b", wantStatus:"active",
		},
		{
			name:"checkmate",
			fen:"rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
			move:MoveInput{From:"d8",To:"h4"},
			wantFEN:"rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
			wantSAN:"Qh4#", wantTurn:"w", wantStatus:"finished", wantResult:"0-1",
		},
		{
			name:"stalemate",
			fen:"k1K5/8/8/8/8/8/8/1Q6 w - - 0 1",
			move:MoveInput{From:"b1",To:"b6"},
			wantFEN:"k1K5/8/1Q6/8/8/8/8/8 b - - 1 1",
			wantSAN:"Qb6", wantTurn:"b", wantStatus:"finished", wantResult:"1/2-1/2",
		},
		{
			name:"fifty move claim at one hundred halfmoves",
			fen:"7k/8/8/8/8/8/8/K5R1 w - - 99 1",
			move:MoveInput{From:"g1",To:"g2"},
			wantFEN:"7k/8/8/8/8/8/6R1/K7 b - - 100 1",
			wantSAN:"Rg2", wantTurn:"b", wantStatus:"finished", wantResult:"1/2-1/2",
		},
		{
			name:"python claim draw can look one legal move ahead",
			fen:"7k/8/8/8/8/8/8/K5R1 w - - 98 1",
			move:MoveInput{From:"g1",To:"g2"},
			wantFEN:"7k/8/8/8/8/8/6R1/K7 b - - 99 1",
			wantSAN:"Rg2", wantTurn:"b", wantStatus:"finished", wantResult:"1/2-1/2",
		},
	}
	for _,tc:=range tests {
		t.Run(tc.name,func(t *testing.T){
			got,err:=Apply(tc.fen,tc.move)
			if err!=nil { t.Fatal(err) }
			if got.FEN!=tc.wantFEN { t.Fatalf("FEN=%q want=%q",got.FEN,tc.wantFEN) }
			if got.SAN!=tc.wantSAN { t.Fatalf("SAN=%q want=%q",got.SAN,tc.wantSAN) }
			if got.Turn!=tc.wantTurn { t.Fatalf("turn=%q want=%q",got.Turn,tc.wantTurn) }
			if got.Status!=tc.wantStatus { t.Fatalf("status=%q want=%q",got.Status,tc.wantStatus) }
			if resultValue(t,got.Result)!=tc.wantResult { t.Fatalf("result=%v want=%q",got.Result,tc.wantResult) }
		})
	}
}

func TestApplyRejectsIllegalMovesAndMalformedPositions(t *testing.T) {
	_,err:=Apply("not-a-fen",MoveInput{From:"e2",To:"e4"})
	if !errors.Is(err,ErrInvalidPosition) { t.Fatalf("invalid FEN err=%v",err) }

	start:="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	_,err=Apply(start,MoveInput{From:"e2",To:"e5"})
	if !errors.Is(err,ErrIllegalMove) { t.Fatalf("illegal move err=%v",err) }

	promo:="7k/P7/8/8/8/8/8/K7 w - - 0 1"
	_,err=Apply(promo,MoveInput{From:"a7",To:"a8"})
	if !errors.Is(err,ErrIllegalMove) { t.Fatalf("missing promotion err=%v",err) }
}

func TestApplyRejectsPinnedEnPassantCapture(t *testing.T) {
	fen:="4r2k/8/8/3pP3/8/8/8/4K3 w - d6 0 2"
	_,err:=Apply(fen,MoveInput{From:"e5",To:"d6"})
	if !errors.Is(err,ErrIllegalMove) {
		t.Fatalf("pinned en passant err=%v",err)
	}
}

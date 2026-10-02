package residenteval

import (
	"errors"
	"math"
	"strings"

	chess "github.com/corentings/chess/v2"
)

var ErrInvalidFEN = errors.New("invalid FEN")

var pieceValues = map[chess.PieceType]float64{
	chess.Pawn:   100,
	chess.Knight: 320,
	chess.Bishop: 330,
	chess.Rook:   500,
	chess.Queen:  900,
	chess.King:   0,
}

var pawnTable = [64]float64{
	0, 0, 0, 0, 0, 0, 0, 0,
	5, 10, 10, -20, -20, 10, 10, 5,
	5, -5, -10, 0, 0, -10, -5, 5,
	0, 0, 0, 20, 20, 0, 0, 0,
	5, 5, 10, 25, 25, 10, 5, 5,
	10, 10, 20, 30, 30, 20, 10, 10,
	50, 50, 50, 50, 50, 50, 50, 50,
	0, 0, 0, 0, 0, 0, 0, 0,
}

var knightTable = [64]float64{
	-50, -40, -30, -30, -30, -30, -40, -50,
	-40, -20, 0, 5, 5, 0, -20, -40,
	-30, 5, 10, 15, 15, 10, 5, -30,
	-30, 0, 15, 20, 20, 15, 0, -30,
	-30, 5, 15, 20, 20, 15, 5, -30,
	-30, 0, 10, 15, 15, 10, 0, -30,
	-40, -20, 0, 0, 0, 0, -20, -40,
	-50, -40, -30, -30, -30, -30, -40, -50,
}

var bishopTable = [64]float64{
	-20, -10, -10, -10, -10, -10, -10, -20,
	-10, 5, 0, 0, 0, 0, 5, -10,
	-10, 10, 10, 10, 10, 10, 10, -10,
	-10, 0, 10, 10, 10, 10, 0, -10,
	-10, 5, 5, 10, 10, 5, 5, -10,
	-10, 0, 5, 10, 10, 5, 0, -10,
	-10, 0, 0, 0, 0, 0, 0, -10,
	-20, -10, -10, -10, -10, -10, -10, -20,
}

var kingTable = [64]float64{
	20, 30, 10, 0, 0, 10, 30, 20,
	20, 20, 0, 0, 0, 0, 20, 20,
	-10, -20, -20, -20, -20, -20, -20, -10,
	-20, -30, -30, -40, -40, -30, -30, -20,
	-30, -40, -40, -50, -50, -40, -40, -30,
	-30, -40, -40, -50, -50, -40, -40, -30,
	-30, -40, -40, -50, -50, -40, -40, -30,
	-30, -40, -40, -50, -50, -40, -40, -30,
}

var kingEndgameTable = [64]float64{
	-50, -40, -30, -20, -20, -30, -40, -50,
	-30, -20, -10, 0, 0, -10, -20, -30,
	-30, -10, 20, 30, 30, 20, -10, -30,
	-30, -10, 30, 40, 40, 30, -10, -30,
	-30, -10, 30, 40, 40, 30, -10, -30,
	-30, -10, 20, 30, 30, 20, -10, -30,
	-30, -30, 0, 0, 0, 0, -30, -30,
	-50, -30, -30, -30, -30, -30, -30, -50,
}

var center = map[chess.Square]struct{}{
	chess.D4: {}, chess.E4: {}, chess.D5: {}, chess.E5: {},
}

var extendedCenter = map[chess.Square]struct{}{
	chess.C3: {}, chess.D3: {}, chess.E3: {}, chess.F3: {},
	chess.C4: {}, chess.F4: {}, chess.C5: {}, chess.F5: {},
	chess.C6: {}, chess.D6: {}, chess.E6: {}, chess.F6: {},
}

func EvaluateFEN(fen string) (float64, error) {
	option, err := chess.FEN(strings.TrimSpace(fen))
	if err != nil {
		return 0, errors.Join(ErrInvalidFEN, err)
	}
	game := chess.NewGame(option)
	if game.Method() == chess.Checkmate {
		if game.Position().Turn() == chess.White {
			return math.Inf(-1), nil
		}
		return math.Inf(1), nil
	}
	if game.Outcome() != chess.NoOutcome {
		return 0, nil
	}
	if game.Position().HalfMoveClock() >= 100 && len(game.Position().ValidMovesUnsafe()) > 0 {
		return 0, nil
	}
	return EvaluatePosition(game.Position()), nil
}

// EvaluatePosition matches chess_ai.evaluate_board(..., terminal_checked=True).
// Positive scores favor White; negative scores favor Black.
func EvaluatePosition(pos *chess.Position) float64 {
	if pos == nil || pos.Board() == nil {
		return 0
	}
	pieces := pos.Board().SquareMap()

	nonPawnMaterial := 0.0
	for _, piece := range pieces {
		if piece.Type() != chess.Pawn && piece.Type() != chess.King {
			nonPawnMaterial += pieceValues[piece.Type()]
		}
	}
	endgame := nonPawnMaterial <= 2600

	score := 0.0
	bishops := map[chess.Color]int{chess.White: 0, chess.Black: 0}
	pawnFiles := map[chess.Color][8]int{
		chess.White: {},
		chess.Black: {},
	}
	pawns := map[chess.Color][]chess.Square{
		chess.White: {},
		chess.Black: {},
	}

	for square, piece := range pieces {
		value := pieceValues[piece.Type()]
		idx := int(square)
		if piece.Color() == chess.Black {
			idx = int(chess.NewSquare(square.File(), chess.Rank(7-int(square.Rank()))))
		}

		switch piece.Type() {
		case chess.Pawn:
			value += pawnTable[idx]
		case chess.Knight:
			value += knightTable[idx]
		case chess.Bishop:
			value += bishopTable[idx]
		case chess.King:
			if endgame {
				value += kingEndgameTable[idx]
			} else {
				value += kingTable[idx]
			}
		}

		if _, ok := center[square]; ok {
			if piece.Type() == chess.Pawn {
				value += 10
			} else {
				value += 14
			}
		} else if _, ok := extendedCenter[square]; ok {
			value += 5
		}

		if piece.Type() == chess.Bishop {
			bishops[piece.Color()]++
		}
		if piece.Type() == chess.Pawn {
			file := int(square.File())
			files := pawnFiles[piece.Color()]
			files[file]++
			pawnFiles[piece.Color()] = files
			pawns[piece.Color()] = append(pawns[piece.Color()], square)
		}

		if piece.Color() == chess.White {
			score += value
		} else {
			score -= value
		}
	}

	if bishops[chess.White] >= 2 {
		score += 25
	}
	if bishops[chess.Black] >= 2 {
		score -= 25
	}

	for _, color := range []chess.Color{chess.White, chess.Black} {
		sign := 1.0
		if color == chess.Black {
			sign = -1
		}
		files := pawnFiles[color]
		for file, count := range files {
			if count == 0 {
				continue
			}
			left := file > 0 && files[file-1] > 0
			right := file < 7 && files[file+1] > 0
			if !left && !right {
				score -= sign * 10
			}
		}
	}

	for _, color := range []chess.Color{chess.White, chess.Black} {
		sign := 1.0
		if color == chess.Black {
			sign = -1
		}
		enemy := chess.White
		if color == chess.White {
			enemy = chess.Black
		}
		for _, square := range pawns[color] {
			file := int(square.File())
			rank := int(square.Rank())
			blocked := false
			for _, enemySquare := range pawns[enemy] {
				enemyFile := int(enemySquare.File())
				enemyRank := int(enemySquare.Rank())
				if abs(file-enemyFile) > 1 {
					continue
				}
				if (color == chess.White && enemyRank > rank) ||
					(color == chess.Black && enemyRank < rank) {
					blocked = true
					break
				}
			}
			if blocked {
				continue
			}
			advance := rank
			if color == chess.Black {
				advance = 7 - rank
			}
			score += sign * float64(8+(advance*3))
		}
	}

	return score
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

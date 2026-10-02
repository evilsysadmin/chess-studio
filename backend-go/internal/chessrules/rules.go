//go:build checksum_probe

package chessrules

import (
	"errors"
	"fmt"
	"strings"

	chess "github.com/corentings/chess/v2"
)

var (
	ErrInvalidPosition = errors.New("invalid chess position")
	ErrIllegalMove     = errors.New("illegal chess move")
)

type MoveInput struct {
	From      string
	To        string
	Promotion string
}

type AppliedMove struct {
	FEN    string
	UCI    string
	SAN    string
	Turn   string
	Status string
	Result *string
}

func Apply(fen string, input MoveInput) (AppliedMove, error) {
	option, err := chess.FEN(strings.TrimSpace(fen))
	if err != nil {
		return AppliedMove{}, fmt.Errorf("%w: %v", ErrInvalidPosition, err)
	}
	game := chess.NewGame(option)
	pre := game.Position()

	uci := strings.ToLower(strings.TrimSpace(input.From) + strings.TrimSpace(input.To) + strings.TrimSpace(input.Promotion))
	move, err := (chess.UCINotation{}).Decode(pre, uci)
	if err != nil {
		return AppliedMove{}, fmt.Errorf("%w: %v", ErrIllegalMove, err)
	}
	san := (chess.AlgebraicNotation{}).Encode(pre, move)
	if err := game.Move(move, nil); err != nil {
		return AppliedMove{}, fmt.Errorf("%w: %v", ErrIllegalMove, err)
	}

	status := "active"
	var result *string
	outcome := game.Outcome()
	if outcome == chess.NoOutcome && fiftyMoveClaimable(game) {
		outcome = chess.Draw
	}
	if outcome != chess.NoOutcome {
		status = "finished"
		value := outcome.String()
		result = &value
	}

	return AppliedMove{
		FEN:    pythonCompatibleFEN(game.Position()),
		UCI:    (chess.UCINotation{}).Encode(pre, move),
		SAN:    san,
		Turn:   game.Position().Turn().String(),
		Status: status,
		Result: result,
	}, nil
}

func pythonCompatibleFEN(pos *chess.Position) string {
	if pos == nil {
		return ""
	}
	parts := strings.Fields(pos.String())
	if len(parts) != 6 || pos.EnPassantSquare() == chess.NoSquare {
		return pos.String()
	}
	hasLegalEnPassant := false
	for _, move := range pos.ValidMoves() {
		if move.HasTag(chess.EnPassant) {
			hasLegalEnPassant = true
			break
		}
	}
	if !hasLegalEnPassant {
		parts[3] = "-"
	}
	return strings.Join(parts, " ")
}

func fiftyMoveClaimable(game *chess.Game) bool {
	if game == nil || game.Outcome() != chess.NoOutcome {
		return false
	}
	pos := game.Position()
	if pos == nil {
		return false
	}
	moves := game.ValidMoves()
	if pos.HalfMoveClock() >= 100 {
		return len(moves) > 0
	}
	if pos.HalfMoveClock() < 99 {
		return false
	}

	uciNotation := chess.UCINotation{}
	for _, candidate := range moves {
		encoded := uciNotation.Encode(pos, &candidate)
		clone := game.Clone()
		decoded, err := uciNotation.Decode(clone.Position(), encoded)
		if err != nil {
			continue
		}
		if err := clone.Move(decoded, nil); err != nil {
			continue
		}
		if clone.Position().HalfMoveClock() >= 100 && len(clone.ValidMoves()) > 0 {
			return true
		}
	}
	return false
}

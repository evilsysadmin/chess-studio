package chessrules

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	chess "github.com/corentings/chess/v2"
)

var (
	ErrInvalidFEN  = errors.New("invalid FEN")
	ErrInvalidMove = errors.New("invalid UCI move")
	ErrIllegalMove = errors.New("illegal move")
)

type Result struct {
	UCI    string
	SAN    string
	FEN    string
	Turn   string
	Status string
	Result *string
}

// Turn returns the authoritative side to move encoded in FEN.
// PvP Python constructs chess.Board(fen) before checking whose turn it is,
// so callers must not substitute a duplicated database turn field here.
func Turn(fen string) (string, error) {
	fenOption, err := chess.FEN(strings.TrimSpace(fen))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidFEN, err)
	}
	game := chess.NewGame(fenOption)
	return game.Position().Turn().String(), nil
}

// ApplyUCI applies exactly one UCI move to a FEN position.
//
// The returned FEN deliberately matches python-chess Board.fen() defaults:
// en-passant is serialized only when an en-passant capture is actually legal.
// This differs from Position.String() in corentings/chess, which retains the
// target square after every double pawn push.
func ApplyUCI(fen, uci string) (Result, error) {
	fenOption, err := chess.FEN(strings.TrimSpace(fen))
	if err != nil {
		return Result{}, fmt.Errorf("%w: %v", ErrInvalidFEN, err)
	}
	game := chess.NewGame(fenOption)
	position := game.Position()

	normalized := strings.ToLower(strings.TrimSpace(uci))
	if _, err := (chess.UCINotation{}).Decode(position, normalized); err != nil {
		return Result{}, fmt.Errorf("%w: %v", ErrInvalidMove, err)
	}

	var selected chess.Move
	found := false
	for _, candidate := range game.ValidMoves() {
		move := candidate
		if (chess.UCINotation{}).Encode(position, &move) == normalized {
			selected = move
			found = true
			break
		}
	}
	if !found {
		return Result{}, ErrIllegalMove
	}

	san := (chess.AlgebraicNotation{}).Encode(position, &selected)
	if err := game.Move(&selected, nil); err != nil {
		// The move came from ValidMoves, so this would mean the dependency's
		// validation contract changed underneath us.
		return Result{}, fmt.Errorf("validated move rejected: %w", err)
	}

	status, result := matchResult(game)
	return Result{
		UCI:    normalized,
		SAN:    san,
		FEN:    pythonCompatibleFEN(game.Position()),
		Turn:   game.Position().Turn().String(),
		Status: status,
		Result: result,
	}, nil
}

func matchResult(game *chess.Game) (string, *string) {
	outcome := game.Outcome()
	if outcome == chess.NoOutcome {
		if canClaimFiftyMove(game) {
			draw := chess.Draw.String()
			return "finished", &draw
		}
		return "active", nil
	}
	result := outcome.String()
	return "finished", &result
}

// canClaimFiftyMove mirrors python-chess Board.can_claim_fifty_moves() for
// the FEN-only PvP contract. Besides an already-reached 100 halfmoves, a
// player may claim before making a legal move that would reach 100.
//
// PvP reconstructs python-chess Board(match["fen"]) for every request, so the
// historical move stack is intentionally absent on both sides here; historical
// threefold-repetition claims therefore remain unavailable exactly as today.
func canClaimFiftyMove(game *chess.Game) bool {
	if eligibleFiftyMove(game) {
		return true
	}

	position := game.Position()
	if halfMoveClock(position) < 99 {
		return false
	}
	for _, candidate := range game.ValidMoves() {
		move := candidate
		uci := (chess.UCINotation{}).Encode(position, &move)
		next := game.Clone()
		if err := next.PushNotationMove(uci, chess.UCINotation{}, nil); err != nil {
			continue
		}
		// python-chess is_fifty_moves() also requires that the announced
		// position still has a legal move, so mate/stalemate take precedence.
		if eligibleFiftyMove(next) && len(next.ValidMoves()) > 0 {
			return true
		}
	}
	return false
}

func halfMoveClock(position *chess.Position) int {
	parts := strings.Fields(position.String())
	if len(parts) != 6 {
		return 0
	}
	value, err := strconv.Atoi(parts[4])
	if err != nil || value < 0 {
		return 0
	}
	return value
}

func eligibleFiftyMove(game *chess.Game) bool {
	for _, method := range game.EligibleDraws() {
		if method == chess.FiftyMoveRule {
			return len(game.ValidMoves()) > 0
		}
	}
	return false
}

func pythonCompatibleFEN(position *chess.Position) string {
	parts := strings.Fields(position.String())
	if len(parts) != 6 || parts[3] == "-" {
		return position.String()
	}

	hasLegalEnPassant := false
	for _, candidate := range position.ValidMoves() {
		move := candidate
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

// Package gamecore ports backend-python/chess_core.py: rebuilding a stored
// game against the CPU from its real origin (initial FEN or handicap) and its
// SAN history, the canonical JSON snapshot the API returns, and resolving a
// player's from/to/promotion request. Every rule mirrors python-chess, the
// Python authority, and is pinned by a corpus generated from it
// (scripts/games_parity_corpus.py).
package gamecore

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chessrules"
)

var (
	ErrInvalidEntry = errors.New("invalid stored game")
	ErrIllegalSAN   = errors.New("illegal SAN in stored history")
)

const startingFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

// HandicapSquares mirrors chess_core.HANDICAP_SQUARES: the CPU side loses
// this piece (white square, black square).
var HandicapSquares = map[string][2]int{
	"pawn":   {sq(5, 1), sq(5, 6)},
	"knight": {sq(6, 0), sq(6, 7)},
	"rook":   {sq(7, 0), sq(7, 7)},
	"queen":  {sq(3, 0), sq(3, 7)},
}

// Entry is a stored game as Python persists it (the "games" collection).
// Difficulty and LastMove keep their raw stored values: the snapshot echoes
// them unchanged.
type Entry struct {
	HumanColor string
	Difficulty any
	Handicap   *string
	InitialFEN *string
	Moves      []string
	LastMove   any
}

// ParseEntry mirrors chess_core.validate_stored_game_entry.
func ParseEntry(raw map[string]any) (Entry, error) {
	if raw == nil {
		return Entry{}, ErrInvalidEntry
	}
	human, _ := raw["humanColor"].(string)
	if human != "w" && human != "b" {
		return Entry{}, fmt.Errorf("%w: humanColor", ErrInvalidEntry)
	}
	difficulty, ok := numericDifficulty(raw["difficulty"])
	if !ok || difficulty < 0 || difficulty > 100 || math.IsNaN(difficulty) {
		return Entry{}, fmt.Errorf("%w: difficulty", ErrInvalidEntry)
	}
	entry := Entry{HumanColor: human, Difficulty: raw["difficulty"], LastMove: raw["lastMove"]}
	if movesRaw, present := raw["moves"]; present && movesRaw != nil {
		list, ok := toList(movesRaw)
		if !ok {
			return Entry{}, fmt.Errorf("%w: moves", ErrInvalidEntry)
		}
		for _, item := range list {
			san, ok := item.(string)
			if !ok || strings.TrimSpace(san) == "" {
				return Entry{}, fmt.Errorf("%w: moves", ErrInvalidEntry)
			}
			entry.Moves = append(entry.Moves, san)
		}
	} else if present {
		// python: moves=None is not a list.
		return Entry{}, fmt.Errorf("%w: moves", ErrInvalidEntry)
	}
	if v, present := raw["initialFen"]; present && v != nil {
		fen, ok := v.(string)
		if !ok {
			return Entry{}, fmt.Errorf("%w: initialFen", ErrInvalidEntry)
		}
		entry.InitialFEN = &fen
	}
	if v, present := raw["handicap"]; present && v != nil {
		name, ok := v.(string)
		if _, known := HandicapSquares[name]; !ok || !known {
			return Entry{}, fmt.Errorf("%w: handicap", ErrInvalidEntry)
		}
		entry.Handicap = &name
	}
	if v := raw["lastMove"]; v != nil {
		if _, ok := v.(map[string]any); !ok {
			return Entry{}, fmt.Errorf("%w: lastMove", ErrInvalidEntry)
		}
	}
	return entry, nil
}

func numericDifficulty(value any) (float64, bool) {
	switch v := value.(type) {
	case bool:
		return 0, false
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case string:
		// python float() accepts numeric strings.
		f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func toList(value any) ([]any, bool) {
	switch v := value.(type) {
	case []any:
		return v, true
	case []string:
		out := make([]any, len(v))
		for i := range v {
			out[i] = v[i]
		}
		return out, true
	default:
		return nil, false
	}
}

// Board is a game with its full move history, like a python-chess Board
// with a move stack.
type Board struct {
	positions []*chess.Position // positions[i] is before moves[i]
	moves     []chess.Move
}

// BoardFromValidFEN mirrors chess_core.board_from_valid_fen.
func BoardFromValidFEN(fen string) (*Board, error) {
	p, err := parseFEN(fen)
	if err != nil || !p.isValid() {
		return nil, errInvalidFEN
	}
	option, err := chess.FEN(canonicalFEN(p))
	if err != nil {
		return nil, errInvalidFEN
	}
	return &Board{positions: []*chess.Position{chess.NewGame(option).Position()}}, nil
}

// NewStandardBoard is the initial position with an optional handicap removed
// from the CPU side (chess_core.apply_handicap).
func NewStandardBoard(handicap *string, cpuColor string) *Board {
	p, _ := parseFEN(startingFEN)
	if handicap != nil {
		if squares, ok := HandicapSquares[*handicap]; ok {
			target := squares[0]
			if cpuColor == "b" {
				target = squares[1]
			}
			for kind := range p.pieces {
				p.pieces[kind] &^= bit(target)
			}
			p.occupiedCo[white] &^= bit(target)
			p.occupiedCo[black] &^= bit(target)
		}
	}
	// python keeps the raw right but prints and plays the cleaned one.
	p.castling = p.cleanCastlingRights()
	option, _ := chess.FEN(canonicalFEN(p))
	return &Board{positions: []*chess.Position{chess.NewGame(option).Position()}}
}

// LoadBoard mirrors chess_core.load_board.
func LoadBoard(entry Entry) (*Board, error) {
	board, err := originBoard(entry)
	if err != nil {
		return nil, err
	}
	for _, san := range entry.Moves {
		if err := board.PushSAN(san); err != nil {
			return nil, err
		}
	}
	return board, nil
}

func originBoard(entry Entry) (*Board, error) {
	if entry.InitialFEN != nil && *entry.InitialFEN != "" {
		return BoardFromValidFEN(*entry.InitialFEN)
	}
	return NewStandardBoard(entry.Handicap, cpuColor(entry.HumanColor)), nil
}

func cpuColor(human string) string {
	if human == "w" {
		return "b"
	}
	return "w"
}

func (b *Board) Position() *chess.Position { return b.positions[len(b.positions)-1] }

// Moves returns the move stack.
func (b *Board) Moves() []chess.Move { return append([]chess.Move(nil), b.moves...) }

func (b *Board) LegalMoves() []chess.Move { return b.Position().ValidMoves() }

// Push plays a legal move (one returned by LegalMoves).
func (b *Board) Push(move chess.Move) {
	b.positions = append(b.positions, b.Position().Update(&move))
	b.moves = append(b.moves, move)
}

// Pop undoes the last move.
func (b *Board) Pop() bool {
	if len(b.moves) == 0 {
		return false
	}
	b.moves = b.moves[:len(b.moves)-1]
	b.positions = b.positions[:len(b.positions)-1]
	return true
}

// PushSAN plays a SAN move (python-chess Board.push_san).
func (b *Board) PushSAN(san string) error {
	decoded, err := (chess.AlgebraicNotation{}).Decode(b.Position(), san)
	if err != nil {
		return fmt.Errorf("%w: %q", ErrIllegalSAN, san)
	}
	for _, move := range b.LegalMoves() {
		if move.S1() == decoded.S1() && move.S2() == decoded.S2() && move.Promo() == decoded.Promo() {
			b.Push(move)
			return nil
		}
	}
	return fmt.Errorf("%w: %q", ErrIllegalSAN, san)
}

// SAN of a legal move in the current position (python-chess Board.san).
func (b *Board) SAN(move chess.Move) string {
	return (chess.AlgebraicNotation{}).Encode(b.Position(), &move)
}

// Copy returns an independent board with the same history.
func (b *Board) Copy() *Board {
	return &Board{
		positions: append([]*chess.Position(nil), b.positions...),
		moves:     append([]chess.Move(nil), b.moves...),
	}
}

// FEN mirrors python-chess Board.fen(): cleaned castling rights and the en
// passant square only when an en passant capture is legal.
func (b *Board) FEN() string {
	parts := strings.Fields(b.Position().String())
	p := fromChess(b.Position())
	ep := "-"
	if hasLegalEnPassant(b.Position()) {
		ep = squareName(p.epSquare)
	}
	return strings.Join([]string{parts[0], parts[1], castlingField(p.castling), ep, parts[4], parts[5]}, " ")
}

// Turn is "w" or "b".
func (b *Board) Turn() string {
	if b.Position().Turn() == chess.White {
		return "w"
	}
	return "b"
}

func castlingField(rights bitboard) string {
	out := ""
	for _, c := range []struct {
		square int
		flag   string
	}{{7, "K"}, {0, "Q"}, {63, "k"}, {56, "q"}} {
		if rights&bit(c.square) != 0 {
			out += c.flag
		}
	}
	if out == "" {
		return "-"
	}
	return out
}

// canonicalFEN renders a parsed position for corentings/chess, which only
// understands KQkq castling letters.
func canonicalFEN(p *position) string {
	var rows []string
	for rank := 7; rank >= 0; rank-- {
		row, empty := "", 0
		for file := 0; file < 8; file++ {
			square := bit(sq(file, rank))
			c := byte(0)
			for kind, letter := range "pnbrqk" {
				if p.pieces[kind]&square != 0 {
					c = byte(letter)
				}
			}
			if c == 0 {
				empty++
				continue
			}
			if empty > 0 {
				row += strconv.Itoa(empty)
				empty = 0
			}
			if p.occupiedCo[white]&square != 0 {
				c -= 'a' - 'A'
			}
			row += string(c)
		}
		if empty > 0 {
			row += strconv.Itoa(empty)
		}
		rows = append(rows, row)
	}
	turn := "w"
	if p.turn == black {
		turn = "b"
	}
	ep := "-"
	if p.epSquare >= 0 {
		ep = squareName(p.epSquare)
	}
	return fmt.Sprintf("%s %s %s %s %d %d", strings.Join(rows, "/"), turn, castlingField(p.castling), ep, p.halfmove, p.fullmove)
}

func hasLegalEnPassant(pos *chess.Position) bool {
	for _, move := range pos.ValidMoves() {
		if move.HasTag(chess.EnPassant) {
			return true
		}
	}
	return false
}

// transpositionKey mirrors python-chess Board._transposition_key.
func transpositionKey(pos *chess.Position) string {
	p := fromChess(pos)
	ep := -1
	if hasLegalEnPassant(pos) {
		ep = p.epSquare
	}
	return fmt.Sprintf("%v|%v|%d|%d|%d", p.pieces, p.occupiedCo, p.turn, p.castling, ep)
}

// irreversible mirrors python-chess Board.is_irreversible for moves[i].
func (b *Board) irreversible(i int) bool {
	before, move := b.positions[i], b.moves[i]
	if chessrules.IsCapture(&move) || before.Board().Piece(move.S1()).Type() == chess.Pawn {
		return true
	}
	if fromChess(before).castling != fromChess(b.positions[i+1]).castling {
		return true
	}
	return hasLegalEnPassant(before)
}

// IsRepetition mirrors python-chess Board.is_repetition(count).
func (b *Board) IsRepetition(count int) bool {
	key := transpositionKey(b.Position())
	for i := len(b.moves) - 1; ; i-- {
		if count <= 1 {
			return true
		}
		if i+1 < count-1 {
			return false
		}
		if b.irreversible(i) {
			return false
		}
		if transpositionKey(b.positions[i]) == key {
			count--
		}
	}
}

// CanClaimThreefold mirrors python-chess Board.can_claim_threefold_repetition.
func (b *Board) CanClaimThreefold() bool {
	key := transpositionKey(b.Position())
	counts := map[string]int{key: 1}
	for i := len(b.moves) - 1; i >= 0; i-- {
		if b.irreversible(i) {
			break
		}
		counts[transpositionKey(b.positions[i])]++
	}
	if counts[key] >= 3 {
		return true
	}
	for _, move := range b.LegalMoves() {
		if counts[transpositionKey(b.Position().Update(&move))] >= 2 {
			return true
		}
	}
	return false
}

func isFiftyMoves(pos *chess.Position) bool {
	return pos.HalfMoveClock() >= 100 && len(pos.ValidMoves()) > 0
}

// CanClaimFifty mirrors python-chess Board.can_claim_fifty_moves.
func (b *Board) CanClaimFifty() bool {
	pos := b.Position()
	if isFiftyMoves(pos) {
		return true
	}
	if pos.HalfMoveClock() >= 99 {
		for _, move := range pos.ValidMoves() {
			zeroing := chessrules.IsCapture(&move) || pos.Board().Piece(move.S1()).Type() == chess.Pawn
			if !zeroing && isFiftyMoves(pos.Update(&move)) {
				return true
			}
		}
	}
	return false
}

// IsValid mirrors chess.Board.is_valid on the current position.
func (b *Board) IsValid() bool { return fromChess(b.Position()).isValid() }

func (b *Board) IsCheck() bool { return fromChess(b.Position()).isCheck() }

func (b *Board) hasLegalMoves() bool { return len(b.LegalMoves()) > 0 }

func (b *Board) IsCheckmate() bool { return b.IsCheck() && !b.hasLegalMoves() }

func (b *Board) IsStalemate() bool { return !b.IsCheck() && !b.hasLegalMoves() }

func (b *Board) IsSeventyFive() bool {
	return b.Position().HalfMoveClock() >= 150 && b.hasLegalMoves()
}

// HasInsufficientMaterial is per side: "w" or "b".
func (b *Board) HasInsufficientMaterial(color string) bool {
	side := white
	if color == "b" {
		side = black
	}
	return fromChess(b.Position()).hasInsufficientMaterial(side)
}

func (b *Board) IsInsufficientMaterial() bool {
	return b.HasInsufficientMaterial("w") && b.HasInsufficientMaterial("b")
}

// IsGameOver mirrors python-chess Board.is_game_over(claim_draw=True), the
// policy the application adopts for draws.
func (b *Board) IsGameOver() bool {
	return b.IsCheckmate() || b.IsInsufficientMaterial() || b.IsStalemate() ||
		b.IsSeventyFive() || b.IsRepetition(5) || b.CanClaimFifty() || b.CanClaimThreefold()
}

// Status mirrors the status ladder of chess_core.serialize_game.
func (b *Board) Status() string {
	switch {
	case b.IsCheckmate():
		return "checkmate"
	case b.IsStalemate():
		return "stalemate"
	case b.IsRepetition(5) || b.CanClaimThreefold():
		return "repetition"
	case b.IsInsufficientMaterial() || b.IsSeventyFive() || b.CanClaimFifty():
		return "draw"
	case b.IsCheck():
		return "check"
	default:
		return "playing"
	}
}

func pieceSymbol(t chess.PieceType) any {
	switch t {
	case chess.Pawn:
		return "p"
	case chess.Knight:
		return "n"
	case chess.Bishop:
		return "b"
	case chess.Rook:
		return "r"
	case chess.Queen:
		return "q"
	case chess.King:
		return "k"
	}
	return nil
}

// MoveDict mirrors chess_ai.move_to_dict for a legal move in the current
// position.
func (b *Board) MoveDict(move chess.Move) map[string]any {
	pos := b.Position()
	return map[string]any{
		"from":      move.S1().String(),
		"to":        move.S2().String(),
		"san":       b.SAN(move),
		"piece":     pieceSymbol(pos.Board().Piece(move.S1()).Type()),
		"promotion": pieceSymbol(move.Promo()),
		"captured":  chessrules.IsCapture(&move),
	}
}

// SANs mirrors chess_core.board_sans: the history re-encoded from the real
// origin of the game.
func (b *Board) SANs() []string {
	out := make([]string, 0, len(b.moves))
	for i, move := range b.moves {
		out = append(out, (chess.AlgebraicNotation{}).Encode(b.positions[i], &move))
	}
	return out
}

// Snapshot mirrors chess_core.serialize_game.
func (b *Board) Snapshot(gameID string, entry Entry) map[string]any {
	history := make([]any, 0, len(b.moves))
	for i, move := range b.moves {
		before := b.positions[i]
		captured := chessrules.IsCapture(&move)
		var capturedPiece any
		if captured {
			if target := before.Board().Piece(move.S2()); target != chess.NoPiece {
				capturedPiece = pieceSymbol(target.Type())
			} else if move.HasTag(chess.EnPassant) {
				capturedPiece = "p"
			}
		}
		history = append(history, map[string]any{
			"san":           (chess.AlgebraicNotation{}).Encode(before, &move),
			"from":          move.S1().String(),
			"to":            move.S2().String(),
			"piece":         pieceSymbol(before.Board().Piece(move.S1()).Type()),
			"promotion":     pieceSymbol(move.Promo()),
			"captured":      captured,
			"capturedPiece": capturedPiece,
		})
	}
	var initialFEN any
	if entry.InitialFEN != nil {
		initialFEN = *entry.InitialFEN
	}
	return map[string]any{
		"id":         gameID,
		"fen":        b.FEN(),
		"turn":       b.Turn(),
		"humanColor": entry.HumanColor,
		"difficulty": entry.Difficulty,
		"status":     b.Status(),
		"insufficientMatingMaterial": map[string]any{
			"w": b.HasInsufficientMaterial("w"),
			"b": b.HasInsufficientMaterial("b"),
		},
		"isGameOver": b.IsGameOver(),
		"history":    history,
		"lastMove":   entry.LastMove,
		"initialFen": initialFEN,
	}
}

var promotionPieces = map[string]chess.PieceType{
	"q": chess.Queen, "r": chess.Rook, "b": chess.Bishop, "n": chess.Knight,
}

// ResolveMove mirrors chess_core.resolve_move against the legal moves.
func (b *Board) ResolveMove(from, to string, promotion *string) (chess.Move, bool) {
	fromSquare, ok1 := parseSquare(from)
	toSquare, ok2 := parseSquare(to)
	if !ok1 || !ok2 {
		return chess.Move{}, false
	}
	var normalized *string
	if promotion != nil {
		lower := strings.ToLower(*promotion)
		if _, ok := promotionPieces[lower]; !ok {
			return chess.Move{}, false
		}
		normalized = &lower
	}
	var candidates, promotions []chess.Move
	for _, move := range b.LegalMoves() {
		if int(move.S1()) == fromSquare && int(move.S2()) == toSquare {
			candidates = append(candidates, move)
			if move.Promo() != chess.NoPieceType {
				promotions = append(promotions, move)
			}
		}
	}
	if len(candidates) == 0 {
		return chess.Move{}, false
	}
	if len(promotions) == 0 {
		if normalized != nil {
			return chess.Move{}, false
		}
		return candidates[0], true
	}
	wanted := chess.Queen
	if normalized != nil {
		wanted = promotionPieces[*normalized]
	}
	for _, move := range promotions {
		if move.Promo() == wanted {
			return move, true
		}
	}
	return chess.Move{}, false
}

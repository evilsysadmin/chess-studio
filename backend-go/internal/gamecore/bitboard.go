package gamecore

import (
	"errors"
	"math/bits"
	"regexp"
	"strconv"
	"strings"

	chess "github.com/corentings/chess/v2"
)

// The bitboard model below mirrors python-chess (the Python authority) for
// the questions the game API asks: FEN validity (Board.status), castling
// rights cleaning, insufficient material per side and checks. Move
// generation and SAN stay with corentings/chess.

type bitboard uint64

const (
	white = 0
	black = 1
)

const (
	pawn = iota
	knight
	bishop
	rook
	queen
	king
	pieceKinds
)

const (
	rank1    bitboard = 0xff
	rank8    bitboard = 0xff << 56
	fileA    bitboard = 0x0101010101010101
	fileH    bitboard = fileA << 7
	darkSqrs bitboard = 0xaa55aa55aa55aa55
)

var errInvalidFEN = errors.New("invalid FEN")

// position is a python-chess compatible snapshot.
type position struct {
	pieces     [pieceKinds]bitboard
	occupiedCo [2]bitboard
	turn       int
	castling   bitboard // raw rights as python-chess stores them
	epSquare   int      // -1 when absent
	halfmove   int
	fullmove   int
}

func sq(file, rank int) int            { return rank*8 + file }
func bit(square int) bitboard          { return bitboard(1) << uint(square) }
func popcount(b bitboard) int          { return bits.OnesCount64(uint64(b)) }
func lsb(b bitboard) int               { return bits.TrailingZeros64(uint64(b)) }
func msb(b bitboard) int               { return 63 - bits.LeadingZeros64(uint64(b)) }
func squareFile(square int) int        { return square & 7 }
func squareRank(square int) int        { return square >> 3 }
func (p *position) occupied() bitboard { return p.occupiedCo[white] | p.occupiedCo[black] }

var pieceChars = map[byte]struct{ kind, color int }{
	'P': {pawn, white}, 'N': {knight, white}, 'B': {bishop, white}, 'R': {rook, white}, 'Q': {queen, white}, 'K': {king, white},
	'p': {pawn, black}, 'n': {knight, black}, 'b': {bishop, black}, 'r': {rook, black}, 'q': {queen, black}, 'k': {king, black},
}

var castlingFENPattern = regexp.MustCompile(`^(?:-|[KQABCDEFGH]{0,2}[kqabcdefgh]{0,2})$`)

// parseFEN follows python-chess Board.set_fen: missing trailing fields take
// defaults, extra fields or malformed values are errors.
func parseFEN(fen string) (*position, error) {
	parts := strings.Fields(fen)
	if len(parts) == 0 || len(parts) > 6 {
		return nil, errInvalidFEN
	}
	for len(parts) < 6 {
		parts = append(parts, []string{"", "w", "-", "-", "0", "1"}[len(parts)])
	}
	p := &position{epSquare: -1}
	rows := strings.Split(parts[0], "/")
	if len(rows) != 8 {
		return nil, errInvalidFEN
	}
	for i, row := range rows {
		rank := 7 - i
		file := 0
		previousDigit := false
		for j := 0; j < len(row); j++ {
			c := row[j]
			switch {
			case c >= '1' && c <= '8':
				if previousDigit {
					return nil, errInvalidFEN
				}
				file += int(c - '0')
				previousDigit = true
			case c == '~':
				// python-chess marks promoted pieces; it must follow a piece.
				if j == 0 {
					return nil, errInvalidFEN
				}
				if _, piece := pieceChars[row[j-1]]; !piece {
					return nil, errInvalidFEN
				}
				previousDigit = false
			default:
				pc, ok := pieceChars[c]
				if !ok || file > 7 {
					return nil, errInvalidFEN
				}
				p.pieces[pc.kind] |= bit(sq(file, rank))
				p.occupiedCo[pc.color] |= bit(sq(file, rank))
				file++
				previousDigit = false
			}
		}
		if file != 8 {
			return nil, errInvalidFEN
		}
	}
	switch parts[1] {
	case "w":
		p.turn = white
	case "b":
		p.turn = black
	default:
		return nil, errInvalidFEN
	}
	if !castlingFENPattern.MatchString(parts[2]) {
		return nil, errInvalidFEN
	}
	if parts[3] != "-" {
		square, ok := parseSquare(parts[3])
		if !ok {
			return nil, errInvalidFEN
		}
		p.epSquare = square
	}
	halfmove, err := strconv.Atoi(parts[4])
	if err != nil || halfmove < 0 {
		return nil, errInvalidFEN
	}
	fullmove, err := strconv.Atoi(parts[5])
	if err != nil || fullmove < 0 {
		return nil, errInvalidFEN
	}
	p.halfmove = halfmove
	p.fullmove = max(fullmove, 1)
	p.setCastlingFEN(parts[2])
	return p, nil
}

func parseSquare(name string) (int, bool) {
	if len(name) != 2 || name[0] < 'a' || name[0] > 'h' || name[1] < '1' || name[1] > '8' {
		return 0, false
	}
	return sq(int(name[0]-'a'), int(name[1]-'1')), true
}

func squareName(square int) string {
	return string([]byte{byte('a' + squareFile(square)), byte('1' + squareRank(square))})
}

// setCastlingFEN mirrors python-chess Board._set_castling_fen.
func (p *position) setCastlingFEN(field string) {
	p.castling = 0
	if field == "-" {
		return
	}
	for i := 0; i < len(field); i++ {
		flag := field[i]
		color := white
		if flag >= 'a' && flag <= 'z' {
			color = black
		}
		lower := flag | 0x20
		backrank := rank1
		if color == black {
			backrank = rank8
		}
		rooks := p.occupiedCo[color] & p.pieces[rook] & backrank
		kingSquare, hasKing := p.king(color)
		switch lower {
		case 'q':
			if hasKing && rooks != 0 && lsb(rooks) < kingSquare {
				p.castling |= rooks & -rooks
			} else {
				p.castling |= fileA & backrank
			}
		case 'k':
			if hasKing && rooks != 0 && kingSquare < msb(rooks) {
				p.castling |= bit(msb(rooks))
			} else {
				p.castling |= fileH & backrank
			}
		default:
			p.castling |= (fileA << uint(lower-'a')) & backrank
		}
	}
}

// king mirrors python-chess Board.king (non-promoted kings; msb if several).
func (p *position) king(color int) (int, bool) {
	mask := p.occupiedCo[color] & p.pieces[king]
	if mask == 0 {
		return 0, false
	}
	return msb(mask), true
}

// cleanCastlingRights mirrors python-chess for standard chess.
func (p *position) cleanCastlingRights() bitboard {
	castling := p.castling & p.pieces[rook]
	whiteRights := castling & rank1 & p.occupiedCo[white] & (bit(0) | bit(7))
	blackRights := castling & rank8 & p.occupiedCo[black] & (bit(56) | bit(63))
	if p.occupiedCo[white]&p.pieces[king]&bit(4) == 0 {
		whiteRights = 0
	}
	if p.occupiedCo[black]&p.pieces[king]&bit(60) == 0 {
		blackRights = 0
	}
	return whiteRights | blackRights
}

var knightSteps = [][2]int{{1, 2}, {2, 1}, {2, -1}, {1, -2}, {-1, -2}, {-2, -1}, {-2, 1}, {-1, 2}}
var kingSteps = [][2]int{{1, 0}, {1, 1}, {0, 1}, {-1, 1}, {-1, 0}, {-1, -1}, {0, -1}, {1, -1}}
var rookDirs = [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
var bishopDirs = [][2]int{{1, 1}, {1, -1}, {-1, 1}, {-1, -1}}

func stepAttacks(square int, steps [][2]int) bitboard {
	var out bitboard
	f, r := squareFile(square), squareRank(square)
	for _, s := range steps {
		nf, nr := f+s[0], r+s[1]
		if nf >= 0 && nf < 8 && nr >= 0 && nr < 8 {
			out |= bit(sq(nf, nr))
		}
	}
	return out
}

func slideAttacks(square int, dirs [][2]int, occupied bitboard) bitboard {
	var out bitboard
	f, r := squareFile(square), squareRank(square)
	for _, d := range dirs {
		nf, nr := f+d[0], r+d[1]
		for nf >= 0 && nf < 8 && nr >= 0 && nr < 8 {
			target := bit(sq(nf, nr))
			out |= target
			if occupied&target != 0 {
				break
			}
			nf, nr = nf+d[0], nr+d[1]
		}
	}
	return out
}

// pawnAttacks are the squares a pawn of color on square attacks.
func pawnAttacks(color, square int) bitboard {
	if color == white {
		return stepAttacks(square, [][2]int{{-1, 1}, {1, 1}})
	}
	return stepAttacks(square, [][2]int{{-1, -1}, {1, -1}})
}

// attackersMask mirrors python-chess Board._attackers_mask.
func (p *position) attackersMask(color, square int, occupied bitboard) bitboard {
	queensAndRooks := p.pieces[queen] | p.pieces[rook]
	queensAndBishops := p.pieces[queen] | p.pieces[bishop]
	attackers := (stepAttacks(square, kingSteps) & p.pieces[king]) |
		(stepAttacks(square, knightSteps) & p.pieces[knight]) |
		(slideAttacks(square, rookDirs, occupied) & queensAndRooks) |
		(slideAttacks(square, bishopDirs, occupied) & queensAndBishops) |
		(pawnAttacks(1-color, square) & p.pieces[pawn])
	return attackers & p.occupiedCo[color]
}

func (p *position) checkers() bitboard {
	k, ok := p.king(p.turn)
	if !ok {
		return 0
	}
	return p.attackersMask(1-p.turn, k, p.occupied())
}

func (p *position) isCheck() bool { return p.checkers() != 0 }

// ray is python-chess BB_RAYS[a][b]: the whole line through a and b.
func ray(a, b int) bitboard {
	if a == b {
		return 0
	}
	for _, dirs := range [][][2]int{rookDirs, bishopDirs} {
		if slideAttacks(a, dirs, 0)&bit(b) != 0 {
			return (slideAttacks(a, dirs, 0) & slideAttacks(b, dirs, 0)) | bit(a) | bit(b)
		}
	}
	return 0
}

// validEPSquare mirrors python-chess Board._valid_ep_square.
func (p *position) validEPSquare() int {
	if p.epSquare < 0 {
		return -1
	}
	epRank, pawnSquare, seventh := 5, p.epSquare-8, p.epSquare+8
	if p.turn == black {
		epRank, pawnSquare, seventh = 2, p.epSquare+8, p.epSquare-8
	}
	if squareRank(p.epSquare) != epRank {
		return -1
	}
	if p.pieces[pawn]&p.occupiedCo[1-p.turn]&bit(pawnSquare) == 0 {
		return -1
	}
	if p.occupied()&bit(p.epSquare) != 0 || p.occupied()&bit(seventh) != 0 {
		return -1
	}
	return p.epSquare
}

// isValid mirrors python-chess Board.is_valid (status() == STATUS_VALID).
func (p *position) isValid() bool {
	occupied := p.occupied()
	if occupied == 0 {
		return false
	}
	if p.occupiedCo[white]&p.pieces[king] == 0 || p.occupiedCo[black]&p.pieces[king] == 0 {
		return false
	}
	if popcount(occupied&p.pieces[king]) > 2 {
		return false
	}
	if popcount(p.occupiedCo[white]) > 16 || popcount(p.occupiedCo[black]) > 16 {
		return false
	}
	if popcount(p.occupiedCo[white]&p.pieces[pawn]) > 8 || popcount(p.occupiedCo[black]&p.pieces[pawn]) > 8 {
		return false
	}
	if p.pieces[pawn]&(rank1|rank8) != 0 {
		return false
	}
	if p.castling != p.cleanCastlingRights() {
		return false
	}
	validEP := p.validEPSquare()
	if p.epSquare != validEP {
		return false
	}
	if them, ok := p.king(1 - p.turn); ok && p.attackersMask(p.turn, them, occupied) != 0 {
		return false // opposite check
	}
	checkers := p.checkers()
	if checkers == 0 {
		return true
	}
	if popcount(checkers) > 2 {
		return false
	}
	ourKings := p.pieces[king] & p.occupiedCo[p.turn]
	if validEP >= 0 {
		pushedTo := validEP ^ 8
		pushedFrom := validEP ^ 24
		occupiedBefore := (occupied &^ bit(pushedTo)) | bit(pushedFrom)
		if popcount(checkers) > 1 {
			return false
		}
		if msb(checkers) != pushedTo {
			for kings := ourKings; kings != 0; kings &= kings - 1 {
				if p.attackersMask(1-p.turn, lsb(kings), occupiedBefore) != 0 {
					return false
				}
			}
		}
		return true
	}
	if popcount(checkers) == 2 && ray(lsb(checkers), msb(checkers))&ourKings != 0 {
		return false
	}
	return true
}

// hasInsufficientMaterial mirrors python-chess Board.has_insufficient_material.
func (p *position) hasInsufficientMaterial(color int) bool {
	own := p.occupiedCo[color]
	if own&(p.pieces[pawn]|p.pieces[rook]|p.pieces[queen]) != 0 {
		return false
	}
	if own&p.pieces[knight] != 0 {
		return popcount(own) <= 2 && p.occupiedCo[1-color]&^p.pieces[king]&^p.pieces[queen] == 0
	}
	if own&p.pieces[bishop] != 0 {
		sameColor := p.pieces[bishop]&darkSqrs == 0 || p.pieces[bishop]&^darkSqrs == 0
		return sameColor && p.pieces[pawn] == 0 && p.pieces[knight] == 0
	}
	return true
}

// fromChess builds the snapshot of a corentings position. Castling rights
// come cleaned (they are always clean after a valid start and legal moves).
func fromChess(pos *chess.Position) *position {
	p := &position{epSquare: -1, turn: white, halfmove: pos.HalfMoveClock()}
	if pos.Turn() == chess.Black {
		p.turn = black
	}
	for square, piece := range pos.Board().SquareMap() {
		color := white
		if piece.Color() == chess.Black {
			color = black
		}
		var kind int
		switch piece.Type() {
		case chess.Pawn:
			kind = pawn
		case chess.Knight:
			kind = knight
		case chess.Bishop:
			kind = bishop
		case chess.Rook:
			kind = rook
		case chess.Queen:
			kind = queen
		case chess.King:
			kind = king
		}
		p.pieces[kind] |= bit(int(square))
		p.occupiedCo[color] |= bit(int(square))
	}
	rights := string(pos.CastleRights())
	if rights == "" {
		rights = "-"
	}
	p.setCastlingFEN(rights)
	p.castling = p.cleanCastlingRights()
	if ep := pos.EnPassantSquare(); ep != chess.NoSquare {
		p.epSquare = int(ep)
	}
	return p
}

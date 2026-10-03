package matchmove

import (
	"errors"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chessrules"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvpclock"
)

const (
	InitialClockMS = pvpclock.InitialMS
	IncrementMS    = pvpclock.IncrementMS
)

var (
	ErrNotParticipant  = errors.New("player is not a match participant")
	ErrWrongState      = errors.New("match is not active")
	ErrWrongTurn       = errors.New("not player's turn")
	ErrCountdown       = errors.New("match countdown is still active")
	ErrClockExpired    = errors.New("mover clock already expired")
	ErrInvalidPosition = errors.New("invalid persisted position")
	ErrInvalidMove     = errors.New("invalid move")
	ErrIllegalMove     = errors.New("illegal move")
)

type HistoryEntry struct {
	Ply int
	UCI string
	SAN string
	By  string
	At  time.Time
}

type Match struct {
	ID            string
	White         string
	Black         string
	FEN           string
	Turn          string
	Status        string
	Result        *string
	EndReason     *string
	StartAt       time.Time
	WhiteClockMS  int64
	BlackClockMS  int64
	TurnStartedAt time.Time
	History       []HistoryEntry
	Revision      int64
}

type Request struct {
	From      string
	To        string
	Promotion string
}

type Update struct {
	ExpectedRevision int64
	FEN              string
	Turn             string
	Status           string
	Result           *string
	EndReason        *string
	History          []HistoryEntry
	WhiteClockMS     int64
	BlackClockMS     int64
	TurnStartedAt    time.Time
	UpdatedAt        time.Time
	UCI              string
	SAN              string
}

func Prepare(match Match, username string, request Request, now time.Time) (Update, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	color := ""
	switch username {
	case strings.ToLower(strings.TrimSpace(match.White)):
		color = "w"
	case strings.ToLower(strings.TrimSpace(match.Black)):
		color = "b"
	default:
		return Update{}, ErrNotParticipant
	}

	if match.Status != "active" {
		return Update{}, ErrWrongState
	}
	boardTurn, err := chessrules.Turn(match.FEN)
	if err != nil {
		return Update{}, ErrInvalidPosition
	}
	if boardTurn != color {
		return Update{}, ErrWrongTurn
	}

	now = now.UTC()
	if !match.StartAt.IsZero() && now.Before(match.StartAt.UTC()) {
		return Update{}, ErrCountdown
	}

	whiteClock, blackClock := ClockSnapshot(match, now)
	if (color == "w" && whiteClock <= 0) || (color == "b" && blackClock <= 0) {
		return Update{}, ErrClockExpired
	}

	uci := strings.ToLower(strings.TrimSpace(request.From) + strings.TrimSpace(request.To) + strings.TrimSpace(request.Promotion))
	applied, err := chessrules.ApplyUCI(match.FEN, uci)
	if err != nil {
		switch {
		case errors.Is(err, chessrules.ErrInvalidFEN):
			return Update{}, ErrInvalidPosition
		case errors.Is(err, chessrules.ErrInvalidMove):
			return Update{}, ErrInvalidMove
		case errors.Is(err, chessrules.ErrIllegalMove):
			return Update{}, ErrIllegalMove
		default:
			return Update{}, err
		}
	}

	history := append([]HistoryEntry(nil), match.History...)
	history = append(history, HistoryEntry{
		Ply: len(history) + 1,
		UCI: applied.UCI,
		SAN: applied.SAN,
		By:  username,
		At:  now,
	})

	if applied.Status == "active" {
		if color == "w" {
			whiteClock += IncrementMS
		} else {
			blackClock += IncrementMS
		}
	}

	endReason := match.EndReason
	turnStartedAt := now
	if applied.Status == "finished" {
		// Python clears end_reason for board-derived terminal outcomes and stops
		// the clock. Resignation/timeout/disconnect own their own terminal paths.
		endReason = nil
		turnStartedAt = time.Time{}
	}

	return Update{
		ExpectedRevision: match.Revision,
		FEN:              applied.FEN,
		Turn:             applied.Turn,
		Status:           applied.Status,
		Result:           applied.Result,
		EndReason:        endReason,
		History:          history,
		WhiteClockMS:     whiteClock,
		BlackClockMS:     blackClock,
		TurnStartedAt:    turnStartedAt,
		UpdatedAt:        now,
		UCI:              applied.UCI,
		SAN:              applied.SAN,
	}, nil
}

func ClockSnapshot(match Match, now time.Time) (int64, int64) {
	white := match.WhiteClockMS
	black := match.BlackClockMS
	if white < 0 {
		white = 0
	}
	if black < 0 {
		black = 0
	}

	if match.Status != "active" || match.TurnStartedAt.IsZero() {
		return white, black
	}
	started := match.TurnStartedAt.UTC()
	now = now.UTC()
	if started.After(now) {
		return white, black
	}
	elapsed := now.Sub(started).Milliseconds()
	if elapsed < 0 {
		elapsed = 0
	}
	if match.Turn == "b" {
		black -= elapsed
		if black < 0 {
			black = 0
		}
	} else {
		white -= elapsed
		if white < 0 {
			white = 0
		}
	}
	return white, black
}

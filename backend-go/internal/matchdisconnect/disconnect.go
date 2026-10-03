package matchdisconnect

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvpclock"
)

const (
	ReconnectingWindow = 12 * time.Second
	GracePeriod        = pvpclock.DisconnectGrace
)

type Color string

const (
	White Color = "w"
	Black Color = "b"
)

type Outcome string

const (
	OutcomeNoop         Outcome = "noop"
	OutcomeGraceStarted Outcome = "grace_started"
	OutcomeFinished     Outcome = "finished"
	OutcomeNotFound     Outcome = "not_found"
)

type Match struct {
	ID            string
	White         string
	Black         string
	Turn          string
	Status        string
	Result        string
	EndReason     string
	Revision      int64
	WhiteClockMS  int64
	BlackClockMS  int64
	TurnStartedAt time.Time
	WhiteSeenAt   time.Time
	BlackSeenAt   time.Time
	WhiteGraceAt  time.Time
	BlackGraceAt  time.Time
	UpdatedAt     time.Time
}

type Store interface {
	GetMatch(context.Context, string) (Match, bool, error)
	BeginGrace(context.Context, string, Color, time.Time, bool) (Match, bool, error)
	FinishDisconnect(context.Context, string, int64, string, int64, int64, time.Time) (Match, bool, error)
}

type Config struct {
	Store Store
	Now   func() time.Time
}

type Service struct {
	store Store
	now   func() time.Time
}

func New(cfg Config) (*Service, error) {
	if cfg.Store == nil {
		return nil, errors.New("disconnect store is required")
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	return &Service{store: cfg.Store, now: now}, nil
}

func (s *Service) Apply(
	ctx context.Context,
	matchID string,
	observer string,
	observerWasLive bool,
	opponentVirtual bool,
) (Match, Outcome, error) {
	matchID = strings.TrimSpace(matchID)
	observer = strings.ToLower(strings.TrimSpace(observer))
	if matchID == "" || observer == "" {
		return Match{}, OutcomeNotFound, nil
	}

	match, found, err := s.store.GetMatch(ctx, matchID)
	if err != nil {
		return Match{}, "", err
	}
	if !found || (match.White != observer && match.Black != observer) {
		return Match{}, OutcomeNotFound, nil
	}
	if match.Status != "active" {
		return match, OutcomeNoop, nil
	}

	now := s.now().UTC()
	opponentColor := Black
	opponentSeen := match.BlackSeenAt
	graceAt := match.BlackGraceAt
	if match.Black == observer {
		opponentColor = White
		opponentSeen = match.WhiteSeenAt
		graceAt = match.WhiteGraceAt
	}

	if opponentVirtual || recentlyPresent(opponentSeen, now) {
		return match, OutcomeNoop, nil
	}

	outcome := OutcomeNoop
	if !observerWasLive || graceAt.IsZero() {
		updated, ok, err := s.store.BeginGrace(ctx, match.ID, opponentColor, now, !observerWasLive)
		if err != nil {
			return Match{}, "", err
		}
		if ok {
			match = updated
			outcome = OutcomeGraceStarted
			if opponentColor == White {
				graceAt = match.WhiteGraceAt
			} else {
				graceAt = match.BlackGraceAt
			}
		}
	}

	if graceAt.IsZero() || graceAt.Add(GracePeriod).After(now) {
		return match, outcome, nil
	}

	whiteClock, blackClock := ClockSnapshot(match, now)
	result := "1-0"
	if opponentColor == White {
		result = "0-1"
	}
	updated, ok, err := s.store.FinishDisconnect(
		ctx, match.ID, match.Revision, result, whiteClock, blackClock, now,
	)
	if err != nil {
		return Match{}, "", err
	}
	if ok {
		return updated, OutcomeFinished, nil
	}

	// Python's lifecycle helper treats a missed terminal CAS as a race, not an
	// HTTP conflict: re-read and return the authoritative current state.
	current, found, err := s.store.GetMatch(ctx, match.ID)
	if err != nil {
		return Match{}, "", err
	}
	if found {
		return current, OutcomeNoop, nil
	}
	return match, OutcomeNoop, nil
}

func recentlyPresent(seenAt, now time.Time) bool {
	if seenAt.IsZero() {
		return false
	}
	age := now.Sub(seenAt)
	if age < 0 {
		age = 0
	}
	return age <= ReconnectingWindow
}

func ClockSnapshot(match Match, now time.Time) (int64, int64) {
	white := clampClock(match.WhiteClockMS)
	black := clampClock(match.BlackClockMS)
	if match.Status != "active" || match.TurnStartedAt.IsZero() || now.Before(match.TurnStartedAt) {
		return white, black
	}
	elapsed := now.Sub(match.TurnStartedAt).Milliseconds()
	if elapsed < 0 {
		elapsed = 0
	}
	if match.Turn == "b" {
		black = clampClock(black - elapsed)
	} else {
		white = clampClock(white - elapsed)
	}
	return white, black
}

func clampClock(value int64) int64 {
	if value < 0 {
		return 0
	}
	return value
}

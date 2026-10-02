package matchtimeout

import (
	"context"
	"errors"
	"strings"
	"time"
)

type Outcome string

const (
	OutcomeNoop             Outcome = "noop"
	OutcomeFinished         Outcome = "finished"
	OutcomeNotFound         Outcome = "not_found"
	OutcomeRevisionConflict Outcome = "revision_conflict"
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
	UpdatedAt     time.Time
}

type Store interface {
	GetMatch(context.Context, string) (Match, bool, error)
	FinishTimeout(context.Context, string, int64, string, int64, int64, time.Time) (Match, bool, error)
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
		return nil, errors.New("timeout store is required")
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	return &Service{store: cfg.Store, now: now}, nil
}

func (s *Service) FinishIfExpired(ctx context.Context, matchID string) (Match, Outcome, error) {
	matchID = strings.TrimSpace(matchID)
	if matchID == "" {
		return Match{}, OutcomeNotFound, nil
	}
	for attempt := 0; attempt < 3; attempt++ {
		match, found, err := s.store.GetMatch(ctx, matchID)
		if err != nil {
			return Match{}, "", err
		}
		if !found {
			return Match{}, OutcomeNotFound, nil
		}
		if match.Status != "active" {
			return match, OutcomeNoop, nil
		}

		now := s.now().UTC()
		whiteClock, blackClock := ClockSnapshot(match, now)
		flagged := ""
		if match.Turn == "w" && whiteClock <= 0 {
			flagged = "w"
		} else if match.Turn == "b" && blackClock <= 0 {
			flagged = "b"
		}
		if flagged == "" {
			return match, OutcomeNoop, nil
		}

		result := "1-0"
		if flagged == "w" {
			result = "0-1"
		}
		updated, ok, err := s.store.FinishTimeout(
			ctx, match.ID, match.Revision, result, whiteClock, blackClock, now,
		)
		if err != nil {
			return Match{}, "", err
		}
		if ok {
			return updated, OutcomeFinished, nil
		}
	}
	return Match{}, OutcomeRevisionConflict, nil
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

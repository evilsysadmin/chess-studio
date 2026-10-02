package matchresign

import (
	"context"
	"errors"
	"strings"
	"time"
)

type Outcome string

const (
	OutcomeOK               Outcome = "ok"
	OutcomeNotFound         Outcome = "not_found"
	OutcomeWrongState       Outcome = "wrong_state"
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
	FinishResignation(context.Context, string, int64, string, int64, int64, time.Time) (Match, bool, error)
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
		return nil, errors.New("resignation store is required")
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	return &Service{store: cfg.Store, now: now}, nil
}

func (s *Service) Resign(ctx context.Context, matchID, username string) (Match, Outcome, error) {
	matchID = strings.TrimSpace(matchID)
	username = strings.TrimSpace(strings.ToLower(username))
	if matchID == "" || username == "" {
		return Match{}, OutcomeNotFound, nil
	}

	for attempt := 0; attempt < 3; attempt++ {
		match, found, err := s.store.GetMatch(ctx, matchID)
		if err != nil {
			return Match{}, "", err
		}
		if !found || (match.White != username && match.Black != username) {
			return Match{}, OutcomeNotFound, nil
		}
		if match.Status != "active" {
			return match, OutcomeWrongState, nil
		}

		now := s.now().UTC()
		whiteClock, blackClock := ClockSnapshot(match, now)
		result := "1-0"
		if match.White == username {
			result = "0-1"
		}
		updated, ok, err := s.store.FinishResignation(
			ctx,
			match.ID,
			match.Revision,
			result,
			whiteClock,
			blackClock,
			now,
		)
		if err != nil {
			return Match{}, "", err
		}
		if ok {
			return updated, OutcomeOK, nil
		}
	}
	return Match{}, OutcomeRevisionConflict, nil
}

func ClockSnapshot(match Match, now time.Time) (int64, int64) {
	white := max64(0, match.WhiteClockMS)
	black := max64(0, match.BlackClockMS)
	if match.Status != "active" || match.TurnStartedAt.IsZero() || now.Before(match.TurnStartedAt) {
		return white, black
	}
	elapsed := now.Sub(match.TurnStartedAt).Milliseconds()
	if elapsed < 0 {
		elapsed = 0
	}
	if match.Turn == "b" {
		black = max64(0, black-elapsed)
	} else {
		white = max64(0, white-elapsed)
	}
	return white, black
}

func max64(left, right int64) int64 {
	if left > right {
		return left
	}
	return right
}

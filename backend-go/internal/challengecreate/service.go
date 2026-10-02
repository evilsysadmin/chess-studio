package challengecreate

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

var (
	ErrSelfChallenge       = errors.New("cannot challenge self")
	ErrSelfUnavailable     = errors.New("challenger is not in roster")
	ErrOpponentUnavailable = errors.New("opponent is not in roster")
	ErrSelfBusy            = errors.New("challenger already has an active match")
	ErrOpponentBusy        = errors.New("opponent already has an active match")
)

type CooldownError struct {
	RetryAfter int
}

func (e CooldownError) Error() string {
	return "challenge pair is cooling down"
}

type Player struct {
	Username string
	Rating   int64
}

type Challenge struct {
	ID               string
	Challenger       string
	Opponent         string
	ChallengerRating int64
	OpponentRating   int64
	Status           string
	CreatedAt        time.Time
}

type Result struct {
	Challenge Challenge
	CreatedNow bool
}

type Store interface {
	RosterMember(context.Context, string, time.Time) (Player, bool, error)
	HasActiveMatch(context.Context, string) (bool, error)
	CooldownUntil(context.Context, string, string, time.Time) (time.Time, bool, error)
	CreateChallenge(context.Context, Challenge, time.Time) (Challenge, bool, error)
}

type Config struct {
	Store Store
	Now   func() time.Time
	NewID func() (string, error)
}

type Service struct {
	store Store
	now   func() time.Time
	newID func() (string, error)
}

func New(cfg Config) (*Service, error) {
	if cfg.Store == nil {
		return nil, errors.New("challenge create store is required")
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	newID := cfg.NewID
	if newID == nil {
		newID = randomID
	}
	return &Service{store: cfg.Store, now: now, newID: newID}, nil
}

func (s *Service) Create(ctx context.Context, username, opponent string) (Result, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	opponent = strings.ToLower(strings.TrimSpace(opponent))
	if opponent == username {
		return Result{}, ErrSelfChallenge
	}

	now := s.now().UTC()
	challenger, ok, err := s.store.RosterMember(ctx, username, now)
	if err != nil {
		return Result{}, err
	}
	if !ok {
		return Result{}, ErrSelfUnavailable
	}
	rival, ok, err := s.store.RosterMember(ctx, opponent, now)
	if err != nil {
		return Result{}, err
	}
	if !ok {
		return Result{}, ErrOpponentUnavailable
	}
	if busy, err := s.store.HasActiveMatch(ctx, username); err != nil {
		return Result{}, err
	} else if busy {
		return Result{}, ErrSelfBusy
	}
	if busy, err := s.store.HasActiveMatch(ctx, opponent); err != nil {
		return Result{}, err
	} else if busy {
		return Result{}, ErrOpponentBusy
	}
	if until, active, err := s.store.CooldownUntil(ctx, username, opponent, now); err != nil {
		return Result{}, err
	} else if active && until.After(now) {
		retryAfter := int(until.Sub(now).Seconds()) + 1
		if retryAfter < 1 {
			retryAfter = 1
		}
		return Result{}, CooldownError{RetryAfter: retryAfter}
	}

	id, err := s.newID()
	if err != nil {
		return Result{}, err
	}
	id = strings.ToLower(strings.TrimSpace(id))
	if id == "" {
		return Result{}, errors.New("challenge id generator returned empty id")
	}

	draft := Challenge{
		ID:               id,
		Challenger:       username,
		Opponent:         opponent,
		ChallengerRating: challenger.Rating,
		OpponentRating:   rival.Rating,
		Status:           "pending",
		CreatedAt:        now,
	}
	row, createdNow, err := s.store.CreateChallenge(ctx, draft, now)
	if err != nil {
		return Result{}, err
	}
	return Result{Challenge: row, CreatedNow: createdNow}, nil
}

func randomID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	// Match uuid.uuid4().hex: RFC 4122 version 4 + variant bits, rendered
	// without dashes as 32 lowercase hexadecimal characters.
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	return hex.EncodeToString(raw[:]), nil
}

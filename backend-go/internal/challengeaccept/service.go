package challengeaccept

import (
	"context"
	"crypto/rand"
	"errors"
	"io"
	"strings"
	"time"
)

const (
	StartingFEN         = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	InitialClockMS      = int64(30 * 60 * 1000)
	ReadyTimeout        = 30 * time.Second
)

var (
	ErrChallengeNotFound   = errors.New("challenge not found")
	ErrOpponentBusy        = errors.New("opponent already has an active match")
	ErrSelfBusy            = errors.New("caller already has an active match")
	ErrOpponentUnavailable = errors.New("opponent is not in the roster")
	ErrSelfUnavailable     = errors.New("caller is not in the roster")
	ErrChallengeChanged    = errors.New("challenge changed before acceptance committed")
)

type Challenge struct {
	ID               string
	Challenger       string
	Opponent         string
	ChallengerRating int64
	OpponentRating   int64
	Status           string
	MatchID          string
	CreatedAt        time.Time
}

type Match struct {
	ID             string
	White          string
	Black          string
	WhiteRating    int64
	BlackRating    int64
	FEN            string
	Turn           string
	Status         string
	Result         *string
	Revision       int64
	Rated          bool
	WhiteClockMS   int64
	BlackClockMS   int64
	WhiteReady     bool
	BlackReady     bool
	StartAt        *time.Time
	ReadyDeadline  time.Time
	TurnStartedAt  *time.Time
	EndReason      *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type Result struct {
	Match       Match
	AcceptedNow bool
	Challenger  string
}

type Store interface {
	GetChallenge(context.Context, string) (Challenge, bool, error)
	GetMatch(context.Context, string) (Match, bool, error)
	HasActiveMatch(context.Context, string) (bool, error)
	IsRosterMember(context.Context, string, time.Time) (bool, error)
	CommitAcceptance(context.Context, string, string, Match, time.Time) (Match, bool, error)
}

type Config struct {
	Store Store
	Now   func() time.Time
	Coin  func() (bool, error)
}

type Service struct {
	store Store
	now   func() time.Time
	coin  func() (bool, error)
}

func New(cfg Config) (*Service, error) {
	if cfg.Store == nil {
		return nil, errors.New("challenge accept store is required")
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	coin := cfg.Coin
	if coin == nil {
		coin = cryptoCoin
	}
	return &Service{store: cfg.Store, now: now, coin: coin}, nil
}

func (s *Service) Accept(ctx context.Context, challengeID, username string, syntheticPair bool) (Result, error) {
	challengeID = strings.TrimSpace(challengeID)
	username = strings.TrimSpace(strings.ToLower(username))
	if challengeID == "" || username == "" {
		return Result{}, ErrChallengeNotFound
	}

	challenge, found, err := s.store.GetChallenge(ctx, challengeID)
	if err != nil {
		return Result{}, err
	}
	if !found || challenge.Opponent != username {
		return Result{}, ErrChallengeNotFound
	}

	recoverAcceptedMatch := false
	switch challenge.Status {
	case "accepted":
		if challenge.MatchID == "" {
			return Result{}, ErrChallengeNotFound
		}
		match, ok, err := s.store.GetMatch(ctx, challenge.MatchID)
		if err != nil {
			return Result{}, err
		}
		if ok {
			return Result{Match: match, AcceptedNow: false, Challenger: challenge.Challenger}, nil
		}
		// Python deliberately lets the persistence saga repair the rare state
		// where the challenge CAS committed but the authoritative match cannot
		// be read. Do not re-run lobby availability checks in this recovery path.
		recoverAcceptedMatch = true
	case "pending":
		// continue below
	default:
		return Result{}, ErrChallengeNotFound
	}

	if !recoverAcceptedMatch {
		if busy, err := s.store.HasActiveMatch(ctx, challenge.Challenger); err != nil {
		return Result{}, err
		} else if busy {
			return Result{}, ErrOpponentBusy
		}
		if busy, err := s.store.HasActiveMatch(ctx, username); err != nil {
			return Result{}, err
		} else if busy {
			return Result{}, ErrSelfBusy
		}
	}

	now := s.now().UTC()
	if !recoverAcceptedMatch {
		if present, err := s.store.IsRosterMember(ctx, challenge.Challenger, now); err != nil {
			return Result{}, err
		} else if !present {
			return Result{}, ErrOpponentUnavailable
		}
		if present, err := s.store.IsRosterMember(ctx, username, now); err != nil {
			return Result{}, err
		} else if !present {
			return Result{}, ErrSelfUnavailable
		}
	}

	challengerWhite := syntheticPair
	if !syntheticPair {
		challengerWhite, err = s.coin()
		if err != nil {
			return Result{}, err
		}
	}

	matchID := strings.TrimSpace(challenge.MatchID)
	if matchID == "" {
		matchID = challenge.ID
	}
	draft := newMatchDraft(challenge, matchID, challengerWhite, !syntheticPair, now)
	match, committed, err := s.store.CommitAcceptance(ctx, challenge.ID, username, draft, now)
	if err != nil {
		return Result{}, err
	}
	if !committed {
		return Result{}, ErrChallengeChanged
	}
	return Result{Match: match, AcceptedNow: true, Challenger: challenge.Challenger}, nil
}

func newMatchDraft(challenge Challenge, matchID string, challengerWhite, rated bool, now time.Time) Match {
	white := challenge.Opponent
	black := challenge.Challenger
	whiteRating := challenge.OpponentRating
	blackRating := challenge.ChallengerRating
	if challengerWhite {
		white = challenge.Challenger
		black = challenge.Opponent
		whiteRating = challenge.ChallengerRating
		blackRating = challenge.OpponentRating
	}
	return Match{
		ID:            matchID,
		White:         white,
		Black:         black,
		WhiteRating:   whiteRating,
		BlackRating:   blackRating,
		FEN:           StartingFEN,
		Turn:          "w",
		Status:        "starting",
		Revision:      0,
		Rated:         rated,
		WhiteClockMS:  InitialClockMS,
		BlackClockMS:  InitialClockMS,
		WhiteReady:    false,
		BlackReady:    false,
		ReadyDeadline: now.Add(ReadyTimeout),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
}

func cryptoCoin() (bool, error) {
	var b [1]byte
	if _, err := io.ReadFull(rand.Reader, b[:]); err != nil {
		return false, err
	}
	return b[0]&1 == 1, nil
}

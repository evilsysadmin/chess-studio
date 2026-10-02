package pvprating

import (
	"context"
	"errors"
	"math"
	"strings"
)

const (
	DefaultRating int64 = 400
	MinRating     int64 = 100
	MaxRating     int64 = 10000
	EloK          int64 = 32
)

var ErrInvalidResult = errors.New("invalid PvP rating result")

type Match struct {
	ID          string
	Status      string
	Rated       bool
	Result      string
	White       string
	Black       string
	WhiteRating int64
	BlackRating int64
}

type Settlement struct {
	White int64
	Black int64
}

type Store interface {
	ApplyRating(context.Context, string, string, int64, int64) (bool, error)
}

type Service struct {
	store Store
}

func New(store Store) (*Service, error) {
	if store == nil {
		return nil, errors.New("rating store is required")
	}
	return &Service{store: store}, nil
}

func Normalize(value int64) int64 {
	if value == 0 {
		value = DefaultRating
	}
	if value < MinRating {
		return MinRating
	}
	if value > MaxRating {
		return MaxRating
	}
	return value
}

func NextRatings(whiteRating, blackRating int64, result string) (int64, int64, error) {
	white := Normalize(whiteRating)
	black := Normalize(blackRating)

	var whiteScore float64
	switch result {
	case "1-0":
		whiteScore = 1
	case "0-1":
		whiteScore = 0
	case "1/2-1/2":
		whiteScore = 0.5
	default:
		return 0, 0, ErrInvalidResult
	}

	whiteExpected := 1.0 / (1.0 + math.Pow(10.0, float64(black-white)/400.0))
	blackExpected := 1.0 - whiteExpected
	blackScore := 1.0 - whiteScore

	nextWhite := Normalize(int64(math.RoundToEven(float64(white) + float64(EloK)*(whiteScore-whiteExpected))))
	nextBlack := Normalize(int64(math.RoundToEven(float64(black) + float64(EloK)*(blackScore-blackExpected))))
	return nextWhite, nextBlack, nil
}

func (s *Service) Settle(ctx context.Context, match Match) (*Settlement, error) {
	if strings.TrimSpace(match.ID) == "" || match.Status != "finished" || !match.Rated {
		return nil, nil
	}
	if match.Result != "1-0" && match.Result != "0-1" && match.Result != "1/2-1/2" {
		return nil, nil
	}
	white := strings.TrimSpace(match.White)
	black := strings.TrimSpace(match.Black)
	if white == "" || black == "" || white == black {
		return nil, nil
	}

	whiteBefore := Normalize(match.WhiteRating)
	blackBefore := Normalize(match.BlackRating)
	whiteAfter, blackAfter, err := NextRatings(whiteBefore, blackBefore, match.Result)
	if err != nil {
		return nil, err
	}

	whiteOK, err := s.store.ApplyRating(ctx, white, match.ID, whiteBefore, whiteAfter)
	if err != nil {
		return nil, err
	}
	blackOK, err := s.store.ApplyRating(ctx, black, match.ID, blackBefore, blackAfter)
	if err != nil {
		return nil, err
	}
	if !whiteOK || !blackOK {
		return nil, nil
	}
	return &Settlement{White: whiteAfter, Black: blackAfter}, nil
}

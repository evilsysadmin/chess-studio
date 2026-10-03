package pulse

import (
	"context"
	"errors"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchtimeout"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type TimeoutStore struct {
	store *MongoStore
}

func NewTimeoutStore(store *MongoStore) *TimeoutStore {
	return &TimeoutStore{store: store}
}

func (s *TimeoutStore) GetMatch(ctx context.Context, matchID string) (matchtimeout.Match, bool, error) {
	if s == nil || s.store == nil {
		return matchtimeout.Match{}, false, errors.New("timeout store is not configured")
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.store.timeout)
	defer cancel()

	var row cancelMatchRow
	err := s.store.db.Collection("pvp_matches").FindOne(
		queryCtx,
		bson.M{"_id": matchID, "acceptance_state": bson.M{"$ne": "staged"}},
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return matchtimeout.Match{}, false, nil
	}
	if err != nil {
		return matchtimeout.Match{}, false, err
	}
	return timeoutDomainMatch(row), true, nil
}

func (s *TimeoutStore) FinishTimeout(
	ctx context.Context,
	matchID string,
	expectedRevision int64,
	result string,
	whiteClock int64,
	blackClock int64,
	now time.Time,
) (matchtimeout.Match, bool, error) {
	if s == nil || s.store == nil {
		return matchtimeout.Match{}, false, errors.New("timeout store is not configured")
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.store.timeout)
	defer cancel()

	var row cancelMatchRow
	err := s.store.db.Collection("pvp_matches").FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id":              matchID,
			"revision":         expectedRevision,
			"status":           "active",
			"acceptance_state": bson.M{"$ne": "staged"},
		},
		bson.M{
			"$set": bson.M{
				"status":          "finished",
				"result":          result,
				"end_reason":      "timeout",
				"white_clock_ms":  clampTimeoutClock(whiteClock),
				"black_clock_ms":  clampTimeoutClock(blackClock),
				"turn_started_at": nil,
				"updated_at":      now,
			},
			"$inc": bson.M{"revision": 1},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return matchtimeout.Match{}, false, nil
	}
	if err != nil {
		return matchtimeout.Match{}, false, err
	}
	return timeoutDomainMatch(row), true, nil
}

func timeoutDomainMatch(row cancelMatchRow) matchtimeout.Match {
	result := ""
	if row.Result != nil {
		result = *row.Result
	}
	endReason := ""
	if row.EndReason != nil {
		endReason = *row.EndReason
	}
	return matchtimeout.Match{
		ID:            row.ID,
		White:         row.White,
		Black:         row.Black,
		Turn:          row.Turn,
		Status:        row.Status,
		Result:        result,
		EndReason:     endReason,
		Revision:      row.Revision,
		WhiteClockMS:  pointerInt64(row.WhiteClockMS, pvpInitialClockMS),
		BlackClockMS:  pointerInt64(row.BlackClockMS, pvpInitialClockMS),
		TurnStartedAt: row.TurnStartedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}

func clampTimeoutClock(value int64) int64 {
	if value < 0 {
		return 0
	}
	return value
}

var _ matchtimeout.Store = (*TimeoutStore)(nil)

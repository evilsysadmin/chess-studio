package pulse

import (
	"context"
	"errors"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchresign"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type ResignStore struct {
	store *MongoStore
}

func NewResignStore(store *MongoStore) *ResignStore {
	return &ResignStore{store: store}
}

func (s *ResignStore) GetMatch(ctx context.Context, matchID string) (matchresign.Match, bool, error) {
	if s == nil || s.store == nil {
		return matchresign.Match{}, false, errors.New("resign store is not configured")
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.store.timeout)
	defer cancel()

	var row cancelMatchRow
	err := s.store.db.Collection("pvp_matches").FindOne(
		queryCtx,
		bson.M{"_id": matchID, "acceptance_state": bson.M{"$ne": "staged"}},
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return matchresign.Match{}, false, nil
	}
	if err != nil {
		return matchresign.Match{}, false, err
	}
	return resignDomainMatch(row), true, nil
}

func (s *ResignStore) FinishResignation(
	ctx context.Context,
	matchID string,
	expectedRevision int64,
	result string,
	whiteClock int64,
	blackClock int64,
	now time.Time,
) (matchresign.Match, bool, error) {
	if s == nil || s.store == nil {
		return matchresign.Match{}, false, errors.New("resign store is not configured")
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.store.timeout)
	defer cancel()

	var row cancelMatchRow
	err := s.store.db.Collection("pvp_matches").FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id": matchID,
			"revision": expectedRevision,
			"status": "active",
			"acceptance_state": bson.M{"$ne": "staged"},
		},
		bson.M{
			"$set": bson.M{
				"status": "finished",
				"result": result,
				"end_reason": "resignation",
				"white_clock_ms": maxRatingClock(whiteClock),
				"black_clock_ms": maxRatingClock(blackClock),
				"turn_started_at": nil,
				"updated_at": now,
			},
			"$inc": bson.M{"revision": 1},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return matchresign.Match{}, false, nil
	}
	if err != nil {
		return matchresign.Match{}, false, err
	}
	return resignDomainMatch(row), true, nil
}

func resignDomainMatch(row cancelMatchRow) matchresign.Match {
	result := ""
	if row.Result != nil {
		result = *row.Result
	}
	endReason := ""
	if row.EndReason != nil {
		endReason = *row.EndReason
	}
	return matchresign.Match{
		ID: row.ID,
		White: row.White,
		Black: row.Black,
		Turn: row.Turn,
		Status: row.Status,
		Result: result,
		EndReason: endReason,
		Revision: row.Revision,
		WhiteClockMS: pointerInt64(row.WhiteClockMS, 10*60*1000),
		BlackClockMS: pointerInt64(row.BlackClockMS, 10*60*1000),
		TurnStartedAt: row.TurnStartedAt,
		UpdatedAt: row.UpdatedAt,
	}
}

func maxRatingClock(value int64) int64 {
	if value < 0 {
		return 0
	}
	return value
}

var _ matchresign.Store = (*ResignStore)(nil)

package pulse

import (
	"context"
	"errors"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchdisconnect"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type DisconnectStore struct {
	store *MongoStore
}

func NewDisconnectStore(store *MongoStore) *DisconnectStore {
	return &DisconnectStore{store: store}
}

func (s *DisconnectStore) GetMatch(ctx context.Context, matchID string) (matchdisconnect.Match, bool, error) {
	if s == nil || s.store == nil {
		return matchdisconnect.Match{}, false, errors.New("disconnect store is not configured")
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.store.timeout)
	defer cancel()

	var row cancelMatchRow
	err := s.store.db.Collection("pvp_matches").FindOne(
		queryCtx,
		bson.M{"_id": matchID, "acceptance_state": bson.M{"$ne": "staged"}},
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return matchdisconnect.Match{}, false, nil
	}
	if err != nil {
		return matchdisconnect.Match{}, false, err
	}
	return disconnectDomainMatch(row), true, nil
}

func (s *DisconnectStore) BeginGrace(
	ctx context.Context,
	matchID string,
	color matchdisconnect.Color,
	now time.Time,
	restart bool,
) (matchdisconnect.Match, bool, error) {
	if s == nil || s.store == nil {
		return matchdisconnect.Match{}, false, errors.New("disconnect store is not configured")
	}
	field := disconnectGraceField(color)
	if field == "" {
		return matchdisconnect.Match{}, false, nil
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.store.timeout)
	defer cancel()

	var row cancelMatchRow
	err := s.store.db.Collection("pvp_matches").FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id": matchID,
			"status": "active",
			"acceptance_state": bson.M{"$ne": "staged"},
		},
		disconnectGraceUpdate(field, now, restart),
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return matchdisconnect.Match{}, false, nil
	}
	if err != nil {
		return matchdisconnect.Match{}, false, err
	}
	return disconnectDomainMatch(row), true, nil
}

func (s *DisconnectStore) FinishDisconnect(
	ctx context.Context,
	matchID string,
	expectedRevision int64,
	result string,
	whiteClock int64,
	blackClock int64,
	now time.Time,
) (matchdisconnect.Match, bool, error) {
	if s == nil || s.store == nil {
		return matchdisconnect.Match{}, false, errors.New("disconnect store is not configured")
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
				"end_reason": "disconnect",
				"white_clock_ms": clampDisconnectClock(whiteClock),
				"black_clock_ms": clampDisconnectClock(blackClock),
				"turn_started_at": nil,
				"updated_at": now,
			},
			"$inc": bson.M{"revision": 1},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return matchdisconnect.Match{}, false, nil
	}
	if err != nil {
		return matchdisconnect.Match{}, false, err
	}
	return disconnectDomainMatch(row), true, nil
}

func disconnectGraceField(color matchdisconnect.Color) string {
	switch color {
	case matchdisconnect.White:
		return "white_disconnect_grace_started_at"
	case matchdisconnect.Black:
		return "black_disconnect_grace_started_at"
	default:
		return ""
	}
}

func disconnectGraceUpdate(field string, now time.Time, restart bool) bson.M {
	if restart {
		return bson.M{"$set": bson.M{field: now}}
	}
	return bson.M{"$min": bson.M{field: now}}
}

func disconnectDomainMatch(row cancelMatchRow) matchdisconnect.Match {
	result := ""
	if row.Result != nil {
		result = *row.Result
	}
	endReason := ""
	if row.EndReason != nil {
		endReason = *row.EndReason
	}
	return matchdisconnect.Match{
		ID: row.ID,
		White: row.White,
		Black: row.Black,
		Turn: row.Turn,
		Status: row.Status,
		Result: result,
		EndReason: endReason,
		Revision: row.Revision,
		WhiteClockMS: pointerInt64(row.WhiteClockMS, pvpInitialClockMS),
		BlackClockMS: pointerInt64(row.BlackClockMS, pvpInitialClockMS),
		TurnStartedAt: row.TurnStartedAt,
		WhiteSeenAt: row.WhiteSeenAt,
		BlackSeenAt: row.BlackSeenAt,
		WhiteGraceAt: row.WhiteDisconnectGraceStarted,
		BlackGraceAt: row.BlackDisconnectGraceStarted,
		UpdatedAt: row.UpdatedAt,
	}
}

func clampDisconnectClock(value int64) int64 {
	if value < 0 {
		return 0
	}
	return value
}

var _ matchdisconnect.Store = (*DisconnectStore)(nil)

package pulse

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func (s *MongoStore) ReadMatchAndTouchPresence(
	ctx context.Context,
	matchID string,
	username string,
	now time.Time,
) (cancelMatchRow, bool, bool, error) {
	row, found, err := s.GetHandoffMatch(ctx, matchID)
	if err != nil || !found {
		return cancelMatchRow{}, false, found, err
	}

	playerField := ""
	seenField := ""
	graceField := ""
	seenAt := time.Time{}
	switch username {
	case row.White:
		playerField = "white"
		seenField = "white_seen_at"
		graceField = "white_disconnect_grace_started_at"
		seenAt = row.WhiteSeenAt
	case row.Black:
		playerField = "black"
		seenField = "black_seen_at"
		graceField = "black_disconnect_grace_started_at"
		seenAt = row.BlackSeenAt
	default:
		return cancelMatchRow{}, false, false, nil
	}
	observerWasLive := matchReadRecentlyPresent(seenAt, now)

	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var updated cancelMatchRow
	err = s.db.Collection("pvp_matches").FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id":              matchID,
			playerField:        username,
			"acceptance_state": bson.M{"$ne": "staged"},
		},
		bson.M{
			"$set":   bson.M{seenField: now},
			"$unset": bson.M{graceField: ""},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updated)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, false, false, nil
	}
	if err != nil {
		return cancelMatchRow{}, false, false, err
	}
	return updated, observerWasLive, true, nil
}

func (s *MongoStore) MarkVirtualReady(
	ctx context.Context,
	matchID string,
	virtualUsername string,
	now time.Time,
) (cancelMatchRow, bool, error) {
	row, observerWasLive, found, err := s.ReadMatchAndTouchPresence(ctx, matchID, virtualUsername, now)
	_ = observerWasLive
	if err != nil || !found {
		return cancelMatchRow{}, found, err
	}
	if row.Status != "starting" {
		return row, true, nil
	}

	readyField := ""
	playerField := ""
	switch virtualUsername {
	case row.White:
		readyField = "white_ready"
		playerField = "white"
		if row.WhiteReady {
			return row, true, nil
		}
	case row.Black:
		readyField = "black_ready"
		playerField = "black"
		if row.BlackReady {
			return row, true, nil
		}
	default:
		return cancelMatchRow{}, false, nil
	}

	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var updated cancelMatchRow
	err = s.db.Collection("pvp_matches").FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id":              matchID,
			"revision":         row.Revision,
			"status":           "starting",
			playerField:        virtualUsername,
			"acceptance_state": bson.M{"$ne": "staged"},
		},
		bson.M{
			"$set": bson.M{readyField: true, "updated_at": now},
			"$inc": bson.M{"revision": 1},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&updated)
	if err == nil {
		return updated, true, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, false, err
	}

	current, found, readErr := s.GetHandoffMatch(ctx, matchID)
	if readErr != nil {
		return cancelMatchRow{}, false, readErr
	}
	return current, found, nil
}

func (s *MongoStore) FinishReadHandoffTimeout(
	ctx context.Context,
	matchID string,
	expectedRevision int64,
	now time.Time,
) (cancelMatchRow, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row cancelMatchRow
	err := s.db.Collection("pvp_matches").FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id":              matchID,
			"revision":         expectedRevision,
			"status":           "starting",
			"ready_deadline":   bson.M{"$lte": now},
			"acceptance_state": bson.M{"$ne": "staged"},
		},
		bson.M{
			"$set": bson.M{
				"status":          "cancelled",
				"result":          nil,
				"end_reason":      "handoff_timeout",
				"turn_started_at": nil,
				"updated_at":      now,
			},
			"$inc": bson.M{"revision": 1},
		},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, false, nil
	}
	if err != nil {
		return cancelMatchRow{}, false, err
	}
	return row, true, nil
}

func matchReadRecentlyPresent(seenAt, now time.Time) bool {
	if seenAt.IsZero() {
		return false
	}
	age := now.Sub(seenAt)
	if age < 0 {
		age = 0
	}
	return age <= presenceReconnecting
}

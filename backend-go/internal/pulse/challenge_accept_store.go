package pulse

import (
	"context"
	"errors"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengeaccept"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type challengeAcceptDoc struct {
	ID               string    `bson:"_id"`
	Challenger       string    `bson:"challenger"`
	Opponent         string    `bson:"opponent"`
	ChallengerRating int64     `bson:"challenger_rating"`
	OpponentRating   int64     `bson:"opponent_rating"`
	Status           string    `bson:"status"`
	MatchID          string    `bson:"match_id"`
	CreatedAt        time.Time `bson:"created_at"`
}

func (s *MongoStore) GetChallenge(ctx context.Context, challengeID string) (challengeaccept.Challenge, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row challengeAcceptDoc
	err := s.db.Collection("pvp_challenges").FindOne(queryCtx, bson.M{"_id": challengeID}).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return challengeaccept.Challenge{}, false, nil
	}
	if err != nil {
		return challengeaccept.Challenge{}, false, err
	}
	return challengeaccept.Challenge{
		ID:               row.ID,
		Challenger:       row.Challenger,
		Opponent:         row.Opponent,
		ChallengerRating: row.ChallengerRating,
		OpponentRating:   row.OpponentRating,
		Status:           row.Status,
		MatchID:          row.MatchID,
		CreatedAt:        row.CreatedAt,
	}, true, nil
}

func (s *MongoStore) GetMatch(ctx context.Context, matchID string) (challengeaccept.Match, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row cancelMatchRow
	err := s.db.Collection("pvp_matches").FindOne(
		queryCtx,
		bson.M{"_id": matchID, "acceptance_state": bson.M{"$ne": "staged"}},
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return challengeaccept.Match{}, false, nil
	}
	if err != nil {
		return challengeaccept.Match{}, false, err
	}
	return challengeAcceptDomainMatch(row), true, nil
}

func (s *MongoStore) HasActiveMatch(ctx context.Context, username string) (bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row bson.M
	err := s.db.Collection("pvp_matches").FindOne(
		queryCtx,
		bson.M{
			"status":           bson.M{"$in": bson.A{"starting", "active"}},
			"acceptance_state": bson.M{"$ne": "staged"},
			"$or":              bson.A{bson.M{"white": username}, bson.M{"black": username}},
		},
		options.FindOne().SetProjection(bson.M{"_id": 1}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (s *MongoStore) IsRosterMember(ctx context.Context, username string, now time.Time) (bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row bson.M
	err := s.db.Collection("pvp_roster").FindOne(
		queryCtx,
		bson.M{
			"_id":       username,
			"last_seen": bson.M{"$gte": now.Add(-rosterTTL)},
		},
		options.FindOne().SetProjection(bson.M{"_id": 1}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (s *MongoStore) CommitAcceptance(
	ctx context.Context,
	challengeID string,
	username string,
	match challengeaccept.Match,
	now time.Time,
) (challengeaccept.Match, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	challenges := s.db.Collection("pvp_challenges")
	matches := s.db.Collection("pvp_matches")
	staged := challengeAcceptStagedDocument(match, challengeID)

	if _, err := matches.InsertOne(queryCtx, staged); err != nil {
		if !mongo.IsDuplicateKeyError(err) {
			return challengeaccept.Match{}, false, err
		}
		var canonical bson.M
		err = matches.FindOne(
			queryCtx,
			bson.M{"_id": match.ID, "challenge_id": challengeID},
			options.FindOne().SetProjection(bson.M{"_id": 1}),
		).Decode(&canonical)
		if errors.Is(err, mongo.ErrNoDocuments) {
			return challengeaccept.Match{}, false, errors.New("PvP match id collided with another challenge")
		}
		if err != nil {
			return challengeaccept.Match{}, false, err
		}
	}

	var challenge challengeAcceptDoc
	err := challenges.FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id":        challengeID,
			"status":     "pending",
			"opponent":   username,
			"created_at": bson.M{"$gte": now.Add(-challengeTTL)},
		},
		bson.M{"$set": bson.M{
			"status":      "accepted",
			"resolved_at": now,
			"match_id":    match.ID,
		}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&challenge)
	if errors.Is(err, mongo.ErrNoDocuments) {
		err = challenges.FindOne(
			queryCtx,
			bson.M{
				"_id":      challengeID,
				"status":   "accepted",
				"opponent": username,
				"match_id": match.ID,
			},
		).Decode(&challenge)
	}
	if errors.Is(err, mongo.ErrNoDocuments) {
		_, cleanupErr := matches.DeleteOne(
			queryCtx,
			bson.M{
				"_id":              match.ID,
				"challenge_id":     challengeID,
				"acceptance_state": "staged",
			},
		)
		if cleanupErr != nil {
			return challengeaccept.Match{}, false, cleanupErr
		}
		return challengeaccept.Match{}, false, nil
	}
	if err != nil {
		return challengeaccept.Match{}, false, err
	}

	var activated cancelMatchRow
	err = matches.FindOneAndUpdate(
		queryCtx,
		bson.M{"_id": match.ID, "challenge_id": challengeID},
		bson.M{"$set": bson.M{"acceptance_state": "active"}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&activated)
	if err != nil {
		return challengeaccept.Match{}, false, err
	}
	return challengeAcceptDomainMatch(activated), true, nil
}

func challengeAcceptStagedDocument(match challengeaccept.Match, challengeID string) bson.M {
	return bson.M{
		"_id":              match.ID,
		"white":            match.White,
		"black":            match.Black,
		"white_rating":     match.WhiteRating,
		"black_rating":     match.BlackRating,
		"fen":              match.FEN,
		"turn":             match.Turn,
		"status":           match.Status,
		"result":           match.Result,
		"history":          bson.A{},
		"revision":         match.Revision,
		"rated":            match.Rated,
		"white_clock_ms":   match.WhiteClockMS,
		"black_clock_ms":   match.BlackClockMS,
		"white_ready":      match.WhiteReady,
		"black_ready":      match.BlackReady,
		"start_at":         match.StartAt,
		"ready_deadline":   match.ReadyDeadline,
		"turn_started_at":  match.TurnStartedAt,
		"end_reason":       match.EndReason,
		"created_at":       match.CreatedAt,
		"updated_at":       match.UpdatedAt,
		"challenge_id":     challengeID,
		"acceptance_state": "staged",
	}
}

func challengeAcceptDomainMatch(row cancelMatchRow) challengeaccept.Match {
	rated := true
	if row.Rated != nil {
		rated = *row.Rated
	}
	return challengeaccept.Match{
		ID:            row.ID,
		White:         row.White,
		Black:         row.Black,
		WhiteRating:   pointerInt64(row.WhiteRating, 400),
		BlackRating:   pointerInt64(row.BlackRating, 400),
		FEN:           row.FEN,
		Turn:          row.Turn,
		Status:        row.Status,
		Result:        row.Result,
		Revision:      row.Revision,
		Rated:         rated,
		WhiteClockMS:  pointerInt64(row.WhiteClockMS, challengeaccept.InitialClockMS),
		BlackClockMS:  pointerInt64(row.BlackClockMS, challengeaccept.InitialClockMS),
		WhiteReady:    row.WhiteReady,
		BlackReady:    row.BlackReady,
		StartAt:       challengeAcceptTimePointer(row.StartAt),
		ReadyDeadline: row.ReadyDeadline,
		TurnStartedAt: challengeAcceptTimePointer(row.TurnStartedAt),
		EndReason:     row.EndReason,
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}

func challengeAcceptTimePointer(value time.Time) *time.Time {
	if value.IsZero() {
		return nil
	}
	copy := value
	return &copy
}

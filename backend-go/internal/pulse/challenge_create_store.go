package pulse

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sort"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengecreate"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func (s *MongoStore) RosterMember(ctx context.Context, username string, now time.Time) (challengecreate.Player, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row bson.M
	err := s.db.Collection("pvp_roster").FindOne(
		queryCtx,
		bson.M{"_id": username, "last_seen": bson.M{"$gte": now.Add(-rosterTTL)}},
		options.FindOne().SetProjection(bson.M{"username": 1, "rating": 1}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return challengecreate.Player{}, false, nil
	}
	if err != nil {
		return challengecreate.Player{}, false, err
	}
	return challengecreate.Player{
		Username: username,
		Rating:   normalizedRating(row["rating"]),
	}, true, nil
}

func (s *MongoStore) CooldownUntil(
	ctx context.Context,
	challenger string,
	opponent string,
	now time.Time,
) (time.Time, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row struct {
		CooldownUntil time.Time `bson:"cooldown_until"`
	}
	err := s.db.Collection("pvp_challenges").FindOne(
		queryCtx,
		bson.M{
			"pair_key":       challengePairKey(challenger, opponent),
			"cooldown_until": bson.M{"$gt": now},
		},
		options.FindOne().
			SetProjection(bson.M{"cooldown_until": 1}).
			SetSort(bson.D{{Key: "cooldown_until", Value: -1}}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return time.Time{}, false, nil
	}
	if err != nil {
		return time.Time{}, false, err
	}
	return row.CooldownUntil, !row.CooldownUntil.IsZero(), nil
}

func (s *MongoStore) CreateChallenge(
	ctx context.Context,
	challenge challengecreate.Challenge,
	now time.Time,
) (challengecreate.Challenge, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	challenges := s.db.Collection("pvp_challenges")
	pairKey := challengePairKey(challenge.Challenger, challenge.Opponent)
	cutoff := now.Add(-challengeTTL)

	var existing challengeAcceptDoc
	err := challenges.FindOne(
		queryCtx,
		bson.M{
			"status": "pending",
			"$or": bson.A{
				bson.M{"challenger": challenge.Challenger, "opponent": challenge.Opponent},
				bson.M{"challenger": challenge.Opponent, "opponent": challenge.Challenger},
			},
			"created_at": bson.M{"$gte": cutoff},
		},
	).Decode(&existing)
	if err == nil {
		return challengeCreateDomainRow(existing), false, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return challengecreate.Challenge{}, false, err
	}

	doc := challengeCreateDocument(challenge, pairKey)
	if _, err := challenges.InsertOne(queryCtx, doc); err == nil {
		return challenge, true, nil
	} else if !mongo.IsDuplicateKeyError(err) {
		return challengecreate.Challenge{}, false, err
	}

	var winner challengeAcceptDoc
	if err := challenges.FindOne(
		queryCtx,
		bson.M{"status": "pending", "pair_key": pairKey},
	).Decode(&winner); err != nil {
		return challengecreate.Challenge{}, false, err
	}
	return challengeCreateDomainRow(winner), false, nil
}

func challengePairKey(left, right string) string {
	parts := []string{left, right}
	sort.Strings(parts)
	sum := sha256.Sum256([]byte(parts[0] + "\x00" + parts[1]))
	return hex.EncodeToString(sum[:])
}

func challengeCreateDocument(challenge challengecreate.Challenge, pairKey string) bson.M {
	return bson.M{
		"_id":               challenge.ID,
		"challenger":        challenge.Challenger,
		"opponent":          challenge.Opponent,
		"challenger_rating": challenge.ChallengerRating,
		"opponent_rating":   challenge.OpponentRating,
		"status":            challenge.Status,
		"created_at":        challenge.CreatedAt,
		"pair_key":          pairKey,
	}
}

func challengeCreateDomainRow(row challengeAcceptDoc) challengecreate.Challenge {
	return challengecreate.Challenge{
		ID:               row.ID,
		Challenger:       row.Challenger,
		Opponent:         row.Opponent,
		ChallengerRating: row.ChallengerRating,
		OpponentRating:   row.OpponentRating,
		Status:           row.Status,
		CreatedAt:        row.CreatedAt,
	}
}

var _ challengecreate.Store = (*MongoStore)(nil)

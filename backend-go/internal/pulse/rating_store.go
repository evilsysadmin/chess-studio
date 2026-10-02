package pulse

import (
	"context"
	"errors"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvprating"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func (s *MongoStore) ApplyRating(
	ctx context.Context,
	username string,
	matchID string,
	expected int64,
	next int64,
) (bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	users := s.db.Collection("users")
	result, err := users.UpdateOne(
		queryCtx,
		ratingUpdateFilter(username, matchID, expected),
		ratingUpdateDocument(matchID, next),
	)
	if err != nil {
		return false, err
	}
	if result.MatchedCount > 0 {
		return true, nil
	}

	var current struct {
		LastSettledMatch string `bson:"pvp_last_settled_match"`
	}
	err = users.FindOne(
		queryCtx,
		bson.M{"_id": username},
		options.FindOne().SetProjection(bson.M{"pvp_last_settled_match": 1}),
	).Decode(&current)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return current.LastSettledMatch == matchID, nil
}

func ratingUpdateFilter(username, matchID string, expected int64) bson.M {
	ratingPredicates := bson.A{bson.M{"pvp_rating": pvprating.Normalize(expected)}}
	if pvprating.Normalize(expected) == pvprating.DefaultRating {
		ratingPredicates = append(ratingPredicates, bson.M{"pvp_rating": bson.M{"$exists": false}})
	}
	return bson.M{
		"_id":                    username,
		"pvp_last_settled_match": bson.M{"$ne": matchID},
		"$or":                    ratingPredicates,
	}
}

func ratingUpdateDocument(matchID string, next int64) bson.M {
	return bson.M{
		"$set": bson.M{
			"pvp_rating":             pvprating.Normalize(next),
			"pvp_last_settled_match": matchID,
		},
		"$inc": bson.M{"pvp_rating_games": 1},
	}
}

var _ pvprating.Store = (*MongoStore)(nil)

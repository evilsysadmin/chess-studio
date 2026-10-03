package pulse

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const lobbyChatMaxMessages = 40

type lobbyHeadToHead struct {
	Games        int64
	Wins         int64
	Draws        int64
	Losses       int64
	LastPlayedAt time.Time
}

type lobbySnapshot struct {
	Roster      []rosterRow
	HeadToHead  map[string]lobbyHeadToHead
	Cooldowns   map[string]time.Time
	Challenges  []challengeRow
	ActiveMatch *cancelMatchRow
	Messages    []chatMessageRow
}

type lobbyFinishedMatchRow struct {
	White     string    `bson:"white"`
	Black     string    `bson:"black"`
	Status    string    `bson:"status"`
	Result    string    `bson:"result"`
	CreatedAt time.Time `bson:"created_at"`
	UpdatedAt time.Time `bson:"updated_at"`
}

type lobbyCooldownRow struct {
	PairKey       string    `bson:"pair_key"`
	CooldownUntil time.Time `bson:"cooldown_until"`
}

type lobbyChatDoc struct {
	ID        string    `bson:"_id"`
	Username  string    `bson:"username"`
	Text      string    `bson:"text"`
	Kind      string    `bson:"kind"`
	CreatedAt time.Time `bson:"created_at"`
}

func (s *MongoStore) LobbySnapshot(ctx context.Context, username string, now time.Time) (lobbySnapshot, error) {
	if s == nil || s.db == nil {
		return lobbySnapshot{}, errors.New("lobby store is not configured")
	}
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	roster, rivals, err := s.lobbyRoster(queryCtx, username, now)
	if err != nil {
		return lobbySnapshot{}, err
	}
	headToHead, err := s.lobbyHeadToHead(queryCtx, username, rivals)
	if err != nil {
		return lobbySnapshot{}, err
	}
	cooldowns, err := s.lobbyCooldowns(queryCtx, username, rivals, now)
	if err != nil {
		return lobbySnapshot{}, err
	}
	challenges, err := s.lobbyChallenges(queryCtx, username, now)
	if err != nil {
		return lobbySnapshot{}, err
	}
	activeMatch, err := s.lobbyActiveMatch(queryCtx, username)
	if err != nil {
		return lobbySnapshot{}, err
	}
	messages, err := s.lobbyMessages(queryCtx, now)
	if err != nil {
		return lobbySnapshot{}, err
	}

	return lobbySnapshot{
		Roster:      roster,
		HeadToHead:  headToHead,
		Cooldowns:   cooldowns,
		Challenges:  challenges,
		ActiveMatch: activeMatch,
		Messages:    messages,
	}, nil
}

func (s *MongoStore) lobbyRoster(ctx context.Context, username string, now time.Time) ([]rosterRow, []string, error) {
	cursor, err := s.db.Collection("pvp_roster").Find(
		ctx,
		bson.M{"last_seen": bson.M{"$gte": now.Add(-rosterTTL)}},
		options.Find().SetSort(bson.D{{Key: "rating", Value: -1}, {Key: "username", Value: 1}}),
	)
	if err != nil {
		return nil, nil, err
	}
	defer cursor.Close(ctx)

	rows := make([]rosterRow, 0)
	rivals := make([]string, 0)
	for cursor.Next(ctx) {
		var row rosterRow
		if err := cursor.Decode(&row); err != nil {
			return nil, nil, err
		}
		rows = append(rows, row)
		if row.Username != username {
			rivals = append(rivals, row.Username)
		}
	}
	if err := cursor.Err(); err != nil {
		return nil, nil, err
	}
	return rows, rivals, nil
}

func (s *MongoStore) lobbyHeadToHead(ctx context.Context, username string, rivals []string) (map[string]lobbyHeadToHead, error) {
	if len(rivals) == 0 {
		return map[string]lobbyHeadToHead{}, nil
	}
	cursor, err := s.db.Collection("pvp_matches").Find(
		ctx,
		bson.M{
			"status": "finished",
			"result": bson.M{"$in": bson.A{"1-0", "0-1", "1/2-1/2"}},
			"$or": bson.A{
				bson.M{"white": username, "black": bson.M{"$in": rivals}},
				bson.M{"black": username, "white": bson.M{"$in": rivals}},
			},
		},
		options.Find().SetProjection(bson.M{
			"white": 1, "black": 1, "result": 1, "status": 1,
			"created_at": 1, "updated_at": 1,
		}),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	rows := make([]lobbyFinishedMatchRow, 0)
	for cursor.Next(ctx) {
		var row lobbyFinishedMatchRow
		if err := cursor.Decode(&row); err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	return accumulateLobbyHeadToHead(username, rows), nil
}

func accumulateLobbyHeadToHead(username string, rows []lobbyFinishedMatchRow) map[string]lobbyHeadToHead {
	result := make(map[string]lobbyHeadToHead)
	for _, row := range rows {
		if row.Status != "finished" {
			continue
		}
		opponent := ""
		switch {
		case row.White == username:
			opponent = row.Black
		case row.Black == username:
			opponent = row.White
		default:
			continue
		}
		if opponent == "" {
			continue
		}
		if row.Result != "1-0" && row.Result != "0-1" && row.Result != "1/2-1/2" {
			continue
		}
		record := result[opponent]
		record.Games++
		if row.Result == "1/2-1/2" {
			record.Draws++
		} else {
			userWon := (row.White == username && row.Result == "1-0") ||
				(row.Black == username && row.Result == "0-1")
			if userWon {
				record.Wins++
			} else {
				record.Losses++
			}
		}
		playedAt := row.UpdatedAt
		if playedAt.IsZero() {
			playedAt = row.CreatedAt
		}
		if record.LastPlayedAt.IsZero() || playedAt.After(record.LastPlayedAt) {
			record.LastPlayedAt = playedAt
		}
		result[opponent] = record
	}
	return result
}

func (s *MongoStore) lobbyCooldowns(
	ctx context.Context,
	username string,
	rivals []string,
	now time.Time,
) (map[string]time.Time, error) {
	if len(rivals) == 0 {
		return map[string]time.Time{}, nil
	}
	pairToOpponent := make(map[string]string, len(rivals))
	keys := make([]string, 0, len(rivals))
	for _, rival := range rivals {
		key := challengePairKey(username, rival)
		pairToOpponent[key] = rival
		keys = append(keys, key)
	}

	cursor, err := s.db.Collection("pvp_challenges").Find(
		ctx,
		bson.M{
			"pair_key":       bson.M{"$in": keys},
			"cooldown_until": bson.M{"$gt": now},
		},
		options.Find().SetProjection(bson.M{"pair_key": 1, "cooldown_until": 1}),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	result := make(map[string]time.Time)
	for cursor.Next(ctx) {
		var row lobbyCooldownRow
		if err := cursor.Decode(&row); err != nil {
			return nil, err
		}
		rival := pairToOpponent[row.PairKey]
		if rival == "" || row.CooldownUntil.IsZero() {
			continue
		}
		if previous := result[rival]; previous.IsZero() || row.CooldownUntil.After(previous) {
			result[rival] = row.CooldownUntil
		}
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *MongoStore) lobbyChallenges(ctx context.Context, username string, now time.Time) ([]challengeRow, error) {
	if _, err := s.db.Collection("pvp_challenges").UpdateMany(
		ctx,
		bson.M{"status": "pending", "created_at": bson.M{"$lt": now.Add(-challengeTTL)}},
		bson.M{"$set": bson.M{"status": "expired", "resolved_at": now}},
	); err != nil {
		return nil, err
	}

	cursor, err := s.db.Collection("pvp_challenges").Find(
		ctx,
		bson.M{
			"$or":    bson.A{bson.M{"challenger": username}, bson.M{"opponent": username}},
			"status": bson.M{"$in": bson.A{"pending", "accepted"}},
		},
		options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(24),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	rows := make([]challengeRow, 0)
	for cursor.Next(ctx) {
		var row challengeRow
		if err := cursor.Decode(&row); err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *MongoStore) lobbyActiveMatch(ctx context.Context, username string) (*cancelMatchRow, error) {
	var row cancelMatchRow
	err := s.db.Collection("pvp_matches").FindOne(
		ctx,
		bson.M{
			"status":           bson.M{"$in": bson.A{"starting", "active"}},
			"acceptance_state": bson.M{"$ne": "staged"},
			"$or":              bson.A{bson.M{"white": username}, bson.M{"black": username}},
		},
		options.FindOne().SetSort(bson.D{{Key: "updated_at", Value: -1}}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (s *MongoStore) lobbyMessages(ctx context.Context, now time.Time) ([]chatMessageRow, error) {
	cutoff := now.Add(-lobbyChatTTL)
	collection := s.db.Collection("pvp_lobby_chat")
	if _, err := collection.DeleteMany(ctx, bson.M{"created_at": bson.M{"$lt": cutoff}}); err != nil {
		return nil, err
	}

	cursor, err := collection.Find(
		ctx,
		bson.M{"created_at": bson.M{"$gte": cutoff}},
		options.Find().
			SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}).
			SetLimit(lobbyChatMaxMessages),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	desc := make([]chatMessageRow, 0, lobbyChatMaxMessages)
	for cursor.Next(ctx) {
		var row lobbyChatDoc
		if err := cursor.Decode(&row); err != nil {
			return nil, err
		}
		kind := row.Kind
		if kind == "" {
			kind = "message"
		}
		desc = append(desc, chatMessageRow{
			ID: row.ID, Username: row.Username, Text: row.Text, Kind: kind, CreatedAt: row.CreatedAt,
		})
	}
	if err := cursor.Err(); err != nil {
		return nil, err
	}

	for left, right := 0, len(desc)-1; left < right; left, right = left+1, right-1 {
		desc[left], desc[right] = desc[right], desc[left]
	}
	return desc, nil
}

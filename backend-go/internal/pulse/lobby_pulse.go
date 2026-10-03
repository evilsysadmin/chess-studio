package pulse

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"net/http"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvpclock"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvproute"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type matchRow struct {
	ID                          string    `bson:"_id"`
	White                       string    `bson:"white"`
	Black                       string    `bson:"black"`
	Status                      string    `bson:"status"`
	Turn                        string    `bson:"turn"`
	Revision                    int64     `bson:"revision"`
	WhiteReady                  bool      `bson:"white_ready"`
	BlackReady                  bool      `bson:"black_ready"`
	WhiteClockMS                *int64    `bson:"white_clock_ms"`
	BlackClockMS                *int64    `bson:"black_clock_ms"`
	StartAt                     time.Time `bson:"start_at"`
	ReadyDeadline               time.Time `bson:"ready_deadline"`
	TurnStartedAt               time.Time `bson:"turn_started_at"`
	UpdatedAt                   time.Time `bson:"updated_at"`
	WhiteSeenAt                 time.Time `bson:"white_seen_at"`
	BlackSeenAt                 time.Time `bson:"black_seen_at"`
	WhiteDisconnectGraceStarted time.Time `bson:"white_disconnect_grace_started_at"`
	BlackDisconnectGraceStarted time.Time `bson:"black_disconnect_grace_started_at"`
	Rated                       *bool     `bson:"rated"`
}

type matchPulseState struct {
	Found            bool
	Revision         int64
	Status           string
	LifecycleDue     bool
	OpponentPresence string
}

func (s *MongoStore) Revision(ctx context.Context, username string, now time.Time) (string, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	h := sha256.New()

	if err := s.hashRoster(queryCtx, h, now); err != nil {
		return "", err
	}
	if err := s.hashChallenges(queryCtx, h, username, now); err != nil {
		return "", err
	}
	if err := s.hashActiveMatch(queryCtx, h, username); err != nil {
		return "", err
	}
	if err := s.hashLatestChat(queryCtx, h, now); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil))[:24], nil
}

func (s *MongoStore) MatchState(ctx context.Context, username, matchID string, now time.Time) (matchPulseState, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row matchRow
	err := s.db.Collection("pvp_matches").FindOne(
		queryCtx,
		bson.M{
			"_id":              matchID,
			"acceptance_state": bson.M{"$ne": "staged"},
			"$or":              bson.A{bson.M{"white": username}, bson.M{"black": username}},
		},
		options.FindOne().SetProjection(bson.M{
			"white": 1, "black": 1, "status": 1, "turn": 1, "revision": 1,
			"white_clock_ms": 1, "black_clock_ms": 1, "start_at": 1,
			"ready_deadline": 1, "turn_started_at": 1, "rated": 1,
			"white_seen_at": 1, "black_seen_at": 1,
			"white_disconnect_grace_started_at": 1, "black_disconnect_grace_started_at": 1,
		}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return matchPulseState{}, nil
	}
	if err != nil {
		return matchPulseState{}, err
	}

	playerField := "white"
	seenField := "white_seen_at"
	graceField := "white_disconnect_grace_started_at"
	callerSeen := row.WhiteSeenAt
	opponentSeen := row.BlackSeenAt
	opponentGrace := row.BlackDisconnectGraceStarted
	if row.Black == username {
		playerField = "black"
		seenField = "black_seen_at"
		graceField = "black_disconnect_grace_started_at"
		callerSeen = row.BlackSeenAt
		opponentSeen = row.WhiteSeenAt
		opponentGrace = row.WhiteDisconnectGraceStarted
	}
	result, err := s.db.Collection("pvp_matches").UpdateOne(
		queryCtx,
		bson.M{"_id": matchID, playerField: username, "acceptance_state": bson.M{"$ne": "staged"}},
		bson.M{"$set": bson.M{seenField: now}, "$unset": bson.M{graceField: ""}},
	)
	if err != nil {
		return matchPulseState{}, err
	}
	if result.MatchedCount == 0 {
		return matchPulseState{}, nil
	}

	opponentPresence := matchOpponentPresence(row, opponentSeen, now)
	return matchPulseState{
		Found:            true,
		Revision:         row.Revision,
		Status:           row.Status,
		LifecycleDue:     matchLifecycleDue(row, now) || disconnectLifecycleDue(row, callerSeen, opponentPresence, opponentGrace, now),
		OpponentPresence: opponentPresence,
	}, nil
}

func matchOpponentPresence(row matchRow, seenAt, now time.Time) string {
	// Current unrated PvP matches are the environment-gated synthetic residents
	// and sparring rival. Python pins those actors online as well.
	if row.Rated != nil && !*row.Rated {
		return "online"
	}
	if seenAt.IsZero() {
		return "disconnected"
	}
	age := now.Sub(seenAt)
	if age < 0 {
		age = 0
	}
	if age <= presenceOnline {
		return "online"
	}
	if age <= presenceReconnecting {
		return "reconnecting"
	}
	return "disconnected"
}

func recentlyPresent(seenAt, now time.Time) bool {
	if seenAt.IsZero() {
		return false
	}
	age := now.Sub(seenAt)
	return age >= 0 && age <= presenceReconnecting
}

func disconnectLifecycleDue(row matchRow, callerSeen time.Time, opponentPresence string, opponentGrace, now time.Time) bool {
	if row.Status != "active" || opponentPresence != "disconnected" {
		return false
	}
	// A returning observer asks Python to restart the rival grace window, matching
	// the existing authoritative reconnect contract.
	if !recentlyPresent(callerSeen, now) {
		return true
	}
	if opponentGrace.IsZero() {
		return true
	}
	return !now.Before(opponentGrace.Add(disconnectGrace))
}

func matchLifecycleDue(row matchRow, now time.Time) bool {
	if row.Status == "starting" {
		return !row.ReadyDeadline.IsZero() && !now.Before(row.ReadyDeadline)
	}
	if row.Status != "active" {
		return true
	}
	if row.TurnStartedAt.IsZero() || now.Before(row.TurnStartedAt) {
		return false
	}
	// Same legacy fallback as every other match path: a document without a
	// stored clock has the full initial clock, not zero (which made the pulse
	// report a lifecycle boundary on every poll).
	remainingMS := pvpclock.ClockMS(row.WhiteClockMS)
	if row.Turn == "b" {
		remainingMS = pvpclock.ClockMS(row.BlackClockMS)
	}
	if remainingMS <= 0 {
		return true
	}
	return now.Sub(row.TurnStartedAt) >= time.Duration(remainingMS)*time.Millisecond
}

func (s *MongoStore) hashRoster(ctx context.Context, h hash.Hash, now time.Time) error {
	cursor, err := s.db.Collection("pvp_roster").Find(
		ctx,
		bson.M{"last_seen": bson.M{"$gte": now.Add(-rosterTTL)}},
		options.Find().
			SetProjection(bson.M{"username": 1, "rating": 1, "tier": 1, "joined_at": 1}).
			SetSort(bson.D{{Key: "rating", Value: -1}, {Key: "username", Value: 1}}),
	)
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)
	for cursor.Next(ctx) {
		var row rosterRow
		if err := cursor.Decode(&row); err != nil {
			return err
		}
		fmt.Fprintf(h, "r|%s|%d|%s|%s\n", row.Username, row.Rating, row.Tier, stamp(row.JoinedAt))
	}
	return cursor.Err()
}

func (s *MongoStore) hashChallenges(ctx context.Context, h hash.Hash, username string, now time.Time) error {
	participant := bson.M{"$or": bson.A{
		bson.M{"challenger": username},
		bson.M{"opponent": username},
	}}
	relevant := bson.M{"$or": bson.A{
		bson.M{"status": bson.M{"$in": bson.A{"pending", "accepted"}}},
		bson.M{"cooldown_until": bson.M{"$gt": now}},
	}}
	cursor, err := s.db.Collection("pvp_challenges").Find(
		ctx,
		bson.M{"$and": bson.A{participant, relevant}},
		options.Find().
			SetProjection(bson.M{
				"challenger": 1, "opponent": 1, "status": 1, "match_id": 1,
				"created_at": 1, "resolved_at": 1, "cooldown_until": 1,
			}).
			SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: 1}}),
	)
	if err != nil {
		return err
	}
	defer cursor.Close(ctx)
	cutoff := now.Add(-challengeTTL)
	for cursor.Next(ctx) {
		var row challengeRow
		if err := cursor.Decode(&row); err != nil {
			return err
		}
		if row.Status == "accepted" || (row.Status == "pending" && !row.CreatedAt.Before(cutoff)) {
			fmt.Fprintf(h, "q|%s|%s|%s|%s|%s|%s|%s\n",
				row.ID, row.Challenger, row.Opponent, row.Status, row.MatchID, stamp(row.CreatedAt), stamp(row.ResolvedAt))
		}
		if row.CooldownUntil.After(now) {
			fmt.Fprintf(h, "d|%s|%s|%s|%s\n", row.ID, row.Challenger, row.Opponent, stamp(row.CooldownUntil))
		}
	}
	return cursor.Err()
}

func (s *MongoStore) hashActiveMatch(ctx context.Context, h hash.Hash, username string) error {
	var row matchRow
	err := s.db.Collection("pvp_matches").FindOne(
		ctx,
		bson.M{
			"status":           bson.M{"$in": bson.A{"starting", "active"}},
			"acceptance_state": bson.M{"$ne": "staged"},
			"$or":              bson.A{bson.M{"white": username}, bson.M{"black": username}},
		},
		options.FindOne().
			SetProjection(bson.M{
				"white": 1, "black": 1, "status": 1, "turn": 1, "revision": 1,
				"white_ready": 1, "black_ready": 1, "start_at": 1, "updated_at": 1,
				"white_seen_at": 1, "black_seen_at": 1,
				"white_disconnect_grace_started_at": 1, "black_disconnect_grace_started_at": 1,
			}).
			SetSort(bson.D{{Key: "updated_at", Value: -1}}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		fmt.Fprintln(h, "m|none")
		return nil
	}
	if err != nil {
		return err
	}
	fmt.Fprintf(h, "m|%s|%s|%s|%s|%s|%d|%t|%t|%s|%s|%s|%s|%s|%s\n",
		row.ID, row.White, row.Black, row.Status, row.Turn, row.Revision,
		row.WhiteReady, row.BlackReady, stamp(row.StartAt), stamp(row.UpdatedAt),
		stamp(row.WhiteSeenAt), stamp(row.BlackSeenAt),
		stamp(row.WhiteDisconnectGraceStarted), stamp(row.BlackDisconnectGraceStarted))
	return nil
}

func (s *MongoStore) hashLatestChat(ctx context.Context, h hash.Hash, now time.Time) error {
	var row chatRow
	err := s.db.Collection("pvp_lobby_chat").FindOne(
		ctx,
		bson.M{"created_at": bson.M{"$gte": now.Add(-lobbyChatTTL)}},
		options.FindOne().
			SetProjection(bson.M{"created_at": 1}).
			SetSort(bson.D{{Key: "created_at", Value: -1}, {Key: "_id", Value: -1}}),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		fmt.Fprintln(h, "c|none")
		return nil
	}
	if err != nil {
		return err
	}
	fmt.Fprintf(h, "c|%s|%s\n", row.ID, stamp(row.CreatedAt))
	return nil
}

// servePulse answers the cheap revision polls for the lobby and one match.
func (h *Handler) servePulse(w http.ResponseWriter, r *http.Request, username string, route pvproute.Route, now time.Time) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}

	if route.Kind == pvproute.MatchPulse {
		state, err := h.store.MatchState(r.Context(), username, route.ID, now)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo consultar el pulso de la partida 1v1."})
			return
		}
		if !state.Found {
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"revision":         state.Revision,
			"status":           state.Status,
			"lifecycleDue":     state.LifecycleDue,
			"opponentPresence": state.OpponentPresence,
			"pollAfterMs":      1250,
			"source":           "go",
		})
		return
	}

	revision, err := h.store.Revision(r.Context(), username, now)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo consultar el pulso 1v1."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"revision":    revision,
		"pollAfterMs": h.pollAfterMS,
		"source":      "go",
	})
}

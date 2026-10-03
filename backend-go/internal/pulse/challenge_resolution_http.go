package pulse

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvproute"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

func (s *MongoStore) CancelChallenge(ctx context.Context, challengeID, username string, now time.Time) (challengeRow, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var row challengeRow
	err := s.db.Collection("pvp_challenges").FindOneAndUpdate(
		queryCtx,
		bson.M{
			"_id":        challengeID,
			"status":     "pending",
			"challenger": username,
			"created_at": bson.M{"$gte": now.Add(-challengeTTL)},
		},
		bson.M{"$set": bson.M{
			"status":         "cancelled",
			"resolved_at":    now,
			"cooldown_until": now.Add(challengeCooldown),
		}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&row)
	if err == nil {
		return row, true, nil
	}
	if !errors.Is(err, mongo.ErrNoDocuments) {
		return challengeRow{}, false, err
	}
	err = s.db.Collection("pvp_challenges").FindOne(
		queryCtx,
		bson.M{"_id": challengeID, "status": "cancelled", "challenger": username},
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return challengeRow{}, false, nil
	}
	if err != nil {
		return challengeRow{}, false, err
	}
	return row, true, nil
}

func (s *MongoStore) DeclineChallenge(ctx context.Context, challengeID, username string, now time.Time) (challengeRow, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	var row challengeRow
	err := s.db.Collection("pvp_challenges").FindOneAndUpdate(
		queryCtx,
		bson.M{"_id": challengeID, "status": "pending", "opponent": username},
		bson.M{"$set": bson.M{
			"status":         "declined",
			"resolved_at":    now,
			"cooldown_until": now.Add(challengeCooldown),
		}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return challengeRow{}, false, nil
	}
	if err != nil {
		return challengeRow{}, false, err
	}
	return row, true, nil
}

func publicChallenge(row challengeRow, username string) map[string]any {
	challengerRating := row.ChallengerRating
	if challengerRating == 0 {
		challengerRating = 400
	}
	opponentRating := row.OpponentRating
	if opponentRating == 0 {
		opponentRating = 400
	}
	direction := "outgoing"
	if row.Opponent == username {
		direction = "incoming"
	}
	var matchID any
	if strings.TrimSpace(row.MatchID) != "" {
		matchID = row.MatchID
	}
	return map[string]any{
		"id":               row.ID,
		"challenger":       row.Challenger,
		"opponent":         row.Opponent,
		"challengerRating": challengerRating,
		"opponentRating":   opponentRating,
		"status":           row.Status,
		"direction":        direction,
		"createdAt":        stamp(row.CreatedAt),
		"expiresAt":        stamp(row.CreatedAt.Add(challengeTTL)),
		"resolvedAt":       nullableStamp(row.ResolvedAt),
		"matchId":          matchID,
	}
}

// challengeAction maps a resolution route to the action the handler takes.
func challengeAction(kind pvproute.Kind) string {
	if kind == pvproute.ChallengeDecline {
		return "decline"
	}
	return "cancel"
}

func (h *Handler) serveChallengeResolution(w http.ResponseWriter, r *http.Request, username string, challengeID string, action string, now time.Time) {
	w.Header().Set("X-Chess-Pvp-Native", "challenge-resolution")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}
	var row challengeRow
	var found bool
	var err error
	if action == "cancel" {
		row, found, err = h.store.CancelChallenge(r.Context(), challengeID, username, now)
	} else {
		row, found, err = h.store.DeclineChallenge(r.Context(), challengeID, username, now)
	}
	if err != nil {
		detail := "No se pudo cancelar el reto 1v1."
		if action == "decline" {
			detail = "No se pudo rechazar el reto 1v1."
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": detail})
		return
	}
	if !found {
		detail := "Reto saliente pendiente no encontrado."
		if action == "decline" {
			detail = "Reto pendiente no encontrado."
		}
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": detail})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"challenge": publicChallenge(row, username)})
}

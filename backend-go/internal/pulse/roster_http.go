package pulse

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type rosterRow struct {
	Username string    `bson:"username"`
	Rating   int64     `bson:"rating"`
	Tier     string    `bson:"tier"`
	JoinedAt time.Time `bson:"joined_at"`
}

func (s *MongoStore) JoinRoster(ctx context.Context, username string, now time.Time) (rosterRow, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var user bson.M
	err := s.db.Collection("users").FindOne(
		queryCtx,
		bson.M{"_id": username},
		options.FindOne().SetProjection(bson.M{"pvp_rating": 1}),
	).Decode(&user)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return rosterRow{}, mongo.ErrNoDocuments
	}
	if err != nil {
		return rosterRow{}, err
	}
	rating := normalizedRating(user["pvp_rating"])
	tier := ratingTier(rating)
	payload := bson.M{
		"username":  username,
		"rating":    rating,
		"tier":      tier,
		"last_seen": now,
	}
	_, err = s.db.Collection("pvp_roster").UpdateOne(
		queryCtx,
		bson.M{"_id": username},
		bson.M{"$set": payload, "$setOnInsert": bson.M{"joined_at": now}},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		return rosterRow{}, err
	}
	var row rosterRow
	if err := s.db.Collection("pvp_roster").FindOne(
		queryCtx,
		bson.M{"_id": username},
		options.FindOne().SetProjection(bson.M{"username": 1, "rating": 1, "tier": 1, "joined_at": 1}),
	).Decode(&row); err != nil {
		return rosterRow{}, err
	}
	return row, nil
}

func (s *MongoStore) LeaveRoster(ctx context.Context, username string, now time.Time) error {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	if _, err := s.db.Collection("pvp_roster").DeleteOne(queryCtx, bson.M{"_id": username}); err != nil {
		return err
	}
	_, err := s.db.Collection("pvp_challenges").UpdateMany(
		queryCtx,
		bson.M{
			"status": "pending",
			"$or": bson.A{
				bson.M{"challenger": username},
				bson.M{"opponent": username},
			},
		},
		bson.M{"$set": bson.M{"status": "cancelled", "resolved_at": now}},
	)
	return err
}

func normalizedRating(value any) int64 {
	rating, ok := bsonInteger(value)
	if !ok || rating == 0 {
		rating = 400
	}
	if rating < 100 {
		return 100
	}
	if rating > 10000 {
		return 10000
	}
	return rating
}

func ratingTier(rating int64) string {
	switch {
	case rating <= 699:
		return "Principiante"
	case rating <= 999:
		return "Aficionado"
	case rating <= 1299:
		return "Intermedio"
	case rating <= 1599:
		return "Avanzado"
	case rating <= 1899:
		return "Experto"
	default:
		return "Maestro"
	}
}

func (h *Handler) allowRosterJoin(username string, now time.Time) (bool, int) {
	h.rosterMu.Lock()
	defer h.rosterMu.Unlock()
	window := h.rosterWindows[username]
	if window.start.IsZero() || now.Sub(window.start) >= rosterJoinWindow {
		h.rosterWindows[username] = rateWindow{start: now, count: 1}
		return true, 0
	}
	if window.count >= rosterJoinLimit {
		retry := int(rosterJoinWindow.Seconds() - now.Sub(window.start).Seconds())
		if retry < 1 {
			retry = 1
		}
		return false, retry
	}
	window.count++
	h.rosterWindows[username] = window
	return true, 0
}

func (h *Handler) serveRoster(w http.ResponseWriter, r *http.Request, username string, now time.Time) {
	w.Header().Set("X-Chess-Pvp-Native", "roster")
	switch r.Method {
	case http.MethodPost:
		if allowed, retryAfter := h.allowRosterJoin(username, now); !allowed {
			w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"detail": "Demasiadas actualizaciones de disponibilidad 1v1."})
			return
		}
		member, err := h.store.JoinRoster(r.Context(), username, now)
		if errors.Is(err, mongo.ErrNoDocuments) {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Sesión inválida o expirada. Inicia sesión de nuevo."})
			return
		}
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar el roster 1v1."})
			return
		}
		// Native roster heartbeats are the high-frequency availability owner now.
		// Keep the owner-scoped staging actors alive on the same cadence so their
		// 45 s roster TTL cannot expire between bounded full Python reconciles.
		if h.virtualPlayersEnabled && strings.ToLower(strings.TrimSpace(username)) == h.virtualOwner {
			_ = h.ensureSyntheticRoster(r.Context(), now)
		}
		writeJSON(w, http.StatusOK, map[string]any{"member": map[string]any{
			"username": member.Username,
			"rating":   member.Rating,
			"tier":     member.Tier,
			"joinedAt": stamp(member.JoinedAt),
			"isSelf":   true,
		}})
		return
	case http.MethodDelete:
		if err := h.store.LeaveRoster(r.Context(), username, now); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo abandonar el roster 1v1."})
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	default:
		w.Header().Set("Allow", "POST, DELETE, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}
}

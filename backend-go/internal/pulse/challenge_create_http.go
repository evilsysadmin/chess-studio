package pulse

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengecreate"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type challengeCreateService interface {
	Create(context.Context, string, string) (challengecreate.Result, error)
}

type syntheticRosterProfile struct {
	username string
	rating   int64
}

var residentRosterProfiles = [...]syntheticRosterProfile{
	{username: "otto_falk", rating: 850},
	{username: "marta_stein", rating: 1200},
	{username: "viktor_kraus", rating: 1450},
}

func (s *MongoStore) UpsertSyntheticRoster(ctx context.Context, username string, rating int64, now time.Time) error {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	_, err := s.db.Collection("pvp_roster").UpdateOne(
		queryCtx,
		bson.M{"_id": username},
		bson.M{
			"$set": bson.M{
				"username":  username,
				"rating":    rating,
				"tier":      ratingTier(rating),
				"last_seen": now,
			},
			"$setOnInsert": bson.M{"joined_at": now},
		},
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

func (s *MongoStore) ChallengeSnapshot(ctx context.Context, challengeID string) (challengeRow, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row challengeRow
	err := s.db.Collection("pvp_challenges").FindOne(queryCtx, bson.M{"_id": challengeID}).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return challengeRow{}, false, nil
	}
	if err != nil {
		return challengeRow{}, false, err
	}
	return row, true, nil
}

func (h *Handler) serveChallengeCreate(w http.ResponseWriter, r *http.Request, username string, now time.Time) {
	w.Header().Set("X-Chess-Pvp-Native", "challenge-create")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}

	var payload struct {
		Opponent string `json:"opponent"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	if err := decoder.Decode(&payload); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "Rival inválido."})
		return
	}
	rawLen := len([]rune(payload.Opponent))
	if rawLen < 1 || rawLen > 64 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "Rival inválido."})
		return
	}
	opponent := strings.ToLower(strings.TrimSpace(payload.Opponent))

	virtualTarget, forbidden := h.virtualChallengeTarget(username, opponent)
	if forbidden != "" {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": forbidden})
		return
	}
	if virtualTarget {
		if err := h.ensureSyntheticRoster(r.Context(), now); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo preparar el rival de staging."})
			return
		}
	}

	result, err := h.challengeCreate.Create(r.Context(), username, opponent)
	if err != nil {
		var cooldown challengecreate.CooldownError
		switch {
		case errors.Is(err, challengecreate.ErrSelfChallenge):
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "No puedes retarte a ti mismo."})
		case errors.Is(err, challengecreate.ErrSelfUnavailable):
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "Apúntate al roster antes de retar a otro jugador."})
		case errors.Is(err, challengecreate.ErrOpponentUnavailable):
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ese jugador ya no está disponible en el roster."})
		case errors.Is(err, challengecreate.ErrSelfBusy):
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ya tienes un duelo 1v1 en curso."})
		case errors.Is(err, challengecreate.ErrOpponentBusy):
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ese jugador ya está entrando o jugando otro duelo."})
		case errors.As(err, &cooldown):
			w.Header().Set("Retry-After", fmt.Sprintf("%d", cooldown.RetryAfter))
			writeJSON(w, http.StatusTooManyRequests, map[string]any{
				"detail": fmt.Sprintf("Espera %d s antes de volver a retar a este jugador.", cooldown.RetryAfter),
			})
		default:
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo crear el reto 1v1."})
		}
		return
	}

	row := challengeCreatePublicRow(result.Challenge)
	if result.CreatedNow {
		_ = h.store.AppendLobbySystem(
			r.Context(),
			fmt.Sprintf("%s retó a %s.", username, opponent),
			now,
		)
	}

	if virtualTarget {
		if h.challengeAccept == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo activar el rival de staging."})
			return
		}
		accepted, acceptErr := h.challengeAccept.Accept(r.Context(), result.Challenge.ID, opponent, true)
		if acceptErr != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo aceptar el reto 1v1."})
			return
		}
		if accepted.AcceptedNow {
			_ = h.store.AppendLobbySystem(
				r.Context(),
				fmt.Sprintf("%s aceptó el reto de %s.", opponent, username),
				now,
			)
		}
		virtual := virtualPlayerConfig{
			Enabled:          h.virtualPlayersEnabled,
			Owner:            h.virtualOwner,
			SparringUsername: h.sparringUsername,
		}
		// Python treats this as a handoff reconciliation aid: a storage blip here
		// must not roll back an already-created and accepted challenge.
		_, _, _ = h.store.ReadyMatch(r.Context(), accepted.Match.ID, opponent, now, virtual)
		if snapshot, found, snapshotErr := h.store.ChallengeSnapshot(r.Context(), result.Challenge.ID); snapshotErr == nil && found {
			row = snapshot
		} else {
			row.Status = "accepted"
			row.MatchID = accepted.Match.ID
			row.ResolvedAt = now
		}
	}

	writeJSON(w, http.StatusCreated, map[string]any{"challenge": publicChallenge(row, username)})
}

func (h *Handler) virtualChallengeTarget(username, opponent string) (bool, string) {
	if !h.virtualPlayersEnabled {
		return false, ""
	}
	owner := strings.ToLower(strings.TrimSpace(h.virtualOwner))
	if opponent == strings.ToLower(strings.TrimSpace(h.sparringUsername)) {
		if username != owner {
			return false, "Ese rival de staging no está disponible para esta cuenta."
		}
		return true, ""
	}
	if isResidentUsername(opponent) {
		if username != owner {
			return false, "Ese residente no está disponible para esta cuenta."
		}
		return true, ""
	}
	return false, ""
}

func (h *Handler) ensureSyntheticRoster(ctx context.Context, now time.Time) error {
	profiles := []syntheticRosterProfile{{
		username: strings.ToLower(strings.TrimSpace(h.sparringUsername)),
		rating:   400,
	}}
	profiles = append(profiles, residentRosterProfiles[:]...)
	for _, profile := range profiles {
		if profile.username == "" {
			continue
		}
		if err := h.store.UpsertSyntheticRoster(ctx, profile.username, profile.rating, now); err != nil {
			return err
		}
	}
	return nil
}

func challengeCreatePublicRow(row challengecreate.Challenge) challengeRow {
	return challengeRow{
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

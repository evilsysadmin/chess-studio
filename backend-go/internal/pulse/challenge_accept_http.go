package pulse

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/challengeaccept"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type challengeAcceptService interface {
	Accept(context.Context, string, string, bool) (challengeaccept.Result, error)
}

func (s *MongoStore) GetHandoffMatch(ctx context.Context, matchID string) (cancelMatchRow, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	var row cancelMatchRow
	err := s.db.Collection("pvp_matches").FindOne(
		queryCtx,
		bson.M{"_id": matchID, "acceptance_state": bson.M{"$ne": "staged"}},
	).Decode(&row)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return cancelMatchRow{}, false, nil
	}
	if err != nil {
		return cancelMatchRow{}, false, err
	}
	return row, true, nil
}

func (s *MongoStore) AppendLobbySystem(ctx context.Context, text string, now time.Time) error {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	stampValue := now.UTC()
	sum := sha256.Sum256([]byte("Sistema\x00" + stampValue.Format(time.RFC3339Nano) + "\x00" + text))
	id := hex.EncodeToString(sum[:])[:24]
	_, err := s.db.Collection("pvp_lobby_chat").InsertOne(queryCtx, bson.M{
		"_id":        id,
		"username":   "Sistema",
		"text":       text,
		"kind":       "system",
		"created_at": stampValue,
	})
	if mongo.IsDuplicateKeyError(err) {
		return nil
	}
	return err
}

func (h *Handler) serveChallengeAccept(
	w http.ResponseWriter,
	r *http.Request,
	username string,
	challengeID string,
	now time.Time,
) {
	w.Header().Set("X-Chess-Pvp-Native", "challenge-accept")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}

	result, err := h.challengeAccept.Accept(r.Context(), challengeID, username, false)
	if err != nil {
		switch {
		case errors.Is(err, challengeaccept.ErrChallengeNotFound):
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Reto pendiente no encontrado."})
		case errors.Is(err, challengeaccept.ErrOpponentBusy):
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "El rival ya está entrando o jugando otro duelo."})
		case errors.Is(err, challengeaccept.ErrSelfBusy):
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ya tienes un duelo 1v1 en curso."})
		case errors.Is(err, challengeaccept.ErrOpponentUnavailable):
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "El rival ya no está disponible."})
		case errors.Is(err, challengeaccept.ErrSelfUnavailable):
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ya no figuras en el roster."})
		case errors.Is(err, challengeaccept.ErrChallengeChanged):
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "El reto ya no está disponible."})
		default:
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo aceptar el reto 1v1."})
		}
		return
	}

	row := challengeAcceptPublicRow(result.Match)
	if canonical, found, readErr := h.store.GetHandoffMatch(r.Context(), result.Match.ID); readErr == nil && found {
		row = canonical
	}
	if result.AcceptedNow {
		// The match acceptance is already authoritative. Lobby narration is a
		// secondary side effect and must never turn that success into HTTP 5xx.
		_ = h.store.AppendLobbySystem(
			r.Context(),
			fmt.Sprintf("%s aceptó el reto de %s.", username, result.Challenger),
			now,
		)
	}
	virtual := virtualPlayerConfig{
		Enabled:          h.virtualPlayersEnabled,
		Owner:            h.virtualOwner,
		SparringUsername: h.sparringUsername,
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"match": publicHandoffMatch(row, username, now, virtual),
	})
}

func challengeAcceptPublicRow(match challengeaccept.Match) cancelMatchRow {
	whiteRating := match.WhiteRating
	blackRating := match.BlackRating
	whiteClock := match.WhiteClockMS
	blackClock := match.BlackClockMS
	rated := match.Rated

	var startAt time.Time
	if match.StartAt != nil {
		startAt = *match.StartAt
	}
	var turnStartedAt time.Time
	if match.TurnStartedAt != nil {
		turnStartedAt = *match.TurnStartedAt
	}
	history := make([]bson.M, 0)

	return cancelMatchRow{
		ID:            match.ID,
		White:         match.White,
		Black:         match.Black,
		WhiteRating:   &whiteRating,
		BlackRating:   &blackRating,
		FEN:           match.FEN,
		Turn:          match.Turn,
		Status:        match.Status,
		Result:        match.Result,
		EndReason:     match.EndReason,
		StartAt:       startAt,
		ReadyDeadline: match.ReadyDeadline,
		WhiteReady:    match.WhiteReady,
		BlackReady:    match.BlackReady,
		WhiteClockMS:  &whiteClock,
		BlackClockMS:  &blackClock,
		TurnStartedAt: turnStartedAt,
		Rated:         &rated,
		History:       history,
		Revision:      match.Revision,
		CreatedAt:     match.CreatedAt,
		UpdatedAt:     match.UpdatedAt,
	}
}

var _ challengeaccept.Store = (*MongoStore)(nil)
var _ Store = (*MongoStore)(nil)

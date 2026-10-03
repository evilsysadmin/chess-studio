package pulse

import (
	"context"
	"net/http"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchresign"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pvprating"
)

type matchResignService interface {
	Resign(context.Context, string, string) (matchresign.Match, matchresign.Outcome, error)
}

type ratingSettlementService interface {
	Settle(context.Context, pvprating.Match) (*pvprating.Settlement, error)
}

func (h *Handler) serveMatchResign(
	w http.ResponseWriter,
	r *http.Request,
	username string,
	matchID string,
	now time.Time,
) {
	w.Header().Set("X-Chess-Pvp-Native", "match-resign")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}

	_, outcome, err := h.matchResign.Resign(r.Context(), matchID, username)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
		return
	}

	switch outcome {
	case matchresign.OutcomeNotFound:
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
		return
	case matchresign.OutcomeWrongState:
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "La partida ya ha terminado."})
		return
	case matchresign.OutcomeRevisionConflict:
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "La partida cambió mientras registrábamos la rendición."})
		return
	case matchresign.OutcomeOK:
		// Continue below: the terminal match is already committed.
	default:
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
		return
	}

	row, found, err := h.store.GetHandoffMatch(r.Context(), matchID)
	if err != nil || !found {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo recuperar la partida 1v1 terminada."})
		return
	}

	if h.ratingSettlement != nil {
		if _, err := h.ratingSettlement.Settle(r.Context(), ratingMatchFromRow(row)); err != nil {
			// The match result is durable already. Returning a retryable failure
			// mirrors Python's settlement failure shape; a later authoritative
			// read can finish the idempotent rating settlement.
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "La partida terminó, pero el rating sigue pendiente de liquidar."})
			return
		}
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

func ratingMatchFromRow(row cancelMatchRow) pvprating.Match {
	rated := true
	if row.Rated != nil {
		rated = *row.Rated
	}
	result := ""
	if row.Result != nil {
		result = *row.Result
	}
	return pvprating.Match{
		ID:          row.ID,
		Status:      row.Status,
		Rated:       rated,
		Result:      result,
		White:       row.White,
		Black:       row.Black,
		WhiteRating: pointerInt64(row.WhiteRating, pvprating.DefaultRating),
		BlackRating: pointerInt64(row.BlackRating, pvprating.DefaultRating),
	}
}

func ratingChangePayload(row cancelMatchRow, username string) any {
	match := ratingMatchFromRow(row)
	if !match.Rated || match.Status != "finished" {
		return nil
	}
	isWhite := row.White == username
	if !isWhite && row.Black != username {
		return nil
	}
	whiteAfter, blackAfter, err := pvprating.NextRatings(match.WhiteRating, match.BlackRating, match.Result)
	if err != nil {
		return nil
	}
	before := match.BlackRating
	after := blackAfter
	if isWhite {
		before = match.WhiteRating
		after = whiteAfter
	}
	return map[string]any{
		"before": before,
		"after":  after,
		"delta":  after - before,
	}
}

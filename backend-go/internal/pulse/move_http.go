package pulse

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchmove"
)

type matchMoveStore interface {
	GetMatch(context.Context, string) (matchmove.Match, bool, error)
	Commit(context.Context, string, matchmove.Update) (cancelMatchRow, bool, error)
}

func (h *Handler) serveMatchMove(
	w http.ResponseWriter,
	r *http.Request,
	username string,
	matchID string,
	now time.Time,
) {
	w.Header().Set("X-Chess-Pvp-Native", "match-move")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}
	if allowed, retryAfter := h.allowMatchMove(username, now); !allowed {
		w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"detail": "Demasiadas jugadas 1v1."})
		return
	}

	request, ok := decodeMatchMoveRequest(w, r)
	if !ok {
		return
	}

	virtual := virtualPlayerConfig{
		Enabled:          h.virtualPlayersEnabled,
		Owner:            h.virtualOwner,
		SparringUsername: h.sparringUsername,
	}

	for attempt := 0; attempt < 3; attempt++ {
		snapshot, found, err := h.matchMoveStore.GetMatch(r.Context(), matchID)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo leer la partida 1v1."})
			return
		}
		if !found || !moveParticipant(snapshot, username) {
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
			return
		}
		if snapshot.Status != "active" {
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "La partida ya ha terminado."})
			return
		}
		if residentOpponent(snapshot, username) {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"detail": "El movimiento nativo contra residentes aún no está disponible.",
			})
			return
		}

		lifecycleNow := h.now().UTC()
		row, observerWasLive, found, err := h.matchReadStore.ReadMatchAndTouchPresence(
			r.Context(), matchID, username, lifecycleNow,
		)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la presencia del duelo."})
			return
		}
		if !found {
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
			return
		}

		if _, _, err := h.matchTimeout.FinishIfExpired(r.Context(), matchID); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo reconciliar el reloj del duelo."})
			return
		}
		row, found, err = h.matchReadStore.GetHandoffMatch(r.Context(), matchID)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo releer la partida 1v1."})
			return
		}
		if !found {
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
			return
		}

		if row.Status == "active" {
			opponentVirtual := virtualOpponentUsername(row, username, virtual) != ""
			if _, _, err := h.matchDisconnect.Apply(
				r.Context(), matchID, username, observerWasLive, opponentVirtual,
			); err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo reconciliar la presencia del duelo."})
				return
			}
			row, found, err = h.matchReadStore.GetHandoffMatch(r.Context(), matchID)
			if err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo releer la partida 1v1."})
				return
			}
			if !found {
				writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
				return
			}
		}

		if row.Status == "finished" {
			if !h.settleMoveMatch(w, r, row) {
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"match": publicHandoffMatch(row, username, lifecycleNow, virtual),
			})
			return
		}

		moveNow := h.now().UTC()
		update, prepareErr := matchmove.Prepare(
			moveDomainMatch(row),
			username,
			request,
			moveNow,
		)
		if prepareErr != nil {
			if errors.Is(prepareErr, matchmove.ErrClockExpired) {
				if _, _, timeoutErr := h.matchTimeout.FinishIfExpired(r.Context(), matchID); timeoutErr != nil {
					writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo agotar el reloj del duelo."})
					return
				}
				current, currentFound, readErr := h.matchReadStore.GetHandoffMatch(r.Context(), matchID)
				if readErr != nil {
					writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo releer la partida 1v1."})
					return
				}
				if currentFound && current.Status == "finished" {
					if !h.settleMoveMatch(w, r, current) {
						return
					}
					writeJSON(w, http.StatusOK, map[string]any{
						"match": publicHandoffMatch(current, username, moveNow, virtual),
					})
					return
				}
				continue
			}
			writeMovePrepareError(w, prepareErr)
			return
		}

		updated, committed, err := h.matchMoveStore.Commit(r.Context(), matchID, update)
		if err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la partida 1v1."})
			return
		}
		if !committed {
			continue
		}
		if updated.Status == "finished" && !h.settleMoveMatch(w, r, updated) {
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"match": publicHandoffMatch(updated, username, moveNow, virtual),
		})
		return
	}

	writeJSON(w, http.StatusConflict, map[string]any{
		"detail": "La posición cambió mientras enviabas la jugada. Actualiza e inténtalo de nuevo.",
	})
}

func (h *Handler) settleMoveMatch(w http.ResponseWriter, r *http.Request, row cancelMatchRow) bool {
	if h.ratingSettlement == nil {
		return true
	}
	if _, err := h.ratingSettlement.Settle(r.Context(), ratingMatchFromRow(row)); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"detail": "La partida terminó, pero el rating sigue pendiente de liquidar.",
		})
		return false
	}
	return true
}

func decodeMatchMoveRequest(w http.ResponseWriter, r *http.Request) (matchmove.Request, bool) {
	var payload struct {
		From      string  `json:"from"`
		To        string  `json:"to"`
		Promotion *string `json:"promotion"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	if err := decoder.Decode(&payload); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "Jugada inválida."})
		return matchmove.Request{}, false
	}
	if !validMoveSquare(payload.From) || !validMoveSquare(payload.To) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "Jugada inválida."})
		return matchmove.Request{}, false
	}
	promotion := ""
	if payload.Promotion != nil {
		promotion = strings.TrimSpace(*payload.Promotion)
		if len(promotion) != 1 || !strings.Contains("qrbnQRBN", promotion) {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "Promoción inválida."})
			return matchmove.Request{}, false
		}
	}
	return matchmove.Request{From: payload.From, To: payload.To, Promotion: promotion}, true
}

func validMoveSquare(value string) bool {
	return len(value) == 2 &&
		value[0] >= 'a' && value[0] <= 'h' &&
		value[1] >= '1' && value[1] <= '8'
}

func moveParticipant(match matchmove.Match, username string) bool {
	username = strings.ToLower(strings.TrimSpace(username))
	return username == strings.ToLower(strings.TrimSpace(match.White)) ||
		username == strings.ToLower(strings.TrimSpace(match.Black))
}

func residentOpponent(match matchmove.Match, username string) bool {
	username = strings.ToLower(strings.TrimSpace(username))
	opponent := match.Black
	if username == strings.ToLower(strings.TrimSpace(match.Black)) {
		opponent = match.White
	}
	return isResidentUsername(strings.ToLower(strings.TrimSpace(opponent)))
}

func writeMovePrepareError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, matchmove.ErrNotParticipant):
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
	case errors.Is(err, matchmove.ErrWrongState):
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "La partida ya ha terminado."})
	case errors.Is(err, matchmove.ErrWrongTurn):
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "No es tu turno."})
	case errors.Is(err, matchmove.ErrCountdown):
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "El duelo todavía está en la cuenta atrás."})
	case errors.Is(err, matchmove.ErrInvalidMove):
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "Jugada inválida."})
	case errors.Is(err, matchmove.ErrIllegalMove):
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "Jugada ilegal."})
	case errors.Is(err, matchmove.ErrInvalidPosition):
		writeJSON(w, http.StatusInternalServerError, map[string]any{"detail": "La posición persistida del duelo no es válida."})
	default:
		writeJSON(w, http.StatusInternalServerError, map[string]any{"detail": "No se pudo validar la jugada 1v1."})
	}
}

func matchMoveID(path string) (string, bool) {
	const prefix = "/api/pvp/matches/"
	const suffix = "/move"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	matchID := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	matchID = strings.Trim(matchID, "/")
	if matchID == "" || strings.Contains(matchID, "/") {
		return "", false
	}
	return matchID, true
}

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

type residentMoveOracle interface {
	Move(context.Context, string, string) (string, error)
}

var errResidentReplyConflict = errors.New("resident reply revision conflict")

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
		if residentOpponent(snapshot, username) && h.residentMoveOracle == nil {
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
		if updated.Status == "active" && residentTurnUsername(updated) != "" {
			replied, replyErr := h.playResidentReply(r.Context(), updated)
			if replied.ID != "" {
				updated = replied
			}
			if replyErr != nil {
				// The human move is already authoritative. Do not turn a
				// successful CAS into a stale client error; a later full read
				// can reconcile the pending resident turn.
				w.Header().Set("X-Chess-Pvp-Resident-Pending", "1")
			}
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

func (h *Handler) playResidentReply(ctx context.Context, row cancelMatchRow) (cancelMatchRow, error) {
	for attempt := 0; attempt < 3; attempt++ {
		resident := residentTurnUsername(row)
		if row.Status != "active" || resident == "" {
			return row, nil
		}
		if h.residentMoveOracle == nil {
			return row, errors.New("resident move oracle is not configured")
		}

		uci, err := h.residentMoveOracle.Move(ctx, row.FEN, resident)
		if err != nil {
			return row, err
		}
		request, err := moveRequestFromUCI(uci)
		if err != nil {
			return row, err
		}

		now := h.now().UTC()
		update, err := matchmove.Prepare(moveDomainMatch(row), resident, request, now)
		if errors.Is(err, matchmove.ErrClockExpired) {
			if h.matchTimeout == nil {
				return row, err
			}
			if _, _, timeoutErr := h.matchTimeout.FinishIfExpired(ctx, row.ID); timeoutErr != nil {
				return row, timeoutErr
			}
			current, found, readErr := h.matchReadStore.GetHandoffMatch(ctx, row.ID)
			if readErr != nil {
				return row, readErr
			}
			if found {
				return current, nil
			}
			return row, nil
		}
		if err != nil {
			return row, err
		}

		updated, committed, err := h.matchMoveStore.Commit(ctx, row.ID, update)
		if err != nil {
			return row, err
		}
		if committed {
			return updated, nil
		}

		current, found, err := h.matchReadStore.GetHandoffMatch(ctx, row.ID)
		if err != nil {
			return row, err
		}
		if !found {
			return row, nil
		}
		row = current
	}
	return row, errResidentReplyConflict
}

func residentTurnUsername(row cancelMatchRow) string {
	if row.Status != "active" {
		return ""
	}
	username := row.White
	if row.Turn == "b" {
		username = row.Black
	}
	username = strings.ToLower(strings.TrimSpace(username))
	if !isResidentUsername(username) {
		return ""
	}
	return username
}

func moveRequestFromUCI(uci string) (matchmove.Request, error) {
	uci = strings.ToLower(strings.TrimSpace(uci))
	if len(uci) != 4 && len(uci) != 5 {
		return matchmove.Request{}, matchmove.ErrInvalidMove
	}
	from, to := uci[:2], uci[2:4]
	if !validMoveSquare(from) || !validMoveSquare(to) {
		return matchmove.Request{}, matchmove.ErrInvalidMove
	}
	promotion := ""
	if len(uci) == 5 {
		promotion = uci[4:]
		if !strings.Contains("qrbn", promotion) {
			return matchmove.Request{}, matchmove.ErrInvalidMove
		}
	}
	return matchmove.Request{From: from, To: to, Promotion: promotion}, nil
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

func (h *Handler) allowMatchMove(username string, now time.Time) (bool, int) {
	h.matchMoveMu.Lock()
	defer h.matchMoveMu.Unlock()
	window := h.matchMoveWindows[username]
	if window.start.IsZero() || now.Sub(window.start) >= time.Minute {
		h.matchMoveWindows[username] = rateWindow{start: now, count: 1}
		return true, 0
	}
	if window.count >= 45 {
		retry := int(time.Minute.Seconds() - now.Sub(window.start).Seconds())
		if retry < 1 {
			retry = 1
		}
		return false, retry
	}
	window.count++
	h.matchMoveWindows[username] = window
	return true, 0
}

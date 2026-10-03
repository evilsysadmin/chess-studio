package pulse

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchdisconnect"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchtimeout"
)

type matchReadStore interface {
	ReadMatchAndTouchPresence(context.Context, string, string, time.Time) (cancelMatchRow, bool, bool, error)
	MarkVirtualReady(context.Context, string, string, time.Time) (cancelMatchRow, bool, error)
	FinishReadHandoffTimeout(context.Context, string, int64, time.Time) (cancelMatchRow, bool, error)
	GetHandoffMatch(context.Context, string) (cancelMatchRow, bool, error)
}

type matchTimeoutService interface {
	FinishIfExpired(context.Context, string) (matchtimeout.Match, matchtimeout.Outcome, error)
}

type matchDisconnectService interface {
	Apply(context.Context, string, string, bool, bool) (matchdisconnect.Match, matchdisconnect.Outcome, error)
}

func (h *Handler) serveMatchRead(
	w http.ResponseWriter,
	r *http.Request,
	username string,
	matchID string,
	now time.Time,
) {
	w.Header().Set("X-Chess-Pvp-Native", "match-read")
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}
	if allowed, retryAfter := h.allowMatchRead(username, now); !allowed {
		w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"detail": "Demasiadas consultas de la partida 1v1."})
		return
	}
	if h.matchReadStore == nil || h.matchTimeout == nil || h.matchDisconnect == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "La lectura nativa de la partida 1v1 no está disponible."})
		return
	}

	row, observerWasLive, found, err := h.matchReadStore.ReadMatchAndTouchPresence(
		r.Context(), matchID, username, now,
	)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo leer la partida 1v1."})
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
		return
	}

	virtual := virtualPlayerConfig{
		Enabled:          h.virtualPlayersEnabled,
		Owner:            h.virtualOwner,
		SparringUsername: h.sparringUsername,
	}

	if row.Status == "starting" {
		if virtualUsername := virtualOpponentUsername(row, username, virtual); virtualUsername != "" {
			var updated cancelMatchRow
			var virtualFound bool
			var virtualErr error
			for attempt := 0; attempt < 3; attempt++ {
				updated, virtualFound, virtualErr = h.matchReadStore.MarkVirtualReady(
					r.Context(), matchID, virtualUsername, now,
				)
				if virtualErr == nil {
					break
				}
				if attempt < 2 {
					time.Sleep(time.Duration(attempt+1) * 120 * time.Millisecond)
				}
			}
			if virtualErr != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo sincronizar el rival virtual."})
				return
			}
			if !virtualFound {
				writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
				return
			}
			row = updated
		}

		if row.Status == "starting" && !row.ReadyDeadline.IsZero() && !row.ReadyDeadline.After(now) {
			if updated, changed, timeoutErr := h.matchReadStore.FinishReadHandoffTimeout(
				r.Context(), matchID, row.Revision, now,
			); timeoutErr != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo actualizar la entrada al duelo."})
				return
			} else if changed {
				row = updated
			} else if canonical, currentFound, readErr := h.matchReadStore.GetHandoffMatch(r.Context(), matchID); readErr != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo releer la partida 1v1."})
				return
			} else if !currentFound {
				writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
				return
			} else {
				row = canonical
			}
		}
	}

	if row.Status == "active" {
		if _, _, err := h.matchTimeout.FinishIfExpired(r.Context(), matchID); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo reconciliar el reloj del duelo."})
			return
		}
		canonical, currentFound, readErr := h.matchReadStore.GetHandoffMatch(r.Context(), matchID)
		if readErr != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo releer la partida 1v1."})
			return
		}
		if !currentFound {
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
			return
		}
		row = canonical

		if row.Status == "active" {
			opponentVirtual := virtualOpponentUsername(row, username, virtual) != ""
			if _, _, err := h.matchDisconnect.Apply(
				r.Context(), matchID, username, observerWasLive, opponentVirtual,
			); err != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo reconciliar la presencia del duelo."})
				return
			}
			canonical, currentFound, readErr = h.matchReadStore.GetHandoffMatch(r.Context(), matchID)
			if readErr != nil {
				writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo releer la partida 1v1."})
				return
			}
			if !currentFound {
				writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida 1v1 no encontrada."})
				return
			}
			row = canonical
		}
	}

	if row.Status == "active" && residentTurnUsername(row) != "" &&
		h.residentMoveOracle != nil && h.matchMoveStore != nil {
		replied, replyErr := h.playResidentReply(r.Context(), row)
		if replied.ID != "" {
			row = replied
		}
		if replyErr != nil {
			w.Header().Set("X-Chess-Pvp-Resident-Pending", "1")
		}
	}

	if row.Status == "finished" && h.ratingSettlement != nil {
		if _, err := h.ratingSettlement.Settle(r.Context(), ratingMatchFromRow(row)); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "La partida terminó, pero el rating sigue pendiente de liquidar."})
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"match":       publicHandoffMatch(row, username, now, virtual),
		"pollAfterMs": 1250,
	})
}

func (h *Handler) allowMatchRead(username string, now time.Time) (bool, int) {
	h.matchReadMu.Lock()
	defer h.matchReadMu.Unlock()
	window := h.matchReadWindows[username]
	if window.start.IsZero() || now.Sub(window.start) >= time.Minute {
		h.matchReadWindows[username] = rateWindow{start: now, count: 1}
		return true, 0
	}
	if window.count >= 60 {
		retry := int(time.Minute.Seconds() - now.Sub(window.start).Seconds())
		if retry < 1 {
			retry = 1
		}
		return false, retry
	}
	window.count++
	h.matchReadWindows[username] = window
	return true, 0
}

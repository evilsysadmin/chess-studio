package pulse

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type chatRow struct {
	ID        string    `bson:"_id"`
	CreatedAt time.Time `bson:"created_at"`
}

type chatMessageRow struct {
	ID        string
	Username  string
	Text      string
	Kind      string
	CreatedAt time.Time
}

func (s *MongoStore) AppendLobbyChat(ctx context.Context, username, text string, now time.Time) (chatMessageRow, error) {
	queryCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	stampValue := now.UTC()
	sum := sha256.Sum256([]byte(username + "\x00" + stampValue.Format(time.RFC3339Nano) + "\x00" + text))
	id := hex.EncodeToString(sum[:])[:24]
	row := chatMessageRow{ID: id, Username: username, Text: text, Kind: "message", CreatedAt: stampValue}
	_, err := s.db.Collection("pvp_lobby_chat").InsertOne(queryCtx, bson.M{
		"_id":        id,
		"username":   username,
		"text":       text,
		"kind":       "message",
		"created_at": stampValue,
	})
	if err != nil {
		return chatMessageRow{}, err
	}
	return row, nil
}

func (h *Handler) allowLobbyChat(username string, now time.Time) (bool, int) {
	h.chatMu.Lock()
	defer h.chatMu.Unlock()
	window := h.chatWindows[username]
	if window.start.IsZero() || now.Sub(window.start) >= lobbyChatWindow {
		h.chatWindows[username] = rateWindow{start: now, count: 1}
		return true, 0
	}
	if window.count >= lobbyChatLimit {
		retry := int(lobbyChatWindow.Seconds() - now.Sub(window.start).Seconds())
		if retry < 1 {
			retry = 1
		}
		return false, retry
	}
	window.count++
	h.chatWindows[username] = window
	return true, 0
}

func (h *Handler) serveLobbyChat(w http.ResponseWriter, r *http.Request, username string, now time.Time) {
	w.Header().Set("X-Chess-Pvp-Native", "lobby-chat")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST, OPTIONS")
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "Método no permitido."})
		return
	}
	if allowed, retryAfter := h.allowLobbyChat(username, now); !allowed {
		w.Header().Set("Retry-After", fmt.Sprintf("%d", retryAfter))
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"detail": "Demasiados mensajes 1v1."})
		return
	}
	var payload struct {
		Text string `json:"text"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	if err := decoder.Decode(&payload); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "Mensaje inválido."})
		return
	}
	rawLen := len([]rune(payload.Text))
	if rawLen < 1 || rawLen > 240 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "El mensaje debe tener entre 1 y 240 caracteres."})
		return
	}
	text := strings.Join(strings.Fields(payload.Text), " ")
	if text == "" {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": "El mensaje está vacío."})
		return
	}
	row, err := h.store.AppendLobbyChat(r.Context(), username, text, now)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "No se pudo publicar el mensaje 1v1."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"message": map[string]any{
		"id": row.ID, "username": row.Username, "text": row.Text, "kind": row.Kind,
		"createdAt": stamp(row.CreatedAt), "isSelf": true,
	}})
}

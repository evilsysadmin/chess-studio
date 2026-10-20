package gamesapi

// Ordered JSON decoding is shared by the active Admin Feedback and Admin
// Users endpoints. It must not live in the retired Chronicles HTTP handler.
import (
	"net/http"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// decodeOrderedBody is decodeModelBody keeping the object's key order.
func decodeOrderedBody(w http.ResponseWriter, r *http.Request, raw []byte) (any, bool) {
	if _, ok := decodeModelBody(w, r, raw); !ok {
		return nil, false
	}
	if len(raw) == 0 {
		return nil, true
	}
	if !jsonContentType(r.Header.Get("Content-Type")) {
		return string(raw), true
	}
	body, err := pydoc.Decode(raw)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": []map[string]any{{"type": "json_invalid", "loc": []any{"body", 0}, "msg": "JSON decode error"}}})
		return nil, false
	}
	return body, true
}

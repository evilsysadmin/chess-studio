package gameops

import (
	"crypto/sha1"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

var (
	ErrInvalidKey  = errors.New("invalid idempotency key")
	ErrConflict    = errors.New("idempotent operation reused with different data")
	ErrInvalidBody = errors.New("invalid request body")
)

// HTTP details exactly as Python returns them.
const (
	InvalidKeyDetail = "Idempotency-Key inválida."
	ConflictDetail   = "La misma operación idempotente se reutilizó con datos distintos."
)

// MaxOperationLedger mirrors MAX_OPERATION_LEDGER.
const MaxOperationLedger = 16

var keyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{8,96}$`)

// pyStrip is Python str.strip(): Unicode whitespace plus \x1c-\x1f, which
// Python treats as whitespace and Go's unicode.IsSpace does not.
func pyStrip(s string) string {
	return strings.TrimFunc(s, func(r rune) bool {
		return unicode.IsSpace(r) || (r >= 0x1c && r <= 0x1f)
	})
}

// NormalizeKey mirrors normalize_idempotency_key: nil when absent.
func NormalizeKey(raw *string) (*string, error) {
	if raw == nil {
		return nil, nil
	}
	key := pyStrip(*raw)
	if !keyPattern.MatchString(key) {
		return nil, ErrInvalidKey
	}
	return &key, nil
}

// Fingerprint mirrors operation_fingerprint.
func Fingerprint(payload map[string]any) (string, error) {
	canonical, err := pyJSON(payload)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(canonical))
	return hex.EncodeToString(sum[:]), nil
}

// UndoFingerprint is the fingerprint of an undo on a game.
func UndoFingerprint(gameID string) (string, error) {
	return Fingerprint(map[string]any{"gameId": gameID, "kind": "undo"})
}

var idempotencyNamespace = mustUUID("9d10b931-a0b6-4a59-bd1c-816b8797e474")

func mustUUID(s string) [16]byte {
	var out [16]byte
	raw, err := hex.DecodeString(strings.ReplaceAll(s, "-", ""))
	if err != nil || len(raw) != 16 {
		panic("bad uuid")
	}
	copy(out[:], raw)
	return out
}

// DeterministicGameID mirrors deterministic_game_id: uuid5(namespace, "user:key").
func DeterministicGameID(username, key string) string {
	h := sha1.New()
	h.Write(idempotencyNamespace[:])
	h.Write([]byte(username + ":" + key))
	sum := h.Sum(nil)
	sum[6] = (sum[6] & 0x0f) | 0x50
	sum[8] = (sum[8] & 0x3f) | 0x80
	x := hex.EncodeToString(sum[:16])
	return x[0:8] + "-" + x[8:12] + "-" + x[12:16] + "-" + x[16:20] + "-" + x[20:32]
}

// Operation is one ledger row stored on the game document.
type Operation struct {
	Key         string `bson:"key" json:"key"`
	Kind        string `bson:"kind" json:"kind"`
	Fingerprint string `bson:"fingerprint" json:"fingerprint"`
}

// Replay mirrors operation_replay: true when this exact operation already
// happened, ErrConflict when the key was used for something else.
func Replay(ledger []Operation, key *string, fingerprint, kind string) (bool, error) {
	if key == nil || *key == "" {
		return false, nil
	}
	for i := len(ledger) - 1; i >= 0; i-- {
		op := ledger[i]
		if op.Key != *key {
			continue
		}
		if op.Kind != kind || op.Fingerprint != fingerprint {
			return false, ErrConflict
		}
		return true, nil
	}
	return false, nil
}

// Remember mirrors remember_operation and returns the new ledger.
func Remember(ledger []Operation, key *string, fingerprint, kind string) []Operation {
	if key == nil || *key == "" {
		return ledger
	}
	out := make([]Operation, 0, len(ledger)+1)
	for _, op := range ledger {
		if op.Key != *key {
			out = append(out, op)
		}
	}
	out = append(out, Operation{Key: *key, Kind: kind, Fingerprint: fingerprint})
	if len(out) > MaxOperationLedger {
		out = out[len(out)-MaxOperationLedger:]
	}
	return out
}

// NewGameRequest mirrors api_models.NewGameRequest after pydantic
// validation. Payload is what model_dump(by_alias=True) would hash.
type NewGameRequest struct {
	Difficulty  float64
	Color       string
	Handicap    *string
	StartingFEN *string
	Payload     map[string]any
}

// ParseNewGameRequest decodes a JSON body with pydantic's lax rules for the
// fields NewGameRequest declares. Unknown fields are ignored.
func ParseNewGameRequest(body []byte) (NewGameRequest, error) {
	raw := map[string]json.RawMessage{}
	if len(strings.TrimSpace(string(body))) > 0 {
		if err := json.Unmarshal(body, &raw); err != nil {
			return NewGameRequest{}, ErrInvalidBody
		}
	}
	req := NewGameRequest{Difficulty: 50, Color: "w"}
	// pydantic does not validate defaults: an absent difficulty stays the int
	// 50 in model_dump, a present one becomes a float. They hash differently.
	var difficulty any = PyInt(50)
	if v, ok := raw["difficulty"]; ok {
		f, err := laxFloat(v)
		if err != nil {
			return NewGameRequest{}, err
		}
		req.Difficulty = f
		difficulty = f
	}
	if v, ok := raw["color"]; ok {
		if err := json.Unmarshal(v, &req.Color); err != nil {
			return NewGameRequest{}, ErrInvalidBody
		}
	}
	var err error
	if req.Handicap, err = optionalString(raw, "handicap", 16); err != nil {
		return NewGameRequest{}, err
	}
	if req.StartingFEN, err = optionalString(raw, "startingFen", 128); err != nil {
		return NewGameRequest{}, err
	}
	req.Payload = map[string]any{
		"difficulty":  difficulty,
		"color":       req.Color,
		"handicap":    stringOrNil(req.Handicap),
		"startingFen": stringOrNil(req.StartingFEN),
	}
	return req, nil
}

// MoveRequest mirrors api_models.MoveRequest.
type MoveRequest struct {
	From      string
	To        string
	Promotion *string
	Payload   map[string]any
}

func ParseMoveRequest(body []byte) (MoveRequest, error) {
	raw := map[string]json.RawMessage{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return MoveRequest{}, ErrInvalidBody
	}
	var req MoveRequest
	for field, target := range map[string]*string{"from": &req.From, "to": &req.To} {
		v, ok := raw[field]
		if !ok || json.Unmarshal(v, target) != nil || len([]rune(*target)) != 2 {
			return MoveRequest{}, ErrInvalidBody
		}
	}
	var err error
	if req.Promotion, err = optionalString(raw, "promotion", 1); err != nil {
		return MoveRequest{}, err
	}
	req.Payload = map[string]any{"from": req.From, "to": req.To, "promotion": stringOrNil(req.Promotion)}
	return req, nil
}

func optionalString(raw map[string]json.RawMessage, field string, maxLen int) (*string, error) {
	v, ok := raw[field]
	if !ok || string(v) == "null" {
		return nil, nil
	}
	var s string
	if err := json.Unmarshal(v, &s); err != nil || len([]rune(s)) > maxLen {
		return nil, ErrInvalidBody
	}
	return &s, nil
}

func stringOrNil(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}

// laxFloat mirrors pydantic v2 lax float coercion for JSON input: numbers,
// numeric strings and booleans.
func laxFloat(raw json.RawMessage) (float64, error) {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return 0, ErrInvalidBody
	}
	switch x := v.(type) {
	case float64:
		return x, nil
	case bool:
		if x {
			return 1, nil
		}
		return 0, nil
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		if err != nil {
			return 0, ErrInvalidBody
		}
		return f, nil
	default:
		return 0, fmt.Errorf("%w: difficulty", ErrInvalidBody)
	}
}

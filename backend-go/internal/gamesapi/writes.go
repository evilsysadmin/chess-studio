package gamesapi

// Native write routes of games against the CPU, mirroring game_api.py:
//
//	POST /api/games/{game_id}/move  play_move
//	POST /api/games/{game_id}/undo  undo
//
// Both keep Python's order of checks (body limit, session, body validation,
// ownership, Idempotency-Key, replay, rules), its idempotent ledger and its
// CAS on the SAN history, so a retry or a race resolves the same way whether
// it lands on Python or Go. Matthias' reply comes from residentmove's port of
// get_factual_difficulty_cpu_move.

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	chess "github.com/corentings/chess/v2"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamecore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gameops"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamestore"
)

// Route patterns of the write routes (telemetry http.route).
const (
	MovePattern = "/api/games/{game_id}/move"
	UndoPattern = "/api/games/{game_id}/undo"
)

// MaxRequestBodyBytes mirrors main.MAX_REQUEST_BODY_BYTES.
const MaxRequestBodyBytes = 1 << 20

// WriteRoute reports whether a request is a native write route.
func WriteRoute(r *http.Request) (pattern, gameID string, ok bool) {
	rest, found := strings.CutPrefix(r.URL.Path, "/api/games/")
	if !found {
		return "", "", false
	}
	slash := strings.LastIndex(rest, "/")
	if slash <= 0 {
		return "", "", false
	}
	rawID, action := rest[:slash], rest[slash+1:]
	if strings.Contains(rawID, "/") {
		return "", "", false
	}
	switch action {
	case "move":
		pattern = MovePattern
	case "undo":
		pattern = UndoPattern
	default:
		return "", "", false
	}
	switch r.Method {
	case http.MethodPost:
	case http.MethodOptions:
		if preflightMethod(r) != http.MethodPost {
			return "", "", false
		}
	default:
		return "", "", false
	}
	id, err := url.PathUnescape(rawID)
	if err != nil {
		return "", "", false
	}
	return pattern, id, true
}

// WriteStore is the part of gamestore the write routes need.
type WriteStore interface {
	GetDocumentForOwner(ctx context.Context, id, owner string) (bson.M, bool, error)
	UpdateIfMoves(ctx context.Context, id string, game gamestore.Game, expectedMoves []string) (bool, error)
}

// CPU chooses Matthias' reply (residentmove.Chooser.MoveForGame): the game's
// positions from its origin, the one to move from last.
type CPU interface {
	MoveForGame(ctx context.Context, positions []*chess.Position, level float64) (string, error)
}

type WriteConfig struct {
	Config
	Store WriteStore
	CPU   CPU
	// EngineWorkers mirrors CHESS_ENGINE_WORKERS (1-4, default 1): how many
	// CPU replies this process computes at once; the rest wait their turn.
	EngineWorkers int
}

type WriteHandler struct {
	base    *Handler
	store   WriteStore
	cpu     CPU
	engines chan struct{}
}

func NewWrites(cfg WriteConfig) (*WriteHandler, error) {
	if cfg.Store == nil || cfg.CPU == nil {
		return nil, errors.New("games write API needs a store and a CPU")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	workers := cfg.EngineWorkers
	if workers < 1 {
		workers = 1
	}
	if workers > 4 {
		workers = 4
	}
	return &WriteHandler{base: base, store: cfg.Store, cpu: cfg.CPU, engines: make(chan struct{}, workers)}, nil
}

// EngineWorkersFromEnv mirrors engine_runtime.configured_engine_workers.
func EngineWorkersFromEnv(raw string) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 1
	}
	return max(1, min(value, 4))
}

// readOnlyStore satisfies the read Store for the shared base; the write
// handler never routes reads.
type readOnlyStore struct{}

func (readOnlyStore) ListSummariesByOwner(context.Context, string, int) ([]gamestore.Summary, error) {
	return nil, gamestore.ErrUnavailable
}

func (readOnlyStore) GetDocumentForOwner(context.Context, string, string) (bson.M, bool, error) {
	return nil, false, gamestore.ErrUnavailable
}

func (readOnlyStore) DeleteForOwner(context.Context, string, string) (bool, error) {
	return false, gamestore.ErrUnavailable
}

func (h *WriteHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, gameID, ok := WriteRoute(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	b := h.base
	securityHeaders(w)
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	_, allowed := b.origins[origin]
	if r.Method == http.MethodOptions {
		b.preflight(w, r, origin, allowed)
		return
	}
	if origin != "" && allowed {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
		w.Header().Add("Vary", "Origin")
	}
	w.Header().Set("X-Chess-Games-Native", "go")

	// RequestBodyLimitMiddleware wraps the whole app: oversized bodies are
	// refused before any session check.
	if r.ContentLength > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBodyBytes+1))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "Petición inválida."})
		return
	}
	if len(body) > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}

	subject, version, tokenErr := b.verify(r)
	key := "user:" + subject
	if tokenErr != nil {
		key = "ip:" + b.clientIP(r)
	}
	if !b.limiter.allow(key, b.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
		return
	}
	username, status, detail := b.currentUser(r, subject, version, tokenErr)
	if status != 0 {
		writeJSON(w, status, map[string]any{"detail": detail})
		return
	}
	if b.presence != nil {
		b.presence.Touch(r, username)
	}

	// Python keeps working after the client hangs up; so does Go, or a
	// disconnect between the CPU reply and the CAS would waste the reply.
	ctx := context.WithoutCancel(r.Context())
	if pattern == MovePattern {
		move, err := gameops.ParseMoveRequest(body)
		if err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": moveValidationDetail(body)})
			return
		}
		h.move(ctx, w, r, gameID, username, move)
		return
	}
	h.undo(ctx, w, r, gameID, username)
}

// loaded is a stored game as the write routes see it.
type loaded struct {
	raw   map[string]any
	game  gamestore.Game
	entry gamecore.Entry
}

// ownedGame mirrors get_owned_game. ok=false means a response was written.
func (h *WriteHandler) ownedGame(ctx context.Context, w http.ResponseWriter, gameID, username string) (loaded, bool) {
	doc, found, err := h.store.GetDocumentForOwner(ctx, gameID, username)
	if err != nil {
		storageUnavailable(w)
		return loaded{}, false
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Partida no encontrada."})
		return loaded{}, false
	}
	raw := plain(doc).(map[string]any)
	if raw["owner"] == nil {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "Partida antigua sin propietario. Inicia una partida nueva."})
		return loaded{}, false
	}
	game, err := decodeGame(doc)
	if err != nil {
		writeDamaged(w)
		return loaded{}, false
	}
	return loaded{raw: raw, game: game}, true
}

// board mirrors load_stored_game_board. ok=false means a response was written.
func (l *loaded) board(w http.ResponseWriter) (*gamecore.Board, bool) {
	entry, err := gamecore.ParseEntry(l.raw)
	var board *gamecore.Board
	if err == nil {
		board, err = gamecore.LoadBoard(entry)
	}
	if err != nil {
		writeDamaged(w)
		return nil, false
	}
	if !board.IsValid() {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "La partida guardada contiene una posición imposible. Inicia una nueva partida."})
		return nil, false
	}
	l.entry = entry
	return board, true
}

func writeDamaged(w http.ResponseWriter) {
	writeJSON(w, http.StatusConflict, map[string]any{"detail": "La partida guardada está dañada y no puede continuar. Inicia una nueva partida."})
}

// idempotency mirrors idempotency_key + operation_replay. replay=true means
// the stored game already reflects this operation.
func idempotency(w http.ResponseWriter, r *http.Request, game gamestore.Game, fingerprint, kind string) (key *string, replay, ok bool) {
	var raw *string
	if values, present := r.Header[http.CanonicalHeaderKey("Idempotency-Key")]; present && len(values) > 0 {
		raw = &values[0]
	}
	key, err := gameops.NormalizeKey(raw)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": gameops.InvalidKeyDetail})
		return nil, false, false
	}
	replay, err = gameops.Replay(game.OperationLedger, key, fingerprint, kind)
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": gameops.ConflictDetail})
		return nil, false, false
	}
	return key, replay, true
}

func (h *WriteHandler) replayed(w http.ResponseWriter, gameID string, l loaded) {
	board, ok := l.board(w)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, board.Snapshot(gameID, l.entry))
}

func (h *WriteHandler) move(ctx context.Context, w http.ResponseWriter, r *http.Request, gameID, username string, req gameops.MoveRequest) {
	l, ok := h.ownedGame(ctx, w, gameID, username)
	if !ok {
		return
	}
	fingerprint, err := gameops.Fingerprint(req.Payload)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"detail": "Error interno."})
		return
	}
	key, replay, ok := idempotency(w, r, l.game, fingerprint, "move")
	if !ok {
		return
	}
	if replay {
		h.replayed(w, gameID, l)
		return
	}
	expected := append([]string(nil), l.game.Moves...)
	board, ok := l.board(w)
	if !ok {
		return
	}
	if board.IsGameOver() {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "La partida ya terminó."})
		return
	}
	if board.Turn() != l.entry.HumanColor {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "No es el turno del jugador."})
		return
	}
	move, legal := board.ResolveMove(req.From, req.To, req.Promotion)
	if !legal {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "Movimiento ilegal."})
		return
	}
	last := lastMoveFrom(board.MoveDict(move), "human")
	board.Push(move)
	if !board.IsGameOver() {
		if reply, ok := h.cpuReply(ctx, board, l.entry.Difficulty); ok {
			last = lastMoveFrom(board.MoveDict(reply), "cpu")
			board.Push(reply)
		}
	}
	h.commit(ctx, w, r, gameID, username, l, board, last, key, fingerprint, "move", expected,
		"La partida cambió mientras se procesaba la jugada. Recarga el estado antes de mover otra vez.")
}

func (h *WriteHandler) undo(ctx context.Context, w http.ResponseWriter, r *http.Request, gameID, username string) {
	l, ok := h.ownedGame(ctx, w, gameID, username)
	if !ok {
		return
	}
	fingerprint, err := gameops.UndoFingerprint(gameID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"detail": "Error interno."})
		return
	}
	key, replay, ok := idempotency(w, r, l.game, fingerprint, "undo")
	if !ok {
		return
	}
	if replay {
		h.replayed(w, gameID, l)
		return
	}
	expected := append([]string(nil), l.game.Moves...)
	board, ok := l.board(w)
	if !ok {
		return
	}
	if len(board.Moves()) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "No hay jugadas para deshacer."})
		return
	}
	count := 1
	if stored, ok := l.raw["lastMove"].(map[string]any); ok && stored["by"] == "cpu" {
		count = 2
	}
	for i := 0; i < count && board.Pop(); i++ {
	}
	var last *gamestore.LastMove
	if moves := board.Moves(); len(moves) > 0 {
		// Rebuild the last move from the game's real origin, as Python does.
		before := board.Copy()
		before.Pop()
		final := moves[len(moves)-1]
		by := "cpu"
		if before.Turn() == l.entry.HumanColor {
			by = "human"
		}
		last = lastMoveFrom(before.MoveDict(final), by)
	}
	h.commit(ctx, w, r, gameID, username, l, board, last, key, fingerprint, "undo", expected,
		"La partida cambió mientras deshacías. Recarga el estado y vuelve a intentarlo.")
}

// commit persists the new history with Python's CAS and answers the snapshot.
func (h *WriteHandler) commit(
	ctx context.Context, w http.ResponseWriter, r *http.Request,
	gameID, username string, l loaded, board *gamecore.Board, last *gamestore.LastMove,
	key *string, fingerprint, kind string, expected []string, conflictDetail string,
) {
	game := l.game
	game.Moves = board.SANs()
	game.LastMove = last
	game.OperationLedger = gameops.Remember(game.OperationLedger, key, fingerprint, kind)
	updated, err := h.store.UpdateIfMoves(ctx, gameID, game, expected)
	if err != nil {
		storageUnavailable(w)
		return
	}
	if !updated {
		latest, ok := h.ownedGame(ctx, w, gameID, username)
		if !ok {
			return
		}
		replay, err := gameops.Replay(latest.game.OperationLedger, key, fingerprint, kind)
		if err != nil {
			writeJSON(w, http.StatusConflict, map[string]any{"detail": gameops.ConflictDetail})
			return
		}
		if replay {
			h.replayed(w, gameID, latest)
			return
		}
		writeJSON(w, http.StatusConflict, map[string]any{"detail": conflictDetail})
		return
	}
	entry := l.entry
	entry.Moves = game.Moves
	if last == nil {
		entry.LastMove = nil
	} else {
		entry.LastMove = lastMoveMap(*last)
	}
	writeJSON(w, http.StatusOK, board.Snapshot(gameID, entry))
}

// cpuReply mirrors compute_engine_move_or_fallback: the policy's move when it
// is legal, else the first legal move by UCI, so the game never stays on the
// CPU's turn.
func (h *WriteHandler) cpuReply(ctx context.Context, board *gamecore.Board, difficulty any) (chess.Move, bool) {
	level, _ := numeric(difficulty)
	// run_engine_work: a bounded engine pool; extra replies queue.
	h.engines <- struct{}{}
	uci, err := h.cpu.MoveForGame(ctx, board.Positions(), level)
	<-h.engines
	legal := board.LegalMoves()
	if err == nil {
		for _, move := range legal {
			if move.String() == uci {
				return move, true
			}
		}
	} else {
		log.Printf("cpu_move_failed_using_legal_fallback error_type=%T", err)
	}
	if len(legal) == 0 {
		return chess.Move{}, false
	}
	sort.Slice(legal, func(i, j int) bool { return legal[i].String() < legal[j].String() })
	return legal[0], true
}

func numeric(value any) (float64, bool) {
	switch v := value.(type) {
	case int:
		return float64(v), true
	case int32:
		return float64(v), true
	case int64:
		return float64(v), true
	case float64:
		return v, true
	case float32:
		return float64(v), true
	}
	return 50, false
}

func lastMoveFrom(dict map[string]any, by string) *gamestore.LastMove {
	last := &gamestore.LastMove{By: by}
	last.From, _ = dict["from"].(string)
	last.To, _ = dict["to"].(string)
	last.Captured, _ = dict["captured"].(bool)
	if piece, ok := dict["piece"].(string); ok {
		last.Piece = &piece
	}
	if promotion, ok := dict["promotion"].(string); ok {
		last.Promotion = &promotion
	}
	return last
}

func lastMoveMap(last gamestore.LastMove) map[string]any {
	out := map[string]any{"from": last.From, "to": last.To, "by": last.By, "captured": last.Captured, "piece": nil, "promotion": nil}
	if last.Piece != nil {
		out["piece"] = *last.Piece
	}
	if last.Promotion != nil {
		out["promotion"] = *last.Promotion
	}
	return out
}

// decodeGame turns the raw document into the typed Game the CAS writes back,
// keeping unknown fields in Extra and the stored BSON types of difficulty.
func decodeGame(doc bson.M) (gamestore.Game, error) {
	raw, err := bson.Marshal(doc)
	if err != nil {
		return gamestore.Game{}, err
	}
	var game gamestore.Game
	if err := bson.Unmarshal(raw, &game); err != nil {
		return gamestore.Game{}, err
	}
	delete(game.Extra, "_id")
	return game, nil
}

// moveValidationDetail approximates FastAPI's RequestValidationError detail
// for MoveRequest: the same 422 and the same type/loc/msg for each failing
// field. Pydantic's "input" and "ctx" echoes are not reproduced.
func moveValidationDetail(body []byte) []map[string]any {
	var raw any
	if err := json.Unmarshal(body, &raw); err != nil {
		return []map[string]any{{"type": "json_invalid", "loc": []any{"body", 0}, "msg": "JSON decode error"}}
	}
	fields, ok := raw.(map[string]any)
	if !ok {
		return []map[string]any{{"type": "model_attributes_type", "loc": []any{"body"}, "msg": "Input should be a valid dictionary or object to extract fields from"}}
	}
	var detail []map[string]any
	for _, field := range []string{"from", "to"} {
		value, present := fields[field]
		switch s, isString := value.(string); {
		case !present:
			detail = append(detail, map[string]any{"type": "missing", "loc": []any{"body", field}, "msg": "Field required"})
		case !isString:
			detail = append(detail, map[string]any{"type": "string_type", "loc": []any{"body", field}, "msg": "Input should be a valid string"})
		case len([]rune(s)) < 2:
			detail = append(detail, map[string]any{"type": "string_too_short", "loc": []any{"body", field}, "msg": "String should have at least 2 characters"})
		case len([]rune(s)) > 2:
			detail = append(detail, map[string]any{"type": "string_too_long", "loc": []any{"body", field}, "msg": "String should have at most 2 characters"})
		}
	}
	if value, present := fields["promotion"]; present && value != nil {
		if s, isString := value.(string); !isString {
			detail = append(detail, map[string]any{"type": "string_type", "loc": []any{"body", "promotion"}, "msg": "Input should be a valid string"})
		} else if len([]rune(s)) > 1 {
			detail = append(detail, map[string]any{"type": "string_too_long", "loc": []any{"body", "promotion"}, "msg": "String should have at most 1 character"})
		}
	}
	if len(detail) == 0 {
		detail = append(detail, map[string]any{"type": "value_error", "loc": []any{"body"}, "msg": "Invalid request body"})
	}
	return detail
}

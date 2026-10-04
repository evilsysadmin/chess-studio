package gamesapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamestore"
)

// stored round-trips a document through BSON so tests see exactly what the
// driver decodes (bson.A arrays, int32 numbers, embedded bson.D/M).
func stored(t *testing.T, doc bson.M) bson.M {
	t.Helper()
	raw, err := bson.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	var out bson.M
	if err := bson.Unmarshal(raw, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

type fakeWriteStore struct {
	t        *testing.T
	docs     map[string]bson.M
	err      error
	writes   int
	conflict func(id string) // runs before a CAS to simulate a concurrent writer
}

func (f *fakeWriteStore) GetDocumentForOwner(_ context.Context, id, owner string) (bson.M, bool, error) {
	if f.err != nil {
		return nil, false, f.err
	}
	doc, ok := f.docs[id]
	if !ok {
		return nil, false, nil
	}
	if o := doc["owner"]; o != nil && o != owner {
		return nil, false, nil
	}
	return doc, true, nil
}

func (f *fakeWriteStore) UpdateIfMoves(_ context.Context, id string, game gamestore.Game, expected []string) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	if f.conflict != nil {
		f.conflict(id)
	}
	current := f.docs[id]
	var moves []string
	for _, m := range current["moves"].(bson.A) {
		moves = append(moves, m.(string))
	}
	if strings.Join(moves, " ") != strings.Join(expected, " ") {
		return false, nil
	}
	game.ID = id
	raw, err := bson.Marshal(game)
	if err != nil {
		f.t.Fatal(err)
	}
	var doc bson.M
	if err := bson.Unmarshal(raw, &doc); err != nil {
		f.t.Fatal(err)
	}
	f.docs[id] = doc
	f.writes++
	return true, nil
}

type fakeCPU struct {
	replies []string
	err     error
	calls   []string
	levels  []float64
}

func (f *fakeCPU) MoveForLevel(_ context.Context, fen string, level float64) (string, error) {
	f.calls = append(f.calls, fen)
	f.levels = append(f.levels, level)
	if f.err != nil {
		return "", f.err
	}
	if len(f.replies) == 0 {
		return "", errors.New("no scripted reply")
	}
	reply := f.replies[0]
	f.replies = f.replies[1:]
	return reply, nil
}

type writeFixture struct {
	h     *WriteHandler
	store *fakeWriteStore
	cpu   *fakeCPU
}

func newWriteFixture(t *testing.T) writeFixture {
	t.Helper()
	f := writeFixture{store: &fakeWriteStore{t: t, docs: map[string]bson.M{}}, cpu: &fakeCPU{}}
	h, err := NewWrites(WriteConfig{
		Config: Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Store:  f.store,
		CPU:    f.cpu,
	})
	if err != nil {
		t.Fatal(err)
	}
	f.h = h
	return f
}

func (f writeFixture) post(t *testing.T, path, payload string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(payload))
	r.Header.Set("Authorization", "Bearer "+token(t, "alice", 0))
	r.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		if v == "" {
			r.Header.Del(k)
			continue
		}
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	return w
}

func newGameDoc(t *testing.T, moves ...string) bson.M {
	a := bson.A{}
	for _, m := range moves {
		a = append(a, m)
	}
	return stored(t, bson.M{
		"_id": "g1", "owner": "alice", "moves": a, "difficulty": int32(50), "humanColor": "w",
		"handicap": nil, "initialFen": nil, "lastMove": nil, "createOperation": nil,
		"updatedAt": time.Unix(1_759_000_000, 0).UTC(), "pythonOnlyField": "keep-me",
	})
}

func TestWriteRouteOnlyClaimsMoveAndUndo(t *testing.T) {
	cases := []struct {
		method, path, preflight, pattern, id string
		ok                                   bool
	}{
		{http.MethodPost, "/api/games/g1/move", "", MovePattern, "g1", true},
		{http.MethodPost, "/api/games/g%201/undo", "", UndoPattern, "g 1", true},
		{http.MethodOptions, "/api/games/g1/move", "POST", MovePattern, "g1", true},
		{http.MethodOptions, "/api/games/g1/move", "GET", "", "", false},
		{http.MethodGet, "/api/games/g1/move", "", "", "", false},
		{http.MethodGet, "/api/games/g1/hint", "", "", "", false},
		{http.MethodPost, "/api/games", "", "", "", false},
		{http.MethodPost, "/api/games/a/b/move", "", "", "", false},
		{http.MethodPost, "/api/games//move", "", "", "", false},
	}
	for _, tc := range cases {
		r := httptest.NewRequest(tc.method, tc.path, nil)
		if tc.preflight != "" {
			r.Header.Set("Access-Control-Request-Method", tc.preflight)
		}
		pattern, id, ok := WriteRoute(r)
		if ok != tc.ok || pattern != tc.pattern || id != tc.id {
			t.Errorf("%s %s: got (%q, %q, %v)", tc.method, tc.path, pattern, id, ok)
		}
	}
}

func TestMovePlaysHumanThenCPUAndPersistsWithCAS(t *testing.T) {
	f := newWriteFixture(t)
	f.store.docs["g1"] = newGameDoc(t)
	f.cpu.replies = []string{"e7e5"}
	w := f.post(t, "/api/games/g1/move", `{"from":"e2","to":"e4"}`, map[string]string{"Idempotency-Key": "move-key-0001"})
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if w.Header().Get("X-Chess-Games-Native") != "go" {
		t.Fatal("missing native marker")
	}
	got := body(t, w)
	if got["fen"] != "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" || got["turn"] != "w" {
		t.Fatalf("snapshot=%v", got)
	}
	last := got["lastMove"].(map[string]any)
	if last["by"] != "cpu" || last["from"] != "e7" || last["to"] != "e5" || last["piece"] != "p" || last["captured"] != false {
		t.Fatalf("lastMove=%v", last)
	}
	if len(got["history"].([]any)) != 2 || got["difficulty"] != float64(50) {
		t.Fatalf("snapshot=%v", got)
	}
	if len(f.cpu.levels) != 1 || f.cpu.levels[0] != 50 || f.cpu.calls[0] != "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" {
		t.Fatalf("cpu calls=%v levels=%v", f.cpu.calls, f.cpu.levels)
	}
	doc := f.store.docs["g1"]
	if !reflect.DeepEqual(doc["moves"], bson.A{"e4", "e5"}) || doc["pythonOnlyField"] != "keep-me" || doc["difficulty"] != int32(50) {
		t.Fatalf("stored=%v", doc)
	}
	ledger := plain(doc["operationLedger"]).([]any)
	if len(ledger) != 1 || ledger[0].(map[string]any)["kind"] != "move" || ledger[0].(map[string]any)["key"] != "move-key-0001" {
		t.Fatalf("ledger=%v", ledger)
	}

	// A retry of the same operation replays the stored game, no new reply.
	again := f.post(t, "/api/games/g1/move", `{"from":"e2","to":"e4"}`, map[string]string{"Idempotency-Key": "move-key-0001"})
	if again.Code != http.StatusOK || body(t, again)["fen"] != got["fen"] || len(f.cpu.calls) != 1 || f.store.writes != 1 {
		t.Fatalf("replay status=%d calls=%d writes=%d", again.Code, len(f.cpu.calls), f.store.writes)
	}
	// The same key for a different move is a conflict.
	reused := f.post(t, "/api/games/g1/move", `{"from":"d2","to":"d4"}`, map[string]string{"Idempotency-Key": "move-key-0001"})
	if reused.Code != http.StatusConflict || body(t, reused)["detail"] != "La misma operación idempotente se reutilizó con datos distintos." {
		t.Fatalf("reuse status=%d body=%s", reused.Code, reused.Body.String())
	}
}

func TestMoveRulesMirrorPython(t *testing.T) {
	f := newWriteFixture(t)
	f.store.docs["g1"] = newGameDoc(t)
	cases := []struct {
		payload string
		status  int
		detail  string
	}{
		{`{"from":"e2","to":"e5"}`, http.StatusBadRequest, "Movimiento ilegal."},
		{`{"from":"e7","to":"e5"}`, http.StatusBadRequest, "Movimiento ilegal."},
	}
	for _, tc := range cases {
		w := f.post(t, "/api/games/g1/move", tc.payload, nil)
		if w.Code != tc.status || body(t, w)["detail"] != tc.detail {
			t.Errorf("%s: status=%d body=%s", tc.payload, w.Code, w.Body.String())
		}
	}
	// Black's turn while the human plays white.
	f.store.docs["g1"] = newGameDoc(t, "e4")
	if w := f.post(t, "/api/games/g1/move", `{"from":"e7","to":"e5"}`, nil); w.Code != 400 || body(t, w)["detail"] != "No es el turno del jugador." {
		t.Fatalf("turn status=%d body=%s", w.Code, w.Body.String())
	}
	// Fool's mate: the game is over.
	f.store.docs["g1"] = newGameDoc(t, "f3", "e5", "g4", "Qh4#")
	if w := f.post(t, "/api/games/g1/move", `{"from":"a2","to":"a3"}`, nil); w.Code != 400 || body(t, w)["detail"] != "La partida ya terminó." {
		t.Fatalf("over status=%d body=%s", w.Code, w.Body.String())
	}
	if f.store.writes != 0 || len(f.cpu.calls) != 0 {
		t.Fatalf("rejected moves wrote=%d cpu=%d", f.store.writes, len(f.cpu.calls))
	}
}

func TestMoveChecksSessionBeforeBodyAndOwnershipAfter(t *testing.T) {
	f := newWriteFixture(t)
	f.store.docs["g1"] = newGameDoc(t)
	if w := f.post(t, "/api/games/g1/move", `{"from":"e2"}`, map[string]string{"Authorization": ""}); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous status=%d", w.Code)
	}
	w := f.post(t, "/api/games/g1/move", `{"from":"e2"}`, nil)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid body status=%d", w.Code)
	}
	detail := body(t, w)["detail"].([]any)[0].(map[string]any)
	if detail["type"] != "missing" || !reflect.DeepEqual(detail["loc"], []any{"body", "to"}) {
		t.Fatalf("detail=%v", detail)
	}
	if w := f.post(t, "/api/games/nope/move", `{"from":"e2","to":"e4"}`, nil); w.Code != 404 || body(t, w)["detail"] != "Partida no encontrada." {
		t.Fatalf("missing status=%d", w.Code)
	}
	legacy := newGameDoc(t)
	legacy["owner"] = nil
	f.store.docs["legacy"] = legacy
	if w := f.post(t, "/api/games/legacy/move", `{"from":"e2","to":"e4"}`, nil); w.Code != 409 {
		t.Fatalf("legacy status=%d", w.Code)
	}
	if w := f.post(t, "/api/games/g1/move", `{"from":"e2","to":"e4"}`, map[string]string{"Idempotency-Key": "bad key"}); w.Code != 400 || body(t, w)["detail"] != "Idempotency-Key inválida." {
		t.Fatalf("bad key status=%d body=%s", w.Code, w.Body.String())
	}
	f.store.err = gamestore.ErrUnavailable
	if w := f.post(t, "/api/games/g1/move", `{"from":"e2","to":"e4"}`, nil); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("storage status=%d", w.Code)
	}
}

func TestMoveRefusesOversizedBodiesBeforeTheSession(t *testing.T) {
	f := newWriteFixture(t)
	big := `{"from":"e2","to":"e4","pad":"` + strings.Repeat("x", MaxRequestBodyBytes) + `"}`
	w := f.post(t, "/api/games/g1/move", big, map[string]string{"Authorization": ""})
	if w.Code != http.StatusRequestEntityTooLarge || body(t, w)["detail"] != "Petición demasiado grande." {
		t.Fatalf("status=%d", w.Code)
	}
}

func TestIllegalCPUReplyFallsBackToFirstLegalMoveByUCI(t *testing.T) {
	f := newWriteFixture(t)
	f.store.docs["g1"] = newGameDoc(t)
	f.cpu.replies = []string{"e2e4"} // not legal for black
	w := f.post(t, "/api/games/g1/move", `{"from":"e2","to":"e4"}`, nil)
	if w.Code != 200 {
		t.Fatalf("status=%d", w.Code)
	}
	last := body(t, w)["lastMove"].(map[string]any)
	if last["from"] != "a7" || last["to"] != "a5" || last["by"] != "cpu" {
		t.Fatalf("fallback=%v", last)
	}
	f.store.docs["g1"] = newGameDoc(t)
	f.cpu.err = errors.New("engine exploded")
	if w := f.post(t, "/api/games/g1/move", `{"from":"e2","to":"e4"}`, nil); w.Code != 200 || body(t, w)["turn"] != "w" {
		t.Fatalf("error fallback status=%d", w.Code)
	}
}

func TestMoveRaceReplaysOrConflictsLikePython(t *testing.T) {
	f := newWriteFixture(t)
	f.store.docs["g1"] = newGameDoc(t)
	f.cpu.replies = []string{"e7e5"}
	// A concurrent writer moved the game on: plain conflict.
	f.store.conflict = func(id string) {
		f.store.docs[id] = newGameDoc(t, "d4", "d5")
		f.store.conflict = nil
	}
	w := f.post(t, "/api/games/g1/move", `{"from":"e2","to":"e4"}`, nil)
	if w.Code != 409 || body(t, w)["detail"] != "La partida cambió mientras se procesaba la jugada. Recarga el estado antes de mover otra vez." {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	// The concurrent writer was this same operation (a retry on Python): replay.
	f.store.docs["g1"] = newGameDoc(t)
	f.cpu.replies = []string{"e7e5"}
	f.store.conflict = func(id string) {
		doc := newGameDoc(t, "e4", "c5")
		doc["operationLedger"] = stored(t, bson.M{"l": bson.A{bson.M{"key": "race-key-001", "kind": "move", "fingerprint": fingerprintFor(t, `{"from":"e2","to":"e4"}`)}}})["l"]
		f.store.docs[id] = doc
		f.store.conflict = nil
	}
	w = f.post(t, "/api/games/g1/move", `{"from":"e2","to":"e4"}`, map[string]string{"Idempotency-Key": "race-key-001"})
	if w.Code != 200 || body(t, w)["fen"] != "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2" {
		t.Fatalf("replay status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestUndoTakesBackTheCPUReplyAndTheHumanMove(t *testing.T) {
	f := newWriteFixture(t)
	doc := newGameDoc(t, "e4", "e5", "Nf3", "Nc6")
	doc["lastMove"] = stored(t, bson.M{"m": bson.M{"from": "b8", "to": "c6", "by": "cpu", "captured": false, "piece": "n", "promotion": nil}})["m"]
	f.store.docs["g1"] = doc
	w := f.post(t, "/api/games/g1/undo", ``, map[string]string{"Idempotency-Key": "undo-key-0001"})
	if w.Code != 200 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	got := body(t, w)
	last := got["lastMove"].(map[string]any)
	if last["from"] != "e7" || last["to"] != "e5" || last["by"] != "cpu" || len(got["history"].([]any)) != 2 {
		t.Fatalf("snapshot=%v", got)
	}
	if !reflect.DeepEqual(f.store.docs["g1"]["moves"], bson.A{"e4", "e5"}) {
		t.Fatalf("stored=%v", f.store.docs["g1"]["moves"])
	}
	// Replayed, not applied twice.
	if again := f.post(t, "/api/games/g1/undo", ``, map[string]string{"Idempotency-Key": "undo-key-0001"}); again.Code != 200 || f.store.writes != 1 {
		t.Fatalf("replay status=%d writes=%d", again.Code, f.store.writes)
	}
	// Two more undos empty the game; the last one clears lastMove.
	f.post(t, "/api/games/g1/undo", ``, nil)
	if doc := f.store.docs["g1"]; len(doc["moves"].(bson.A)) != 0 || doc["lastMove"] != nil {
		t.Fatalf("emptied=%v", doc)
	}
	if w := f.post(t, "/api/games/g1/undo", ``, nil); w.Code != 400 || body(t, w)["detail"] != "No hay jugadas para deshacer." {
		t.Fatalf("empty status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestUndoOfAHumanLastMoveTakesBackOnePly(t *testing.T) {
	f := newWriteFixture(t)
	doc := newGameDoc(t, "f3", "e5", "g4")
	doc["humanColor"] = "b"
	doc["lastMove"] = stored(t, bson.M{"m": bson.M{"from": "g2", "to": "g4", "by": "human", "captured": false, "piece": "p", "promotion": nil}})["m"]
	f.store.docs["g1"] = doc
	w := f.post(t, "/api/games/g1/undo", ``, nil)
	if w.Code != 200 {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	last := body(t, w)["lastMove"].(map[string]any)
	// After f3 e5 the last move is black's e5: the human (black) made it.
	if last["from"] != "e7" || last["by"] != "human" {
		t.Fatalf("lastMove=%v", last)
	}
}

func fingerprintFor(t *testing.T, payload string) string {
	t.Helper()
	f := newWriteFixture(t)
	f.store.docs["g1"] = newGameDoc(t)
	f.cpu.replies = []string{"e7e5"}
	f.post(t, "/api/games/g1/move", payload, map[string]string{"Idempotency-Key": "probe-key-01"})
	ledger := plain(f.store.docs["g1"]["operationLedger"]).([]any)
	return ledger[0].(map[string]any)["fingerprint"].(string)
}

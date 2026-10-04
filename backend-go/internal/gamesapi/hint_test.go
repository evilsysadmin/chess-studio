package gamesapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	chess "github.com/corentings/chess/v2"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentpolicy"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
)

type fakeEngine struct {
	pv      *residentsearch.PrincipalVariation
	err     error
	classic string
	depth   int
	budget  time.Duration
	plies   int
	calls   int
}

func (f *fakeEngine) Classic(context.Context, []*chess.Position, int, time.Duration) (string, float64, error) {
	return f.classic, 0, nil
}

func (f *fakeEngine) PrincipalVariation(_ context.Context, positions []*chess.Position, maxDepth int, budget time.Duration) (*residentsearch.PrincipalVariation, error) {
	f.calls++
	f.depth, f.budget, f.plies = maxDepth, budget, len(positions)-1
	return f.pv, f.err
}

type hintFixture struct {
	h      *HintHandler
	store  *fakeWriteStore
	engine *fakeEngine
}

func newHintFixture(t *testing.T) hintFixture {
	t.Helper()
	f := hintFixture{store: &fakeWriteStore{t: t, docs: map[string]bson.M{}}, engine: &fakeEngine{}}
	h, err := NewHint(HintConfig{
		Config: Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Store:  f.store,
		Engine: f.engine,
	})
	if err != nil {
		t.Fatal(err)
	}
	f.h = h
	return f
}

func (f hintFixture) get(t *testing.T, path string, auth bool) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, path, nil)
	if auth {
		r.Header.Set("Authorization", "Bearer "+token(t, "alice", 0))
	}
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	return w
}

func TestHintRouteOnlyClaimsTheHint(t *testing.T) {
	for _, tc := range []struct {
		method, path string
		ok           bool
	}{
		{http.MethodGet, "/api/games/g1/hint", true},
		{http.MethodPost, "/api/games/g1/hint", false},
		{http.MethodGet, "/api/games/g1", false},
		{http.MethodGet, "/api/games//hint", false},
		{http.MethodGet, "/api/games/a/b/hint", false},
	} {
		_, _, ok := HintRoute(httptest.NewRequest(tc.method, tc.path, nil))
		if ok != tc.ok {
			t.Errorf("%s %s: %v", tc.method, tc.path, ok)
		}
	}
}

func TestHintShowsTheProvenLine(t *testing.T) {
	f := newHintFixture(t)
	f.store.docs["g1"] = newGameDoc(t, "e4", "e5")
	f.engine.pv = &residentsearch.PrincipalVariation{Moves: []string{"g1f3", "b8c6", "f1b5"}, Depth: 4, CandidateCount: 29}
	w := f.get(t, "/api/games/g1/hint", true)
	if w.Code != 200 || w.Header().Get("X-Chess-Games-Native") != "go" {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	got := body(t, w)
	if got["from"] != "g1" || got["to"] != "f3" || got["san"] != "Nf3" || got["piece"] != "n" || got["analysisDepth"] != float64(4) || got["candidateCount"] != float64(29) {
		t.Fatalf("hint=%v", got)
	}
	reply := got["reply"].(map[string]any)
	if reply["san"] != "Nc6" || len(got["line"].([]any)) != 3 || got["line"].([]any)[2].(map[string]any)["san"] != "Bb5" {
		t.Fatalf("hint=%v", got)
	}
	if _, forced := got["forced"]; forced {
		t.Fatal("unforced hint carries forced")
	}
	wantDepth, wantBudget := residentpolicy.SearchSettings(HintStrength)
	if f.engine.depth != wantDepth || f.engine.budget != time.Duration(wantBudget*float64(time.Second)) || f.engine.plies != 2 {
		t.Fatalf("engine depth=%d budget=%v plies=%d", f.engine.depth, f.engine.budget, f.engine.plies)
	}
}

func TestHintCutsTheLineAtAnIllegalMoveAndFallsBackWhenTheSearchTimesOut(t *testing.T) {
	f := newHintFixture(t)
	f.store.docs["g1"] = newGameDoc(t)
	f.engine.pv = &residentsearch.PrincipalVariation{Moves: []string{"e2e4", "e2e4"}, Depth: 2, CandidateCount: 20}
	got := body(t, f.get(t, "/api/games/g1/hint", true))
	if len(got["line"].([]any)) != 1 || got["reply"] != nil {
		t.Fatalf("hint=%v", got)
	}
	f.engine.pv, f.engine.err, f.engine.classic = nil, residentsearch.ErrTimeout, "d2d4"
	got = body(t, f.get(t, "/api/games/g1/hint", true))
	if got["from"] != "d2" || got["to"] != "d4" || got["line"] != nil || got["analysisDepth"] != nil {
		t.Fatalf("fallback=%v", got)
	}
}

func TestHintOfAForcedMove(t *testing.T) {
	f := newHintFixture(t)
	// The black queen on g2 leaves the white king only Kb1.
	doc := newGameDoc(t)
	doc["initialFen"] = "7k/8/8/8/8/8/6q1/K7 w - - 0 1"
	f.store.docs["g1"] = doc
	w := f.get(t, "/api/games/g1/hint", true)
	got := body(t, w)
	if w.Code != 200 || got["forced"] != true || got["to"] != "b1" || got["analysisDepth"] != float64(0) || got["candidateCount"] != float64(1) || f.engine.calls != 0 {
		t.Fatalf("status=%d hint=%v calls=%d", w.Code, got, f.engine.calls)
	}
}

func TestHintRulesMirrorPython(t *testing.T) {
	f := newHintFixture(t)
	if w := f.get(t, "/api/games/g1/hint", false); w.Code != 401 {
		t.Fatalf("anonymous=%d", w.Code)
	}
	if w := f.get(t, "/api/games/nope/hint", true); w.Code != 404 || body(t, w)["detail"] != "Partida no encontrada." {
		t.Fatalf("missing=%d", w.Code)
	}
	f.store.docs["g1"] = newGameDoc(t, "e4")
	if w := f.get(t, "/api/games/g1/hint", true); w.Code != 400 || body(t, w)["detail"] != "No es tu turno." {
		t.Fatalf("turn=%d %s", w.Code, w.Body.String())
	}
	f.store.docs["g1"] = newGameDoc(t, "f3", "e5", "g4", "Qh4#")
	if w := f.get(t, "/api/games/g1/hint", true); w.Code != 400 || body(t, w)["detail"] != "La partida ya terminó." {
		t.Fatalf("over=%d %s", w.Code, w.Body.String())
	}
	if f.engine.calls != 0 {
		t.Fatalf("engine called %d times", f.engine.calls)
	}
}

package gamesapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	chess "github.com/corentings/chess/v2"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
)

type fakeMover struct {
	move  string
	err   error
	level float64
	calls int
	block chan struct{}
}

func (f *fakeMover) Move(_ context.Context, _ []*chess.Position, level float64) (string, error) {
	f.calls++
	f.level = level
	if f.block != nil {
		<-f.block
	}
	return f.move, f.err
}

type fakeRootAnalyzer struct {
	snapshot residentsearch.Snapshot
	err      error
	depth    int
	budget   time.Duration
}

func (f *fakeRootAnalyzer) AnalyzeDepth(_ context.Context, _ []*chess.Position, depth int, budget time.Duration) (residentsearch.Snapshot, error) {
	f.depth, f.budget = depth, budget
	return f.snapshot, f.err
}

type analyzeFixture struct {
	h        *AnalyzeHandler
	mover    *fakeMover
	analyzer *fakeRootAnalyzer
	presence *fakePresence
}

func newAnalyzeFixture(t *testing.T, pool *EnginePool) analyzeFixture {
	t.Helper()
	f := analyzeFixture{mover: &fakeMover{move: "e2e4"}, analyzer: &fakeRootAnalyzer{}, presence: &fakePresence{}}
	h, err := NewAnalyze(AnalyzeConfig{
		Config:   Config{Accounts: fakeAccounts{}, Presence: f.presence, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Mover:    f.mover,
		Analyzer: f.analyzer,
		Pool:     pool,
		APIKeys:  []string{" ", "machine-key"},
	})
	if err != nil {
		t.Fatal(err)
	}
	f.h = h
	return f
}

const startFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

func (f analyzeFixture) post(t *testing.T, body string, header func(*http.Request)) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, AnalyzePattern, strings.NewReader(body))
	if header != nil {
		header(r)
	}
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	return w
}

func asUser(t *testing.T, name string) func(*http.Request) {
	return func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+token(t, name, 0)) }
}

func withKey(key string) func(*http.Request) {
	return func(r *http.Request) { r.Header.Set("X-API-Key", key) }
}

func decode(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("body %q: %v", w.Body.String(), err)
	}
	return out
}

func TestAnalyzeRouteOnlyClaimsPost(t *testing.T) {
	for _, tc := range []struct {
		method, path string
		want         bool
	}{
		{http.MethodPost, "/api/analyze", true},
		{http.MethodGet, "/api/analyze", false},
		{http.MethodPost, "/api/analyze-move", false},
		{http.MethodPost, "/api/analyze/", false},
	} {
		r := httptest.NewRequest(tc.method, tc.path, nil)
		if _, ok := AnalyzeRoute(r); ok != tc.want {
			t.Errorf("%s %s: claimed=%v want %v", tc.method, tc.path, ok, tc.want)
		}
	}
}

func TestAnalyzeAuthenticatesASessionOrAMachineKey(t *testing.T) {
	f := newAnalyzeFixture(t, nil)
	body := `{"fen":"` + startFEN + `"}`
	if w := f.post(t, body, nil); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d %s", w.Code, w.Body)
	}
	if w := f.post(t, body, withKey("wrong")); w.Code != http.StatusUnauthorized {
		t.Fatalf("bad key falls back to the session: %d", w.Code)
	}
	w := f.post(t, body, withKey("machine-key"))
	if w.Code != http.StatusOK || w.Header().Get("X-Chess-Games-Native") != "go" {
		t.Fatalf("machine key: %d %s", w.Code, w.Body)
	}
	if len(f.presence.touched) != 0 {
		t.Fatalf("machine actor touched presence: %v", f.presence.touched)
	}
	w = f.post(t, body, asUser(t, "alice"))
	if w.Code != http.StatusOK {
		t.Fatalf("session: %d %s", w.Code, w.Body)
	}
	got := decode(t, w)
	if got["from"] != "e2" || got["to"] != "e4" || got["san"] != "e4" || got["piece"] != "p" {
		t.Fatalf("suggestion %v", got)
	}
	if _, has := got["candidates"]; has {
		t.Fatalf("no candidateLimit, no shortlist: %v", got)
	}
	if len(f.presence.touched) != 1 || f.presence.touched[0] != "alice" {
		t.Fatalf("presence %v", f.presence.touched)
	}
	if f.mover.level != HintStrength {
		t.Fatalf("default level %v", f.mover.level)
	}
}

func TestAnalyzeValidatesLikePydantic(t *testing.T) {
	f := newAnalyzeFixture(t, nil)
	for _, tc := range []struct {
		body, typ string
		loc       []any
	}{
		{``, "missing", []any{"body"}},
		{`{`, "json_invalid", []any{"body", float64(0)}},
		{`[]`, "model_attributes_type", []any{"body"}},
		{`{}`, "missing", []any{"body", "fen"}},
		{`{"fen":1}`, "string_type", []any{"body", "fen"}},
		{`{"fen":"` + strings.Repeat("x", 129) + `"}`, "string_too_long", []any{"body", "fen"}},
		{`{"fen":"x","level":"high"}`, "float_parsing", []any{"body", "level"}},
		{`{"fen":"x","candidateLimit":2.5}`, "int_parsing", []any{"body", "candidateLimit"}},
		{`{"fen":"x","candidateLimit":1}`, "greater_than_equal", []any{"body", "candidateLimit"}},
		{`{"fen":"x","candidate_limit":6}`, "less_than_equal", []any{"body", "candidate_limit"}},
	} {
		w := f.post(t, tc.body, asUser(t, "alice"))
		if w.Code != http.StatusUnprocessableEntity {
			t.Errorf("%q: %d %s", tc.body, w.Code, w.Body)
			continue
		}
		detail := decode(t, w)["detail"].([]any)[0].(map[string]any)
		loc, _ := json.Marshal(detail["loc"])
		want, _ := json.Marshal(tc.loc)
		if detail["type"] != tc.typ || string(loc) != string(want) {
			t.Errorf("%q: %v", tc.body, detail)
		}
	}
	if f.mover.calls != 0 {
		t.Fatalf("engine ran on invalid input")
	}
}

func TestAnalyzeRulesMirrorPython(t *testing.T) {
	f := newAnalyzeFixture(t, nil)
	user := asUser(t, "alice")
	for _, tc := range []struct {
		fen, detail string
		status      int
	}{
		{"not a fen", "FEN inválido o posición imposible.", http.StatusBadRequest},
		{"k7/8/8/8/8/8/8/K7 w - - 0 1", "Esa posición ya está terminada.", http.StatusBadRequest},
		{"7k/6Q1/6K1/8/8/8/8/8 b - - 0 1", "Esa posición ya está terminada.", http.StatusBadRequest},
	} {
		w := f.post(t, `{"fen":"`+tc.fen+`"}`, user)
		if w.Code != tc.status || decode(t, w)["detail"] != tc.detail {
			t.Errorf("%s: %d %s", tc.fen, w.Code, w.Body)
		}
	}
	// An out-of-range level falls back to HINT_STRENGTH; a lax string parses.
	f.post(t, `{"fen":"`+startFEN+`","level":150}`, user)
	if f.mover.level != HintStrength {
		t.Fatalf("level 150 -> %v", f.mover.level)
	}
	f.post(t, `{"fen":"`+startFEN+`","level":"12.5"}`, user)
	if f.mover.level != 12.5 {
		t.Fatalf("level \"12.5\" -> %v", f.mover.level)
	}
	f.mover.move, f.mover.err = "", errors.New("nothing")
	if w := f.post(t, `{"fen":"`+startFEN+`"}`, user); w.Code != http.StatusNotFound || decode(t, w)["detail"] != "No hay jugadas disponibles." {
		t.Fatalf("no move: %d %s", w.Code, w.Body)
	}
}

func TestAnalyzeAddsTheFactualShortlistNormalisedToTheMover(t *testing.T) {
	f := newAnalyzeFixture(t, nil)
	// Black to move: engine scores are White-positive.
	fen := "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
	f.mover.move = "e7e5"
	f.analyzer.snapshot = residentsearch.Snapshot{Candidates: []residentsearch.Candidate{
		{UCI: "e7e5", Score: -20},
		{UCI: "c7c5", Score: -99500},
		{UCI: "g8f6", Score: 10},
	}}
	w := f.post(t, `{"fen":"`+fen+`","level":40,"candidateLimit":2}`, asUser(t, "alice"))
	if w.Code != http.StatusOK {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	got := decode(t, w)
	if got["san"] != "e5" {
		t.Fatalf("suggestion %v", got)
	}
	list := got["candidates"].([]any)
	if len(list) != 2 {
		t.Fatalf("limit 2: %v", list)
	}
	first, second := list[0].(map[string]any), list[1].(map[string]any)
	if first["moveKey"] != "e7e5" || first["chessScoreCp"] != 20.0 || first["isMate"] != false || first["isLegal"] != true || first["san"] != "e5" {
		t.Fatalf("first %v", first)
	}
	if second["moveKey"] != "c7c5" || second["isMate"] != true {
		t.Fatalf("second %v", second)
	}
	// settings_for_level(40) -> depth min(3, max), budget clamp(0.30*budget).
	if f.analyzer.depth < 1 || f.analyzer.depth > 3 || f.analyzer.budget < 120*time.Millisecond || f.analyzer.budget > 450*time.Millisecond {
		t.Fatalf("pass depth %d budget %v", f.analyzer.depth, f.analyzer.budget)
	}

	// A timed-out shortlist fails open to the plain suggestion.
	f.analyzer.err = residentsearch.ErrTimeout
	got = decode(t, f.post(t, `{"fen":"`+fen+`","candidateLimit":3}`, asUser(t, "alice")))
	if _, has := got["candidates"]; has || got["san"] != "e5" {
		t.Fatalf("timeout: %v", got)
	}
}

func TestAnalyzeSkipsTheShortlistForAForcedMove(t *testing.T) {
	f := newAnalyzeFixture(t, nil)
	f.mover.move = "a1b1"
	f.analyzer.snapshot = residentsearch.Snapshot{Candidates: []residentsearch.Candidate{{UCI: "a1b1"}}}
	got := decode(t, f.post(t, `{"fen":"7k/8/8/8/8/8/6q1/K7 w - - 0 1","candidateLimit":3}`, asUser(t, "alice")))
	if _, has := got["candidates"]; has || f.analyzer.depth != 0 {
		t.Fatalf("forced move searched a shortlist: %v", got)
	}
}

func TestAnalyzeRateLimitsPerUserOrPerKey(t *testing.T) {
	f := newAnalyzeFixture(t, nil)
	body := `{"fen":"` + startFEN + `"}`
	for i := 0; i < 60; i++ {
		if w := f.post(t, body, asUser(t, "alice")); w.Code != http.StatusOK {
			t.Fatalf("request %d: %d", i, w.Code)
		}
	}
	w := f.post(t, body, asUser(t, "alice"))
	if w.Code != http.StatusTooManyRequests || decode(t, w)["error"] != "Rate limit exceeded: 60 per 1 minute" {
		t.Fatalf("61st: %d %s", w.Code, w.Body)
	}
	if w := f.post(t, body, asUser(t, "bob")); w.Code != http.StatusOK {
		t.Fatalf("other user shares no bucket: %d", w.Code)
	}
	for i := 0; i < 1000; i++ {
		if w := f.post(t, body, withKey("machine-key")); w.Code != http.StatusOK {
			t.Fatalf("key request %d: %d", i, w.Code)
		}
	}
	w = f.post(t, body, withKey("machine-key"))
	if w.Code != http.StatusTooManyRequests || decode(t, w)["error"] != "Rate limit exceeded: 1000 per 1 minute" {
		t.Fatalf("1001st key request: %d %s", w.Code, w.Body)
	}
}

func TestAnalyzeIsOptionalWorkThatYieldsToGameplay(t *testing.T) {
	pool := NewEnginePool(2, 1)
	f := newAnalyzeFixture(t, pool)
	f.mover.block = make(chan struct{})
	done := make(chan *httptest.ResponseRecorder)
	go func() { done <- f.post(t, `{"fen":"`+startFEN+`"}`, asUser(t, "alice")) }()
	deadline := time.Now().Add(2 * time.Second)
	for pool.optionalInFlight() == 0 {
		if time.Now().After(deadline) {
			t.Fatal("first analysis never started")
		}
		time.Sleep(time.Millisecond)
	}
	w := f.post(t, `{"fen":"`+startFEN+`"}`, asUser(t, "bob"))
	if w.Code != http.StatusServiceUnavailable || w.Header().Get("Retry-After") != "1" ||
		decode(t, w)["detail"] != "Análisis temporalmente ocupado. Reintenta en un instante." {
		t.Fatalf("busy: %d %v %s", w.Code, w.Header(), w.Body)
	}
	close(f.mover.block)
	if w := <-done; w.Code != http.StatusOK {
		t.Fatalf("first: %d", w.Code)
	}
}

func (p *EnginePool) optionalInFlight() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.optional
}

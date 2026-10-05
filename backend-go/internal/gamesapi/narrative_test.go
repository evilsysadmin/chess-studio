package gamesapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matthiasmem"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/narrative"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

type fakeMemory struct {
	calls      []string
	memory     bson.D
	contextErr error
	replay     bson.D
	claim      matthiasmem.Claim
	reserveErr error
	commitErr  error
	released   []string
	recorded   []string
	positions  int
}

func (f *fakeMemory) Memory(context.Context, string) (bson.D, error) { return f.memory, nil }
func (f *fakeMemory) ObserveFacts(context.Context, string, bson.D, time.Time) error {
	f.calls = append(f.calls, "observe")
	return nil
}
func (f *fakeMemory) ObserveEpisodes(context.Context, string, bson.D, time.Time) (bson.D, error) {
	f.calls = append(f.calls, "episodes")
	return nil, nil
}
func (f *fakeMemory) Context(context.Context, string, bson.D, time.Time) (bson.D, error) {
	f.calls = append(f.calls, "context")
	return bson.D{{Key: "consultation_count", Value: int64(3)}}, f.contextErr
}
func (f *fakeMemory) Replay(context.Context, string, any) (bson.D, error) { return f.replay, nil }
func (f *fakeMemory) RecordConsultation(_ context.Context, _ string, kind, text any, _ bson.D, _ any, _ time.Time) (bool, error) {
	f.recorded = append(f.recorded, kind.(string)+":"+text.(string))
	return true, nil
}
func (f *fakeMemory) RecordEmblematicPosition(context.Context, string, bson.D, time.Time) (bool, error) {
	f.positions++
	return true, nil
}
func (f *fakeMemory) Reserve(context.Context, string, time.Time) (matthiasmem.Claim, error) {
	return f.claim, f.reserveErr
}
func (f *fakeMemory) Release(_ context.Context, _ string, reservation string, _ time.Time) {
	f.released = append(f.released, reservation)
}
func (f *fakeMemory) Commit(_ context.Context, _ string, _ string, kind, answer string, _ time.Time) (bson.D, error) {
	if f.commitErr != nil {
		return nil, f.commitErr
	}
	return bson.D{{Key: "day", Value: "2026-10-05"}, {Key: "used", Value: true}, {Key: "pending", Value: false}, {Key: "questionKind", Value: kind}, {Key: "text", Value: answer}}, nil
}
func (f *fakeMemory) AdminRows(context.Context) ([]bson.D, error) {
	return []bson.D{{{Key: "consultation_count", Value: int32(2)}, {Key: "question_counts", Value: bson.D{{Key: "tactics", Value: int32(2)}}}}}, nil
}

type fakeGateway struct {
	result   narrative.Result
	events   []string
	facts    []bson.D
	kinds    []string
	inflight int64
	shed     bool
	sheds    int
}

func (g *fakeGateway) Generate(_ context.Context, eventType string, facts bson.D, _, _ *string, kind string, _ *string) narrative.Result {
	g.events = append(g.events, eventType)
	g.facts = append(g.facts, facts)
	g.kinds = append(g.kinds, kind)
	return g.result
}
func (g *fakeGateway) Metrics() bson.D { return bson.D{{Key: "samples", Value: int64(len(g.events))}} }
func (g *fakeGateway) EventMetrics(string, int64) bson.D {
	return bson.D{{Key: "calls", Value: int64(0)}}
}
func (g *fakeGateway) Enter() int64          { g.inflight++; return g.inflight }
func (g *fakeGateway) Exit()                 { g.inflight-- }
func (g *fakeGateway) ShouldShed(int64) bool { return g.shed }
func (g *fakeGateway) RecordShed()           { g.sheds++ }

func newNarrativeFixture(t *testing.T, admins ...string) (*NarrativeHandler, *fakeMemory, *fakeGateway, *[]string) {
	t.Helper()
	mem := &fakeMemory{claim: matthiasmem.Claim{Claimed: true, Reservation: "r1"}}
	gw := &fakeGateway{result: narrative.Result{Text: "Achtung.", Provider: "cloudflare", LatencyMS: 12.34, Model: "m"}}
	var logs []string
	h, err := NewNarrative(NarrativeConfig{
		Config:         Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Memory:         mem,
		Gateway:        gw,
		AdminUsernames: admins,
		Env:            func(string) string { return "" },
		Log:            func(l string) { logs = append(logs, l) },
	})
	if err != nil {
		t.Fatal(err)
	}
	return h, mem, gw, &logs
}

func TestNarrativeRoutes(t *testing.T) {
	for _, c := range []struct {
		method, path string
		native       bool
	}{
		{"POST", NarrativePattern, true}, {"GET", NarrativePattern, false}, {"POST", MatthiasAudiencePath, true},
		{"GET", MatthiasAudiencePath, false}, {"GET", AdminAIMetricsPattern, true}, {"GET", AdminMatthiasPattern, true},
		{"GET", "/api/admin/observability", false},
	} {
		if _, ok := NarrativeRoute(httptest.NewRequest(c.method, c.path, nil)); ok != c.native {
			t.Errorf("%s %s native=%v", c.method, c.path, ok)
		}
	}
}

func TestNarrativeValidation(t *testing.T) {
	h, _, gw, _ := newNarrativeFixture(t)
	for body, want := range map[string]string{
		``:                   `"loc":["body"]`,
		`{"facts":[1]}`:      `"loc":["body","facts"],"msg":"Input should be a valid dictionary","type":"dict_type"`,
		`{"eventType":null}`: `"loc":["body","eventType"],"msg":"Input should be a valid string","type":"string_type"`,
		`{"locale":"` + strings.Repeat("x", 17) + `"}`: `String should have at most 16 characters`,
	} {
		w := feedbackDo(t, h, http.MethodPost, NarrativePattern, body, "alice")
		if w.Code != 422 || !strings.Contains(w.Body.String(), want) {
			t.Errorf("%q: %d %s", body, w.Code, w.Body)
		}
	}
	if len(gw.events) != 0 {
		t.Fatal("invalid requests reached the gateway")
	}
}

func TestNarrativeAnswersAndKeepsFactOrder(t *testing.T) {
	h, mem, gw, _ := newNarrativeFixture(t)
	w := feedbackDo(t, h, http.MethodPost, NarrativePattern, `{"eventType":"blunder","requestKind":" WEIRD ","facts":{"z":1,"a":2.0}}`, "alice")
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"text":"Achtung.","provider":"cloudflare","latencyMs":12.3,"model":"m"}` || w.Header().Get("X-Chess-Narrative-Native") != "go" {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if encode(gw.facts[0]) != `{"z":1,"a":2.0}` || gw.kinds[0] != "default" || len(mem.calls) != 0 {
		t.Fatalf("facts %s kind %s calls %v", encode(gw.facts[0]), gw.kinds[0], mem.calls)
	}
}

func encode(v any) string {
	out, _ := pydoc.Encode(v)
	return string(out)
}

func TestNarrativePortraitObservesMemoryAndCoolsDown(t *testing.T) {
	h, mem, gw, logs := newNarrativeFixture(t)
	body := `{"eventType":"player_portrait","requestKind":"portrait_manual","facts":{"total_games":3}}`
	if w := feedbackDo(t, h, http.MethodPost, NarrativePattern, body, "alice"); w.Code != 200 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if strings.Join(mem.calls, ",") != "observe,episodes,context" || encode(gw.facts[0]) != `{"total_games":3,"matthias_memory":{"consultation_count":3}}` {
		t.Fatalf("calls %v facts %s", mem.calls, encode(gw.facts[0]))
	}
	w := feedbackDo(t, h, http.MethodPost, NarrativePattern, body, "Alice")
	if w.Code != 429 || w.Header().Get("Retry-After") != "21600" || !strings.Contains(w.Body.String(), "Player portrait manual refresh cooldown") {
		t.Fatalf("cooldown: %d %s %s", w.Code, w.Header().Get("Retry-After"), w.Body)
	}
	if len(*logs) != 1 || !strings.Contains((*logs)[0], "narrative_429") || !strings.Contains((*logs)[0], "bucket=player_portrait") {
		t.Fatalf("logs %v", *logs)
	}
	// A local fallback never spends the manual window.
	h2, _, gw2, _ := newNarrativeFixture(t)
	gw2.result = narrative.Result{Text: "local", Provider: "local"}
	for i := 0; i < 2; i++ {
		if w := feedbackDo(t, h2, http.MethodPost, NarrativePattern, body, "alice"); w.Code != 200 {
			t.Fatalf("fallback %d: %d", i, w.Code)
		}
	}
	// Admins bypass the cooldown.
	h3, _, _, _ := newNarrativeFixture(t, "alice")
	for i := 0; i < 2; i++ {
		if w := feedbackDo(t, h3, http.MethodPost, NarrativePattern, body, "alice"); w.Code != 200 {
			t.Fatalf("admin %d: %d", i, w.Code)
		}
	}
}

func TestNarrativeMemoryFailureKeepsPlainFacts(t *testing.T) {
	h, mem, gw, logs := newNarrativeFixture(t)
	mem.contextErr = errors.New("down")
	if w := feedbackDo(t, h, http.MethodPost, NarrativePattern, `{"eventType":"post_game_autopsy","facts":{"a":1}}`, "alice"); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if encode(gw.facts[0]) != `{"a":1}` || !strings.Contains(strings.Join(*logs, "\n"), "matthias_memory_context_failed event_type=post_game_autopsy") {
		t.Fatalf("facts %s logs %v", encode(gw.facts[0]), *logs)
	}
}

func TestNarrativeCommentBucketAndPositionMemory(t *testing.T) {
	h, mem, _, _ := newNarrativeFixture(t)
	for i := 0; i < 30; i++ {
		if w := feedbackDo(t, h, http.MethodPost, NarrativePattern, `{"eventType":"blunder"}`, "alice"); w.Code != 200 {
			t.Fatalf("%d: %d", i, w.Code)
		}
	}
	if w := feedbackDo(t, h, http.MethodPost, NarrativePattern, `{"eventType":"blunder"}`, "alice"); w.Code != 429 || !strings.Contains(w.Body.String(), "Narrative rate limit exceeded") {
		t.Fatalf("31st comment: %d %s", w.Code, w.Body)
	}
	// Rich analysis has its own bucket.
	if w := feedbackDo(t, h, http.MethodPost, NarrativePattern, `{"eventType":"matthias_position","facts":{"fen":"x"}}`, "alice"); w.Code != 200 || mem.positions != 1 {
		t.Fatalf("position: %d positions=%d", w.Code, mem.positions)
	}
}

func TestNarrativeShedsUnderPressure(t *testing.T) {
	h, _, gw, _ := newNarrativeFixture(t)
	gw.shed = true
	w := feedbackDo(t, h, http.MethodPost, NarrativePattern, `{}`, "alice")
	if w.Code != 503 || w.Header().Get("Retry-After") != "5" || !strings.Contains(w.Body.String(), `"degraded":true`) || gw.inflight != 0 || gw.sheds != 1 {
		t.Fatalf("%d %s inflight=%d", w.Code, w.Body, gw.inflight)
	}
}

func TestAudienceCommitsACloudAnswer(t *testing.T) {
	h, mem, gw, _ := newNarrativeFixture(t)
	body := `{"questionKind":"tactics","facts":{"total_games":5,"secret":"x","record":{"wins":1}},"consultationId":"c-1"}`
	w := feedbackDo(t, h, http.MethodPost, MatthiasAudiencePath, body, "alice")
	got := w.Body.String()
	if w.Code != 200 || !strings.HasPrefix(got, `{"day":"2026-10-05","used":true,"pending":false,"questionKind":"tactics","text":"Achtung.","unlimited":false,"provider":"cloudflare","retryable":false,"memory":{"schemaVersion":5`) {
		t.Fatalf("%d %s", w.Code, got)
	}
	if encode(gw.facts[0]) != `{"total_games":5,"record":{"wins":1},"question_kind":"tactics","matthias_memory":{"consultation_count":3}}` || gw.kinds[0] != "matthias_tactics" || gw.events[0] != "matthias_daily" {
		t.Fatalf("worker facts %s kind %s", encode(gw.facts[0]), gw.kinds[0])
	}
	if strings.Join(mem.recorded, ",") != "tactics:Achtung." || len(mem.released) != 0 {
		t.Fatalf("recorded %v released %v", mem.recorded, mem.released)
	}
}

func TestAudienceRefusals(t *testing.T) {
	cases := []struct {
		name   string
		body   string
		setup  func(*fakeMemory, *fakeGateway)
		status int
		want   string
	}{
		{"kind", `{"questionKind":"chat"}`, nil, 400, "Consulta de Matthias no válida."},
		{"no games", `{"questionKind":"improve","facts":{"total_games":0}}`, nil, 409, "Juega al menos una partida"},
		{"bad games", `{"questionKind":"improve","facts":{"total_games":"abc"}}`, nil, 500, ""},
		{"missing kind", `{"facts":{}}`, nil, 422, `"loc":["body","questionKind"]`},
		{"used", `{"questionKind":"improve","facts":{"total_games":2}}`, func(m *fakeMemory, _ *fakeGateway) {
			m.claim = matthiasmem.Claim{Status: bson.D{{Key: "used", Value: true}}}
		}, 429, "ya ha concedido su audiencia de hoy"},
		{"pending", `{"questionKind":"improve","facts":{"total_games":2}}`, func(m *fakeMemory, _ *fakeGateway) {
			m.claim = matthiasmem.Claim{Status: bson.D{{Key: "used", Value: false}}}
		}, 409, "una audiencia a la vez"},
		{"ledger down", `{"questionKind":"improve","facts":{"total_games":2}}`, func(m *fakeMemory, _ *fakeGateway) {
			m.reserveErr = errors.New("down")
		}, 503, ""},
		{"replay other kind", `{"questionKind":"improve","facts":{"total_games":2},"consultationId":"c"}`, func(m *fakeMemory, _ *fakeGateway) {
			m.replay = bson.D{{Key: "questionKind", Value: "tactics"}, {Key: "text", Value: "old"}}
		}, 409, "ya pertenece a otra pregunta"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, mem, gw, _ := newNarrativeFixture(t)
			if c.setup != nil {
				c.setup(mem, gw)
			}
			w := feedbackDo(t, h, http.MethodPost, MatthiasAudiencePath, c.body, "alice")
			if w.Code != c.status || !strings.Contains(w.Body.String(), c.want) {
				t.Fatalf("%d %s", w.Code, w.Body)
			}
		})
	}
}

func TestAudienceFallbackReleasesAndCommitFailureIs503(t *testing.T) {
	h, mem, gw, _ := newNarrativeFixture(t)
	gw.result = narrative.Result{Text: "Achtung: hoy no.", Provider: "local"}
	w := feedbackDo(t, h, http.MethodPost, MatthiasAudiencePath, `{"questionKind":"improve","facts":{"total_games":2}}`, "alice")
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"used":false,"pending":false,"unlimited":false,"provider":"local","text":"Achtung: hoy no.","retryable":true}` || strings.Join(mem.released, ",") != "r1" {
		t.Fatalf("%d %s released %v", w.Code, w.Body, mem.released)
	}
	h, mem, _, _ = newNarrativeFixture(t)
	mem.commitErr = matthiasmem.ErrReservationLost
	if w := feedbackDo(t, h, http.MethodPost, MatthiasAudiencePath, `{"questionKind":"improve","facts":{"total_games":2}}`, "alice"); w.Code != 503 || strings.Join(mem.released, ",") != "r1" {
		t.Fatalf("commit lost: %d released %v", w.Code, mem.released)
	}
}

func TestAudienceAdminAndReplay(t *testing.T) {
	h, mem, _, _ := newNarrativeFixture(t, "alice")
	w := feedbackDo(t, h, http.MethodPost, MatthiasAudiencePath, `{"questionKind":"openings","facts":{"total_games":2}}`, "alice")
	if w.Code != 200 || !strings.HasPrefix(w.Body.String(), `{"used":false,"pending":false,"unlimited":true,"questionKind":"openings","text":"Achtung.","provider":"cloudflare","retryable":false,"memory":`) || len(mem.released) != 0 {
		t.Fatalf("admin: %d %s", w.Code, w.Body)
	}
	h, mem, gw, _ := newNarrativeFixture(t)
	mem.replay = bson.D{{Key: "questionKind", Value: "improve"}, {Key: "text", Value: "Consejo guardado."}}
	w = feedbackDo(t, h, http.MethodPost, MatthiasAudiencePath, `{"questionKind":"improve","facts":{"total_games":2},"consultationId":"c"}`, "alice")
	if w.Code != 200 || !strings.HasPrefix(w.Body.String(), `{"used":true,"pending":false,"unlimited":false,"questionKind":"improve","text":"Consejo guardado.","provider":"cloudflare","retryable":false,"replayed":true,"memory":`) || len(gw.events) != 0 {
		t.Fatalf("replay: %d %s", w.Code, w.Body)
	}
}

func TestAdminNarrativeReads(t *testing.T) {
	h, _, _, _ := newNarrativeFixture(t, "root")
	if w := feedbackDo(t, h, http.MethodGet, AdminAIMetricsPattern, "", "alice"); w.Code != 403 || !strings.Contains(w.Body.String(), "No tienes permisos de administrador.") {
		t.Fatalf("non-admin: %d %s", w.Code, w.Body)
	}
	if w := feedbackDo(t, h, http.MethodGet, AdminAIMetricsPattern, "", ""); w.Code != 401 {
		t.Fatalf("anonymous: %d", w.Code)
	}
	if w := feedbackDo(t, h, http.MethodGet, AdminAIMetricsPattern, "", "root"); w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"samples":0}` {
		t.Fatalf("metrics: %d %s", w.Code, w.Body)
	}
	w := feedbackDo(t, h, http.MethodGet, AdminMatthiasPattern, "", "root")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"consultations":2,"usersWithMemory":1,"topQuestionKind":"tactics"`) || !strings.HasSuffix(strings.TrimSpace(w.Body.String()), `"aiToday":{"calls":0}}`) {
		t.Fatalf("matthias status: %d %s", w.Code, w.Body)
	}
}

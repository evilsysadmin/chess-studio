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
)

type fakeMatthiasStore struct {
	memory, daily       bson.D
	memoryErr, dailyErr error
	deleted             []string
}

func (f *fakeMatthiasStore) Memory(context.Context, string) (bson.D, error) {
	return f.memory, f.memoryErr
}
func (f *fakeMatthiasStore) Daily(context.Context, string) (bson.D, error) {
	return f.daily, f.dailyErr
}
func (f *fakeMatthiasStore) DeleteMemory(_ context.Context, u string) error {
	f.deleted = append(f.deleted, u)
	return f.memoryErr
}

func newMatthiasFixture(t *testing.T, store *fakeMatthiasStore, admins ...string) *MatthiasHandler {
	t.Helper()
	h, err := NewMatthias(MatthiasConfig{
		Config:         Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Matthias:       store,
		AdminUsernames: admins,
	})
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func TestMatthiasRouteKeepsTheAudienceInPython(t *testing.T) {
	for _, c := range []struct {
		method, path string
		native       bool
	}{
		{"GET", MatthiasDailyPattern, true}, {"POST", MatthiasDailyPattern, false},
		{"GET", MatthiasBriefingPattern, true}, {"POST", MatthiasResetPattern, true},
		{"GET", MatthiasResetPattern, false}, {"GET", "/api/admin/matthias-status", false},
	} {
		if _, ok := MatthiasRoute(httptest.NewRequest(c.method, c.path, nil)); ok != c.native {
			t.Errorf("%s %s: native=%v", c.method, c.path, ok)
		}
	}
}

func TestMatthiasDailyStatusShape(t *testing.T) {
	day := fixedNow.In(mustMadrid(t)).Format("2006-01-02")
	store := &fakeMatthiasStore{
		daily:  bson.D{{Key: "_id", Value: "alice"}, {Key: "day", Value: day}, {Key: "state", Value: "used"}, {Key: "question_kind", Value: "tactics"}, {Key: "text", Value: "Calcule."}},
		memory: bson.D{{Key: "consultation_count", Value: int32(2)}, {Key: "mood", Value: "pleased"}},
	}
	w := feedbackDo(t, newMatthiasFixture(t, store), http.MethodGet, MatthiasDailyPattern, "", "alice")
	body := w.Body.String()
	if w.Code != 200 || w.Header().Get("X-Chess-Matthias-Native") != "go" {
		t.Fatalf("%d %s", w.Code, body)
	}
	want := `{"day":"` + day + `","used":true,"pending":false,"questionKind":"tactics","text":"Calcule.","unlimited":false,"memory":{"schemaVersion":5,"consultations":2,`
	if !strings.HasPrefix(body, want) || !strings.Contains(body, `"mood":"pleased"`) || !strings.HasSuffix(strings.TrimSpace(body), `"episodicMemory":{"episodeCount":0,"recentEpisodes":[],"callbackCandidates":[]}}}`) {
		t.Fatalf("body: %s", body)
	}
}

func TestMatthiasDailyFallbacks(t *testing.T) {
	store := &fakeMatthiasStore{memoryErr: errors.New("down")}
	w := feedbackDo(t, newMatthiasFixture(t, store, "Alice"), http.MethodGet, MatthiasDailyPattern, "", "alice")
	want := `{"used":false,"pending":false,"unlimited":true,"memory":{"consultations":0,"lastConsultedAt":null,"mainAdvice":null,"episodicMemory":{"episodeCount":0,"recentEpisodes":[],"callbackCandidates":[]}}}`
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != want {
		t.Fatalf("admin with memory down: %d %s", w.Code, w.Body)
	}
	store = &fakeMatthiasStore{dailyErr: errors.New("down")}
	if w := feedbackDo(t, newMatthiasFixture(t, store), http.MethodGet, MatthiasDailyPattern, "", "alice"); w.Code != 503 {
		t.Fatalf("daily ledger down: %d", w.Code)
	}
	// A corrupted counter makes Python's summary raise: the route keeps the
	// status and answers the empty memory.
	store = &fakeMatthiasStore{memory: bson.D{{Key: "consultation_count", Value: "abc"}}}
	w = feedbackDo(t, newMatthiasFixture(t, store), http.MethodGet, MatthiasDailyPattern, "", "alice")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"memory":{"consultations":0,"lastConsultedAt":null`) {
		t.Fatalf("corrupt memory: %d %s", w.Code, w.Body)
	}
}

func TestMatthiasBriefing(t *testing.T) {
	store := &fakeMatthiasStore{memory: bson.D{{Key: "active_goals", Value: bson.A{bson.D{{Key: "id", Value: "g"}, {Key: "label", Value: "Proteger la dama"}}}}}}
	w := feedbackDo(t, newMatthiasFixture(t, store), http.MethodGet, MatthiasBriefingPattern, "", "alice")
	if w.Code != 200 || !strings.HasPrefix(w.Body.String(), `{"text":"Achtung. Mi obsesión actual sigue siendo: Proteger la dama.`) || !strings.Contains(w.Body.String(), `"memory":{"schemaVersion":5`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	store.memoryErr = errors.New("down")
	w = feedbackDo(t, newMatthiasFixture(t, store), http.MethodGet, MatthiasBriefingPattern, "", "alice")
	if w.Code != 200 || !strings.HasSuffix(strings.TrimSpace(w.Body.String()), `obligaciones.","memory":null}`) {
		t.Fatalf("fallback: %d %s", w.Code, w.Body)
	}
}

func TestMatthiasResetMemory(t *testing.T) {
	store := &fakeMatthiasStore{}
	h := newMatthiasFixture(t, store)
	// No body model: a malformed body is never parsed.
	w := feedbackDo(t, h, http.MethodPost, MatthiasResetPattern, "{bad", "alice")
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"reset":true}` || len(store.deleted) != 1 {
		t.Fatalf("%d %s %v", w.Code, w.Body, store.deleted)
	}
	store.memoryErr = errors.New("down")
	if w := feedbackDo(t, h, http.MethodPost, MatthiasResetPattern, "", "alice"); w.Code != 503 {
		t.Fatalf("reset with storage down: %d", w.Code)
	}
	if w := feedbackDo(t, h, http.MethodPost, MatthiasResetPattern, "", ""); w.Code != 401 || w.Header().Get("X-Chess-Matthias-Native") != "go" {
		t.Fatalf("anonymous: %d", w.Code)
	}
}

func TestMatthiasDefaultLimitRunsBeforeAuth(t *testing.T) {
	h := newMatthiasFixture(t, &fakeMatthiasStore{})
	for i := 0; i < 120; i++ {
		feedbackDo(t, h, http.MethodGet, MatthiasBriefingPattern, "", "")
	}
	w := feedbackDo(t, h, http.MethodGet, MatthiasBriefingPattern, "", "")
	if w.Code != 429 || !strings.Contains(w.Body.String(), "120 per 1 minute") {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func mustMadrid(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

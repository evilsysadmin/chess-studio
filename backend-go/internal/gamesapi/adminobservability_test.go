package gamesapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/obshistory"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

type obsGateway struct {
	pressure bson.D
	health   bson.D
	shed     bool
	sheds    int
	inflight int64
}

func (g *obsGateway) Enter() int64             { g.inflight++; return g.inflight }
func (g *obsGateway) Exit()                    { g.inflight-- }
func (g *obsGateway) ShouldShed(int64) bool    { return g.shed }
func (g *obsGateway) RecordShed()              { g.sheds++ }
func (g *obsGateway) Pressure() bson.D         { return g.pressure }
func (g *obsGateway) DependencyHealth() bson.D { return g.health }

type obsDeployments struct {
	rows    bson.A
	ensured int
}

func (d *obsDeployments) EnsureCurrent(context.Context) { d.ensured++ }
func (d *obsDeployments) List(context.Context) bson.A   { return d.rows }

func decodeDoc(t *testing.T, raw json.RawMessage) bson.D {
	t.Helper()
	v, err := pydoc.Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	return v.(bson.D)
}

func TestAdminObservabilityMatchesPythonCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/python_admin_observability_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Fixtures struct {
			History, HTTP, Pressure, Tracing json.RawMessage
			Deployments                      json.RawMessage
		} `json:"fixtures"`
		Steps []struct {
			Label, Query, History string
			User                  *string
			Database, AI          json.RawMessage
			HistoryDoc            json.RawMessage `json:"historyDoc"`
			Deployments           json.RawMessage `json:"deployments"`
			Env                   map[string]string
			Status                int
			Response              *string
			HistoryCalls          [][2]*string `json:"historyCalls"`
			Ensured               int          `json:"ensured"`
		} `json:"steps"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	deploymentsDefault, err := pydoc.Decode(corpus.Fixtures.Deployments)
	if err != nil {
		t.Fatal(err)
	}
	for _, step := range corpus.Steps {
		history := decodeDoc(t, corpus.Fixtures.History)
		if step.HistoryDoc != nil {
			history = decodeDoc(t, step.HistoryDoc)
		}
		deployments := &obsDeployments{rows: deploymentsDefault.(bson.A)}
		if step.Deployments != nil {
			rows, _ := pydoc.Decode(step.Deployments)
			deployments.rows = rows.(bson.A)
		}
		var calls [][2]*string
		gw := &obsGateway{pressure: decodeDoc(t, corpus.Fixtures.Pressure), health: decodeDoc(t, step.AI)}
		h, err := NewAdminObservability(AdminObservabilityConfig{
			Config: Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
			History: func(_ context.Context, from, to *string, now time.Time) (bson.D, error) {
				calls = append(calls, [2]*string{from, to})
				switch step.History {
				case "value_error":
					return nil, &obshistory.RangeError{Message: "El rango máximo de observabilidad es de 90 días."}
				case "type_error":
					return nil, obshistory.ErrRaised
				}
				return history, nil
			},
			HTTP:           func() bson.D { return decodeDoc(t, corpus.Fixtures.HTTP) },
			Database:       func(context.Context) bson.D { return decodeDoc(t, step.Database) },
			Gateway:        gw,
			Deployments:    deployments,
			Tracing:        func() bson.D { return decodeDoc(t, corpus.Fixtures.Tracing) },
			Env:            func(k string) string { return step.Env[k] },
			AdminUsernames: []string{"root"},
		})
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest(http.MethodGet, "/api/admin/observability"+step.Query, nil)
		if step.User != nil {
			r.Header.Set("Authorization", "Bearer "+longToken(*step.User))
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		got := strings.TrimSuffix(w.Body.String(), "\n")
		if w.Code != step.Status {
			t.Errorf("%s: status %d want %d: %s", step.Label, w.Code, step.Status, got)
			continue
		}
		if step.Response != nil && step.User != nil && got != *step.Response {
			t.Errorf("%s:\ngot  %s\nwant %s", step.Label, got, *step.Response)
		}
		if fmt.Sprint(derefPairs(calls)) != fmt.Sprint(derefPairs(step.HistoryCalls)) || deployments.ensured != step.Ensured {
			t.Errorf("%s: history calls %v ensured %d, want %v %d", step.Label, derefPairs(calls), deployments.ensured, derefPairs(step.HistoryCalls), step.Ensured)
		}
	}
}

func derefPairs(pairs [][2]*string) []string {
	var out []string
	for _, p := range pairs {
		s := ""
		for _, v := range p {
			if v == nil {
				s += "None|"
			} else {
				s += fmt.Sprintf("%q|", *v)
			}
		}
		out = append(out, s)
	}
	return out
}

func TestAdminObservabilityShedsUnderPressure(t *testing.T) {
	gw := &obsGateway{shed: true}
	h, err := NewAdminObservability(AdminObservabilityConfig{
		Config: Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		History: func(context.Context, *string, *string, time.Time) (bson.D, error) {
			t.Fatal("history read while shedding")
			return nil, nil
		},
		HTTP:        func() bson.D { return bson.D{} },
		Database:    func(context.Context) bson.D { return bson.D{} },
		Gateway:     gw,
		Deployments: &obsDeployments{},
		Tracing:     func() bson.D { return bson.D{} },
	})
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/admin/observability", nil))
	if w.Code != 503 || w.Header().Get("Retry-After") != "5" || gw.sheds != 1 || gw.inflight != 0 || !strings.Contains(w.Body.String(), `"degraded":true`) {
		t.Fatalf("%d %s sheds=%d inflight=%d", w.Code, w.Body, gw.sheds, gw.inflight)
	}
}

func TestDatabaseMetricsMirrorsPython(t *testing.T) {
	ok := DatabaseMetrics(context.Background(), func(context.Context) error { return nil })
	if s, _ := pydoc.Get(ok, "status"); s != "ok" || len(ok) != 3 {
		t.Fatalf("%v", ok)
	}
	slow := DatabaseMetrics(context.Background(), func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() })
	if e, _ := pydoc.Get(slow, "error"); e != "TimeoutError" {
		t.Fatalf("%v", slow)
	}
	down := DatabaseMetrics(context.Background(), func(context.Context) error {
		return errors.New("server selection error: context deadline exceeded")
	})
	if e, _ := pydoc.Get(down, "error"); e != "ServerSelectionTimeoutError" {
		t.Fatalf("%v", down)
	}
	if s, _ := pydoc.Get(down, "status"); s != "down" {
		t.Fatalf("%v", down)
	}
}

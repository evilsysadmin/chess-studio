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

	"github.com/evilsysadmin/chess-studio/backend-go/internal/obshistory"
)

type fakeCounter struct {
	count   int
	err     error
	since   string
	exclude []string
	calls   int
}

func (f *fakeCounter) CountOnline(_ context.Context, since string, exclude []string) (int, error) {
	f.calls++
	f.since, f.exclude = since, exclude
	return f.count, f.err
}

type fakeSystemHistory struct {
	presence []int
	frontend []obshistory.FrontendEvent
}

func (f *fakeSystemHistory) RecordPresence(online int) { f.presence = append(f.presence, online) }
func (f *fakeSystemHistory) RecordFrontend(event obshistory.FrontendEvent) {
	f.frontend = append(f.frontend, event)
}

type fakeMetrics struct {
	events []string
	lines  []string
}

func (f *fakeMetrics) RecordFrontend(eventType, metricName string, value *float64, frontendContext, release string) {
	v := "nil"
	if value != nil {
		v = strings.TrimRight(strings.TrimRight(jsonNumber(*value), "0"), ".")
	}
	f.events = append(f.events, eventType+"|"+metricName+"|"+v+"|"+frontendContext+"|"+release)
}

func (f *fakeMetrics) LogLine(line string) { f.lines = append(f.lines, line) }

func jsonNumber(v float64) string {
	b, _ := json.Marshal(v)
	return string(b)
}

type systemFixture struct {
	h        *SystemHandler
	counter  *fakeCounter
	history  *fakeSystemHistory
	metrics  *fakeMetrics
	presence *fakePresence
}

func newSystemFixture(t *testing.T, admins []string, disabled string) systemFixture {
	t.Helper()
	f := systemFixture{counter: &fakeCounter{count: 7}, history: &fakeSystemHistory{}, metrics: &fakeMetrics{}, presence: &fakePresence{}}
	h, err := NewSystem(SystemConfig{
		Config:           Config{Accounts: fakeAccounts{}, Presence: f.presence, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Counter:          f.counter,
		History:          f.history,
		Metrics:          f.metrics,
		AdminUsernames:   admins,
		DisabledFeatures: disabled,
	})
	if err != nil {
		t.Fatal(err)
	}
	f.h = h
	return f
}

func (f systemFixture) do(t *testing.T, method, path, body string, user string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if user != "" {
		r.Header.Set("Authorization", "Bearer "+token(t, user, 0))
	}
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	return w
}

func TestSystemRouteClaimsOnlyItsRoutes(t *testing.T) {
	for _, tc := range []struct {
		method, path string
		want         bool
	}{
		{http.MethodGet, "/api/status", true},
		{http.MethodGet, "/api/features", true},
		{http.MethodPost, "/api/client-telemetry", true},
		{http.MethodPost, "/api/status", false},
		{http.MethodGet, "/api/client-telemetry", false},
		{http.MethodGet, "/api/health", false},
		{http.MethodGet, "/api/status/", false},
	} {
		if _, ok := SystemRoute(httptest.NewRequest(tc.method, tc.path, nil)); ok != tc.want {
			t.Errorf("%s %s claimed=%v", tc.method, tc.path, ok)
		}
	}
}

func TestStatusCountsOnlineAccountsWithoutAdmins(t *testing.T) {
	f := newSystemFixture(t, []string{" Root ", "", "ops", "root"}, "")
	if w := f.do(t, http.MethodGet, StatusPattern, "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", w.Code)
	}
	w := f.do(t, http.MethodGet, StatusPattern, "", "alice")
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != `{"ok":true,"onlineUsers":7,"presenceAvailable":true}` {
		t.Fatalf("status: %d %s", w.Code, w.Body)
	}
	if strings.Join(f.counter.exclude, ",") != "ops,root" {
		t.Fatalf("excluded %v", f.counter.exclude)
	}
	since, err := time.Parse("2006-01-02T15:04:05.999999-07:00", f.counter.since)
	if err != nil || !since.Equal(fixedNow.Add(-150*time.Second)) {
		t.Fatalf("since %q (%v)", f.counter.since, err)
	}
	if len(f.history.presence) != 1 || f.history.presence[0] != 7 || len(f.presence.touched) != 1 {
		t.Fatalf("presence sample %v touched %v", f.history.presence, f.presence.touched)
	}
}

func TestStatusDegradesWhenPresenceIsUnavailable(t *testing.T) {
	f := newSystemFixture(t, nil, "")
	f.counter.err = errors.New("mongo down")
	got := decode(t, f.do(t, http.MethodGet, StatusPattern, "", "alice"))
	if got["ok"] != true || got["onlineUsers"] != nil || got["presenceAvailable"] != false {
		t.Fatalf("degraded %v", got)
	}
	if len(f.history.presence) != 0 {
		t.Fatalf("no sample without a count: %v", f.history.presence)
	}
}

func TestStatusWithEveryoneAdminCountsZeroWithoutQuerying(t *testing.T) {
	f := newSystemFixture(t, []string{"*"}, "")
	got := decode(t, f.do(t, http.MethodGet, StatusPattern, "", "alice"))
	if got["onlineUsers"] != 0.0 || f.counter.calls != 0 {
		t.Fatalf("all admins: %v calls=%d", got, f.counter.calls)
	}
}

func TestFeaturesHonourDisabledList(t *testing.T) {
	f := newSystemFixture(t, nil, " SPECTATOR, unknown ,")
	w := f.do(t, http.MethodGet, FeaturesPattern, "", "alice")
	if w.Code != http.StatusOK || strings.TrimSpace(w.Body.String()) != `{"features":{"homeGuide":true,"postGameFeedback":true,"spectator":false}}` {
		t.Fatalf("features %d %s", w.Code, w.Body)
	}
}

func TestDefaultLimitRunsBeforeAuthentication(t *testing.T) {
	f := newSystemFixture(t, nil, "")
	for i := 0; i < 120; i++ {
		f.do(t, http.MethodGet, FeaturesPattern, "", "")
	}
	w := f.do(t, http.MethodGet, FeaturesPattern, "", "")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("121st anonymous: %d", w.Code)
	}
	if w := f.do(t, http.MethodGet, StatusPattern, "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("status has its own bucket: %d", w.Code)
	}
	if w := f.do(t, http.MethodGet, FeaturesPattern, "", "alice"); w.Code != http.StatusOK {
		t.Fatalf("a user has its own bucket: %d", w.Code)
	}
}

func TestClientTelemetryValidatesLikePydantic(t *testing.T) {
	f := newSystemFixture(t, nil, "")
	for _, tc := range []struct {
		body, typ string
		loc       []any
	}{
		{`{}`, "missing", []any{"body", "eventType"}},
		{`{"eventType":1}`, "string_type", []any{"body", "eventType"}},
		{`{"event_type":"` + strings.Repeat("x", 33) + `"}`, "string_too_long", []any{"body", "event_type"}},
		{`{"eventType":"web_vital","metricName":"` + strings.Repeat("x", 17) + `"}`, "string_too_long", []any{"body", "metricName"}},
		{`{"eventType":"web_vital","value":"fast"}`, "float_parsing", []any{"body", "value"}},
		{`{"eventType":"frontend_error","error_name":` + `"` + strings.Repeat("e", 81) + `"}`, "string_too_long", []any{"body", "error_name"}},
	} {
		w := f.do(t, http.MethodPost, ClientTelemetryPattern, tc.body, "alice")
		if w.Code != http.StatusUnprocessableEntity {
			t.Errorf("%s: %d %s", tc.body, w.Code, w.Body)
			continue
		}
		detail := decode(t, w)["detail"].([]any)[0].(map[string]any)
		loc, _ := json.Marshal(detail["loc"])
		want, _ := json.Marshal(tc.loc)
		if detail["type"] != tc.typ || string(loc) != string(want) {
			t.Errorf("%s: %v", tc.body, detail)
		}
	}
	if w := f.do(t, http.MethodPost, ClientTelemetryPattern, `{"eventType":"web_vital"}`, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", w.Code)
	}
}

func TestClientTelemetryRecordsOnlySanitizedEvents(t *testing.T) {
	f := newSystemFixture(t, nil, "")
	for _, body := range []string{
		`{"eventType":"web_vital","metricName":"LCP","value":"1234.56789","context":"home","release":"v16.6dm46j"}`,
		`{"eventType":"frontend_error","metricName":"LCP","value":3,"errorName":"TypeError"}`,
		`{"eventType":"web_vital","metricName":"cls","value":0.1}`,
		`{"eventType":"web_vital","metricName":"INP","value":-1}`,
		`{"eventType":"web_vital","metricName":"INP"}`,
		`{"eventType":"click"}`,
	} {
		if w := f.do(t, http.MethodPost, ClientTelemetryPattern, body, "alice"); w.Code != http.StatusNoContent || w.Body.Len() != 0 {
			t.Fatalf("%s: %d %q", body, w.Code, w.Body)
		}
	}
	if len(f.history.frontend) != 2 {
		t.Fatalf("history %+v", f.history.frontend)
	}
	vital, failure := f.history.frontend[0], f.history.frontend[1]
	if vital.MetricName != "LCP" || *vital.Value != 1234.568 || vital.Context != "home" || vital.Release != "v16.6dm46j" {
		t.Fatalf("vital %+v", vital)
	}
	if failure.MetricName != "" || failure.Value != nil || failure.Context != "unknown" || failure.Release != "unknown" || failure.ErrorName != "TypeError" {
		t.Fatalf("error %+v", failure)
	}
	if strings.Join(f.metrics.events, ";") != "web_vital|LCP|1234.568|home|v16.6dm46j;frontend_error||nil|unknown|unknown" {
		t.Fatalf("metrics %v", f.metrics.events)
	}
	if f.metrics.lines[0] != `{"context":"home","event":"frontend_telemetry","event_type":"web_vital","metric_name":"LCP","release":"v16.6dm46j","username":"alice","value":1234.568}` {
		t.Fatalf("log line %s", f.metrics.lines[0])
	}
	if f.metrics.lines[1] != `{"context":"unknown","error_name":"TypeError","event":"frontend_telemetry","event_type":"frontend_error","release":"unknown","username":"alice"}` {
		t.Fatalf("log line %s", f.metrics.lines[1])
	}
}

func TestClientTelemetryHasItsOwnLimitAfterValidation(t *testing.T) {
	f := newSystemFixture(t, nil, "")
	for i := 0; i < 120; i++ {
		if w := f.do(t, http.MethodPost, ClientTelemetryPattern, `{"eventType":"click"}`, "alice"); w.Code != http.StatusNoContent {
			t.Fatalf("%d: %d", i, w.Code)
		}
	}
	if w := f.do(t, http.MethodPost, ClientTelemetryPattern, `{}`, "alice"); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid body before the limit: %d", w.Code)
	}
	if w := f.do(t, http.MethodPost, ClientTelemetryPattern, `{"eventType":"click"}`, "alice"); w.Code != http.StatusTooManyRequests {
		t.Fatalf("121st: %d", w.Code)
	}
	if w := f.do(t, http.MethodGet, StatusPattern, "", "alice"); w.Code != http.StatusOK {
		t.Fatalf("status shares no bucket: %d", w.Code)
	}
}

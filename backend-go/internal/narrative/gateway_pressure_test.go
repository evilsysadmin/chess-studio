package narrative

import (
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

func TestPressureMirrorsPressureState(t *testing.T) {
	now := time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)
	env := map[string]string{"CHESS_DEGRADED_INFLIGHT": "2", "CHESS_CRITICAL_INFLIGHT": " 3 ", "CHESS_OPTIONAL_INFLIGHT_LIMIT": "x"}
	g := New(Config{Env: func(k string) string { return env[k] }, Now: func() time.Time { return now }})
	encode := func() string {
		b, err := pydoc.Encode(g.Pressure())
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}
	if got := encode(); got != `{"level":"normal","reasons":[],"inflight":0,"optional_inflight_limit":16,"degraded_inflight_threshold":2,"critical_inflight_threshold":3,"shed_last_5m":0,"bulkhead_rejections_last_5m":0}` {
		t.Fatal(got)
	}
	g.RecordShed()
	now = now.Add(301 * time.Second)
	g.RecordShed()
	g.recordRejection()
	g.Enter()
	g.Enter()
	if got := encode(); got != `{"level":"degraded","reasons":["inflight_high"],"inflight":2,"optional_inflight_limit":16,"degraded_inflight_threshold":2,"critical_inflight_threshold":3,"shed_last_5m":1,"bulkhead_rejections_last_5m":1}` {
		t.Fatal(got)
	}
	g.Enter()
	if got := encode(); got[:52] != `{"level":"critical","reasons":["inflight_critical"],` {
		t.Fatal(got)
	}
	for i := 0; i < 600; i++ {
		g.RecordShed()
	}
	if len(g.sheds) != 500 {
		t.Fatalf("sheds kept %d", len(g.sheds))
	}
}

func TestDependencyHealthMirrorsPython(t *testing.T) {
	env := map[string]string{}
	g := New(Config{Env: func(k string) string { return env[k] }})
	encode := func() string {
		b, err := pydoc.Encode(g.DependencyHealth())
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}
	// Byte for byte what get_ai_dependency_health answers with an idle breaker.
	channelsOK := `"channels":{"comments":{"open":false,"secondsRemaining":0.0,"failures":0},"player_portrait":{"open":false,"secondsRemaining":0.0,"failures":0},"analysis":{"open":false,"secondsRemaining":0.0,"failures":0}}}`
	if got := encode(); got != `{"status":"unconfigured","enabled":true,"configured":false,"circuitOpen":false,`+channelsOK {
		t.Fatal(got)
	}
	env["AI_NARRATIVE_ENABLED"] = "off"
	if got := encode(); got[:40] != `{"status":"disabled","enabled":false,"co` {
		t.Fatal(got)
	}
	env["AI_NARRATIVE_ENABLED"], env["CF_AI_WORKER_URL"], env["CHESS_AI_SHARED_SECRET"] = "", "https://w", "s"
	if got := encode(); got != `{"status":"ok","enabled":true,"configured":true,"circuitOpen":false,`+channelsOK {
		t.Fatal(got)
	}
	for i := 0; i < 5; i++ {
		g.failure("analysis")
	}
	if got := encode(); got != `{"status":"degraded","enabled":true,"configured":true,"circuitOpen":true,"channels":{"comments":{"open":false,"secondsRemaining":0.0,"failures":0},"player_portrait":{"open":false,"secondsRemaining":0.0,"failures":0},"analysis":{"open":true,"secondsRemaining":90.0,"failures":5}}}` {
		t.Fatal(got)
	}
}

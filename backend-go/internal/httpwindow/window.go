// Package httpwindow is observability.py's in-memory HTTP window: the last
// 5000 requests (method, route pattern, status, latency, client release; no
// identity, path or query) summarized for Admin's observability panel over
// the last 15 minutes and the last hour, plus the process' first observed
// readiness. It resets with the process, like Python's.
//
// The edge records every request it answers: natively served ones under
// their route pattern and proxied ones under ProxiedRoute, so the panel
// sees the whole API while Python still serves part of it.
package httpwindow

import (
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	// Capacity mirrors MAX_HTTP_EVENTS.
	Capacity = 5000
	// WindowSeconds mirrors HTTP_WINDOW_SECONDS.
	WindowSeconds = 60 * 60
	// ProxiedRoute labels the requests the edge hands to Python.
	ProxiedRoute = "proxy:python"
)

var clientReleaseRE = regexp.MustCompile(`^v?[0-9A-Za-z][0-9A-Za-z._-]{0,39}$`)

// SanitizeClientRelease is sanitize_client_release ("" for None).
func SanitizeClientRelease(value string) string {
	raw := pyval.Prefix(pyval.Strip(value), 40)
	if raw != "" && clientReleaseRE.MatchString(raw) {
		return raw
	}
	return ""
}

type event struct {
	at      float64
	method  string
	route   string
	status  int64
	latency float64
	release string
}

// Window is safe for concurrent use. A nil *Window records nothing.
type Window struct {
	// now is time.time(); monotonic is time.perf_counter().
	now       func() float64
	monotonic func() float64
	started   float64
	startedMo float64

	mu     sync.Mutex
	events []event // ring of at most Capacity
	head   int     // oldest event once the ring is full
	ready  *float64
}

func wallClock() float64 { return float64(time.Now().UnixNano()) / 1e9 }

var processStart = time.Now()

func monotonicClock() float64 { return time.Since(processStart).Seconds() }

// New starts a window at process start.
func New() *Window { return newWindow(wallClock, monotonicClock) }

func newWindow(now, monotonic func() float64) *Window {
	return &Window{now: now, monotonic: monotonic, started: now(), startedMo: monotonic()}
}

// pyRound is Python's round(x, digits) for floats.
func pyRound(x float64, digits int) float64 {
	v, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'f', digits, 64), 64)
	return v
}

// Record mirrors record_http_request's window append.
func (w *Window) Record(method, route string, status int, latencyMS float64, release string) {
	if w == nil {
		return
	}
	if route == "" {
		route = "unknown"
	}
	if method == "" {
		method = "?"
	}
	if math.IsNaN(latencyMS) {
		latencyMS = 0
	}
	e := event{
		method:  pyval.Prefix(strings.ToUpper(method), 8),
		route:   pyval.Prefix(route, 120),
		status:  int64(status),
		latency: math.Max(0, pyRound(latencyMS, 2)),
		release: SanitizeClientRelease(release),
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	e.at = w.now()
	if len(w.events) < Capacity {
		w.events = append(w.events, e)
		return
	}
	w.events[w.head] = e
	w.head = (w.head + 1) % Capacity
}

// RecordReady mirrors record_process_ready: the first observed readiness
// in ms since process start (later probes never rewrite it); first reports
// whether this call recorded it.
func (w *Window) RecordReady() (ms float64, first bool) {
	if w == nil {
		return 0, false
	}
	observed := math.Max(0, (w.monotonic()-w.startedMo)*1000)
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.ready == nil {
		w.ready, first = &observed, true
	}
	return pyRound(*w.ready, 2), first
}

func (w *Window) startup() bson.D {
	var ms any
	if w.ready != nil {
		ms = pyRound(*w.ready, 2)
	}
	return bson.D{
		{Key: "first_ready_observed", Value: w.ready != nil},
		{Key: "first_ready_observed_ms", Value: ms},
		{Key: "scope", Value: "current_process"},
	}
}

func (w *Window) since(seconds int64, now float64) []event {
	cutoff := now - float64(max(1, seconds))
	var out []event
	for i := range w.events {
		if e := w.events[(w.head+i)%len(w.events)]; e.at >= cutoff {
			out = append(out, e)
		}
	}
	return out
}

func percentile(values []float64, p float64) any {
	if len(values) == 0 {
		return nil
	}
	ordered := append([]float64(nil), values...)
	sort.Float64s(ordered)
	index := max(0, int(math.Ceil(p*float64(len(ordered))))-1)
	return pyRound(ordered[index], 2)
}

type group struct {
	key  string
	rows []event
}

// groupBy keeps first-seen order and sorts by size, largest first (stable).
func groupBy(events []event, key func(event) string) []group {
	index := map[string]int{}
	var groups []group
	for _, e := range events {
		k := key(e)
		if k == "" {
			continue
		}
		i, ok := index[k]
		if !ok {
			i = len(groups)
			index[k] = i
			groups = append(groups, group{key: k})
		}
		groups[i].rows = append(groups[i].rows, e)
	}
	sort.SliceStable(groups, func(i, j int) bool { return len(groups[i].rows) > len(groups[j].rows) })
	if len(groups) > 8 {
		groups = groups[:8]
	}
	return groups
}

func latencies(rows []event) []float64 {
	out := make([]float64, len(rows))
	for i, e := range rows {
		out[i] = e.latency
	}
	return out
}

func errors5xx(rows []event) int64 {
	var n int64
	for _, e := range rows {
		if e.status >= 500 {
			n++
		}
	}
	return n
}

// summarize is _summarize_http.
func (w *Window) summarize(events []event, window int64, now float64) bson.D {
	statuses := map[int64]int64{}
	for _, e := range events {
		if e.status > 0 {
			statuses[e.status/100]++
		}
	}
	topRoutes := bson.A{}
	for _, g := range groupBy(events, func(e event) string { return e.method + " " + e.route }) {
		topRoutes = append(topRoutes, bson.D{
			{Key: "route", Value: g.key},
			{Key: "requests", Value: int64(len(g.rows))},
			{Key: "p95_ms", Value: percentile(latencies(g.rows), 0.95)},
			{Key: "errors_5xx", Value: errors5xx(g.rows)},
		})
	}
	releases := bson.A{}
	for _, g := range groupBy(events, func(e event) string { return e.release }) {
		errs := errors5xx(g.rows)
		releases = append(releases, bson.D{
			{Key: "release", Value: g.key},
			{Key: "requests", Value: int64(len(g.rows))},
			{Key: "errors_5xx", Value: errs},
			{Key: "error_5xx_percent", Value: pyRound(float64(errs*100)/float64(len(g.rows)), 2)},
			{Key: "p95_ms", Value: percentile(latencies(g.rows), 0.95)},
		})
	}
	total := int64(len(events))
	effective := math.Max(1.0, math.Min(float64(window), now-w.started))
	errorPct := 0.0
	if total > 0 {
		errorPct = pyRound(float64(statuses[5]*100)/float64(total), 2)
	}
	all := latencies(events)
	return bson.D{
		{Key: "window_seconds", Value: window},
		{Key: "coverage_seconds", Value: pyRound(effective, 1)},
		{Key: "samples", Value: total},
		{Key: "requests_per_minute", Value: pyRound(float64(total)/math.Max(1.0/60, effective/60), 2)},
		{Key: "status_2xx", Value: statuses[2]},
		{Key: "status_4xx", Value: statuses[4]},
		{Key: "status_5xx", Value: statuses[5]},
		{Key: "error_5xx_percent", Value: errorPct},
		{Key: "p50_ms", Value: percentile(all, 0.50)},
		{Key: "p95_ms", Value: percentile(all, 0.95)},
		{Key: "p99_ms", Value: percentile(all, 0.99)},
		{Key: "top_routes", Value: topRoutes},
		{Key: "releases", Value: releases},
	}
}

// Metrics mirrors get_http_metrics.
func (w *Window) Metrics() bson.D {
	if w == nil {
		w = &Window{now: wallClock, monotonic: monotonicClock}
		w.started = w.now()
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	now := w.now()
	return bson.D{
		{Key: "uptime_seconds", Value: max(0, int64(now-w.started))},
		{Key: "startup", Value: w.startup()},
		{Key: "last_15m", Value: w.summarize(w.since(15*60, now), 15*60, now)},
		{Key: "last_1h", Value: w.summarize(w.since(WindowSeconds, now), WindowSeconds, now)},
		{Key: "capacity", Value: int64(Capacity)},
		{Key: "scope", Value: "in_memory_since_process_start"},
	}
}

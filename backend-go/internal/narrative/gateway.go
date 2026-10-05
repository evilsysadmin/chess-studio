package narrative

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/obshistory"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const maxTelemetryEvents = 500

var channels = []string{"comments", "player_portrait", "analysis"}

// Config wires the gateway. Env is read on every call, as Python does.
type Config struct {
	Env     func(string) string
	Client  *http.Client
	History *obshistory.Recorder
	Log     func(line string)
	Now     func() time.Time
}

// Gateway mirrors narrative_cloudflare's process state: circuit breakers,
// bulkheads, the in-flight pressure signal and the telemetry window.
type Gateway struct {
	env     func(string) string
	client  *http.Client
	history *obshistory.Recorder
	log     func(string)
	now     func() time.Time

	mu        sync.Mutex
	circuit   map[string]*circuitState
	telemetry []Event

	bulkMu    sync.Mutex
	bulkheads map[string]chan struct{}

	inflight atomic.Int64

	// sheds and rejections are resilience.py's _SHED_EVENTS and
	// _BULKHEAD_REJECTIONS (the last 500 of each).
	pressureMu sync.Mutex
	sheds      []time.Time
	rejections []time.Time
}

const pressureEvents = 500

func appendBounded(rows []time.Time, at time.Time) []time.Time {
	rows = append(rows, at)
	if len(rows) > pressureEvents {
		rows = rows[len(rows)-pressureEvents:]
	}
	return rows
}

// RecordShed is record_shed: an optional request answered 503.
func (g *Gateway) RecordShed() {
	g.pressureMu.Lock()
	defer g.pressureMu.Unlock()
	g.sheds = appendBounded(g.sheds, g.now())
}

func (g *Gateway) recordRejection() {
	g.pressureMu.Lock()
	defer g.pressureMu.Unlock()
	g.rejections = appendBounded(g.rejections, g.now())
}

func recentCount(rows []time.Time, cutoff time.Time) int64 {
	var n int64
	for _, at := range rows {
		if !at.Before(cutoff) {
			n++
		}
	}
	return n
}

// Pressure is pressure_state over Go's own signal: the narrative requests in
// flight (see Enter). Python also escalates on its process' HTTP p95 and 5xx
// rate; Go's shedding does not, so neither does what it reports.
func (g *Gateway) Pressure() bson.D {
	inflight := g.inflight.Load()
	critical := g.envInt(g.envStr("CHESS_CRITICAL_INFLIGHT"), 32, 2, 1024)
	degraded := g.envInt(g.envStr("CHESS_DEGRADED_INFLIGHT"), 12, 1, 512)
	level, reasons := "normal", bson.A{}
	switch {
	case inflight >= critical:
		level, reasons = "critical", bson.A{"inflight_critical"}
	case inflight >= degraded:
		level, reasons = "degraded", bson.A{"inflight_high"}
	}
	cutoff := g.now().Add(-300 * time.Second)
	g.pressureMu.Lock()
	sheds, rejections := recentCount(g.sheds, cutoff), recentCount(g.rejections, cutoff)
	g.pressureMu.Unlock()
	return bson.D{
		{Key: "level", Value: level},
		{Key: "reasons", Value: reasons},
		{Key: "inflight", Value: inflight},
		{Key: "optional_inflight_limit", Value: g.envInt(g.envStr("CHESS_OPTIONAL_INFLIGHT_LIMIT"), 16, 2, 512)},
		{Key: "degraded_inflight_threshold", Value: degraded},
		{Key: "critical_inflight_threshold", Value: critical},
		{Key: "shed_last_5m", Value: sheds},
		{Key: "bulkhead_rejections_last_5m", Value: rejections},
	}
}

// DependencyHealth is get_ai_dependency_health.
func (g *Gateway) DependencyHealth() bson.D {
	enabled := g.Enabled()
	configured := g.envStr("CF_AI_WORKER_URL") != "" && g.envStr("CHESS_AI_SHARED_SECRET") != ""
	circuit := g.CircuitSnapshot()
	open, _ := circuitField(circuit, "open").(bool)
	status := "ok"
	switch {
	case !enabled:
		status = "disabled"
	case !configured:
		status = "unconfigured"
	case open:
		status = "degraded"
	}
	channels := bson.D{}
	rows, _ := circuitField(circuit, "channels").(bson.D)
	for _, row := range rows {
		d := row.Value.(bson.D)
		channels = append(channels, bson.E{Key: row.Key, Value: bson.D{
			{Key: "open", Value: circuitField(d, "open")},
			{Key: "secondsRemaining", Value: circuitField(d, "seconds_remaining")},
			{Key: "failures", Value: circuitField(d, "consecutive_failures")},
		}})
	}
	return bson.D{
		{Key: "status", Value: status},
		{Key: "enabled", Value: enabled},
		{Key: "configured", Value: configured},
		{Key: "circuitOpen", Value: open},
		{Key: "channels", Value: channels},
	}
}

func circuitField(doc bson.D, key string) any {
	for _, e := range doc {
		if e.Key == key {
			return e.Value
		}
	}
	return nil
}

type circuitState struct {
	failures    int
	openedUntil time.Time
	openCount   int
	halfOpen    bool
}

// Event is one text-free telemetry record (_record).
type Event struct {
	At           int64
	Provider     string
	EventType    string
	RequestKind  string
	Channel      string
	LatencyMS    float64
	Reason       string
	Chars        int
	InputTokens  int64
	OutputTokens int64
	Model        string
	WorkerError  string
}

func New(cfg Config) *Gateway {
	g := &Gateway{env: cfg.Env, client: cfg.Client, history: cfg.History, log: cfg.Log, now: cfg.Now, circuit: map[string]*circuitState{}, bulkheads: map[string]chan struct{}{}}
	if g.env == nil {
		g.env = os.Getenv
	}
	if g.client == nil {
		g.client = &http.Client{}
	}
	if g.now == nil {
		g.now = time.Now
	}
	if g.log == nil {
		g.log = func(string) {}
	}
	for _, ch := range channels {
		g.circuit[ch] = &circuitState{}
	}
	return g
}

func (g *Gateway) envStr(name string) string { return strings.TrimSpace(g.env(name)) }

// Enabled is ai_narrative_enabled.
func (g *Gateway) Enabled() bool {
	raw := strings.ToLower(g.envStr("AI_NARRATIVE_ENABLED"))
	if raw == "" {
		return true
	}
	switch raw {
	case "0", "false", "no", "off", "disabled":
		return false
	}
	return true
}

func (g *Gateway) envInt(raw string, fallback, lo, hi int64) int64 {
	if raw == "" {
		return fallback
	}
	n, err := pyval.Int(raw)
	if err != nil {
		return fallback
	}
	return max(lo, min(n, hi))
}

func (g *Gateway) envFloat(raw string, fallback, lo, hi float64) float64 {
	if raw == "" {
		return fallback
	}
	n, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsNaN(n) {
		return fallback
	}
	return math.Max(lo, math.Min(n, hi))
}

func (g *Gateway) failureThreshold(channel string) int {
	if channel == "comments" {
		value := g.envStr("AI_NARRATIVE_COMMENT_CIRCUIT_FAILURES")
		if value == "" {
			value = g.envStr("AI_NARRATIVE_CIRCUIT_FAILURES")
		}
		return int(g.envInt(value, 3, 1, 20))
	}
	return int(g.envInt(g.envStr("AI_NARRATIVE_CIRCUIT_FAILURES"), 5, 1, 20))
}

func (g *Gateway) resetSeconds(channel string) float64 {
	if channel == "comments" {
		value := g.envStr("AI_NARRATIVE_COMMENT_CIRCUIT_RESET_SECONDS")
		if value == "" {
			value = g.envStr("AI_NARRATIVE_CIRCUIT_RESET_SECONDS")
		}
		return g.envFloat(value, 60, 5, 600)
	}
	return g.envFloat(g.envStr("AI_NARRATIVE_CIRCUIT_RESET_SECONDS"), 90, 5, 600)
}

func (g *Gateway) timeout(channel string) time.Duration {
	seconds := 5.0
	if channel == "comments" {
		seconds = g.envFloat(g.envStr("CF_AI_COMMENT_TIMEOUT_SECONDS"), 2, 0.5, 5)
	} else {
		seconds = g.envFloat(g.envStr("CF_AI_TIMEOUT_SECONDS"), 5, 1, 20)
	}
	return time.Duration(seconds * float64(time.Second))
}

// Enter and Exit count the native narrative requests in flight: Go's own
// pressure signal (Python counts every request of its process).
func (g *Gateway) Enter() int64 { return g.inflight.Add(1) }
func (g *Gateway) Exit()        { g.inflight.Add(-1) }

func (g *Gateway) pressure() string {
	inflight := g.inflight.Load()
	switch {
	case inflight >= g.envInt(g.envStr("CHESS_CRITICAL_INFLIGHT"), 32, 2, 1024):
		return "critical"
	case inflight >= g.envInt(g.envStr("CHESS_DEGRADED_INFLIGHT"), 12, 1, 512):
		return "degraded"
	}
	return "normal"
}

// ShouldShed mirrors should_shed for an optional path.
func (g *Gateway) ShouldShed(inflight int64) bool {
	return inflight > g.envInt(g.envStr("CHESS_OPTIONAL_INFLIGHT_LIMIT"), 16, 2, 512) || g.pressure() == "critical"
}

func (g *Gateway) adaptiveMode(channel string) string {
	switch level := g.pressure(); {
	case level == "critical":
		return "shed"
	case level == "degraded" && (channel == "analysis" || channel == "player_portrait"):
		return "local_only"
	}
	return "normal"
}

func (g *Gateway) bulkhead(channel string) chan struct{} {
	g.bulkMu.Lock()
	defer g.bulkMu.Unlock()
	if b, ok := g.bulkheads[channel]; ok {
		return b
	}
	defaults := map[string]int64{"comments": 4, "analysis": 2, "player_portrait": 1}
	fallback, ok := defaults[channel]
	if !ok {
		fallback = 2
	}
	b := make(chan struct{}, g.envInt(g.envStr("CHESS_AI_BULKHEAD_"+strings.ToUpper(channel)), fallback, 1, 32))
	g.bulkheads[channel] = b
	return b
}

func (g *Gateway) beforeRequest(channel string) (bool, string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	s := g.circuit[channel]
	now := g.now()
	switch {
	case s.openedUntil.After(now):
		return false, "circuit_open"
	case s.halfOpen:
		return false, "circuit_half_open"
	case !s.openedUntil.IsZero():
		// Exactly one recovery probe after the reset window.
		s.openedUntil = time.Time{}
		s.halfOpen = true
	}
	return true, ""
}

func (g *Gateway) success(channel string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	s := g.circuit[channel]
	s.failures, s.openedUntil, s.halfOpen = 0, time.Time{}, false
}

func (g *Gateway) failure(channel string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	s := g.circuit[channel]
	reset := time.Duration(g.resetSeconds(channel) * float64(time.Second))
	if s.halfOpen {
		s.failures = g.failureThreshold(channel)
		s.openedUntil = g.now().Add(reset)
		s.openCount++
		s.halfOpen = false
		return
	}
	s.failures++
	if s.failures >= g.failureThreshold(channel) {
		s.openedUntil = g.now().Add(reset)
		s.openCount++
	}
}

// Outcome is ProviderOutcome.
type Outcome struct {
	Text         string
	Reason       string
	LatencyMS    float64
	InputTokens  int64
	OutputTokens int64
	Model        string
	WorkerError  string
}

func (g *Gateway) providerFailure(channel, reason string, latency float64, workerError string) Outcome {
	g.failure(channel)
	return Outcome{Reason: reason, LatencyMS: latency, WorkerError: workerError}
}

// Request mirrors request_cloud_narrative.
func (g *Gateway) Request(ctx context.Context, eventType string, facts bson.D, tone, locale, requestID *string) Outcome {
	channel := Channel(eventType)
	if !g.Enabled() {
		return Outcome{Reason: "disabled"}
	}
	if mode := g.adaptiveMode(channel); mode != "normal" {
		// Load pressure is not a provider failure: the circuit is untouched.
		return Outcome{Reason: "adaptive_" + mode}
	}
	if ok, reason := g.beforeRequest(channel); !ok {
		return Outcome{Reason: reason}
	}
	worker := strings.TrimRight(g.envStr("CF_AI_WORKER_URL"), "/")
	secret := g.envStr("CHESS_AI_SHARED_SECRET")
	if worker == "" || secret == "" {
		return Outcome{Reason: "not_configured"}
	}
	body, err := CanonicalJSON(BuildPayload(eventType, facts, tone, locale, requestID))
	if err != nil {
		return g.providerFailure(channel, "transport_error", 0, "ValueError")
	}
	timestamp := strconv.FormatInt(g.now().Unix(), 10)

	bulk := g.bulkhead(channel)
	select {
	case bulk <- struct{}{}:
	case <-time.After(50 * time.Millisecond):
		// Saturation of one AI class must not eat the others' capacity.
		g.recordRejection()
		return Outcome{Reason: "bulkhead_full"}
	}
	defer func() { <-bulk }()

	timeout := g.timeout(channel)
	rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(rctx, http.MethodPost, worker+"/narrative", bytes.NewReader(body))
	if err != nil {
		return g.providerFailure(channel, "transport_error", 0, "ValueError")
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("accept", "application/json")
	req.Header.Set("x-chess-ai-timestamp", timestamp)
	req.Header.Set("x-chess-ai-signature", Sign(secret, timestamp, body))

	started := time.Now()
	elapsed := func() float64 { return float64(time.Since(started).Microseconds()) / 1000 }
	resp, err := g.client.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || isTimeout(err) {
			return g.providerFailure(channel, "timeout", elapsed(), "")
		}
		return g.providerFailure(channel, "transport_error", elapsed(), transportErrorName(err))
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || isTimeout(err) {
			return g.providerFailure(channel, "timeout", elapsed(), "")
		}
		return g.providerFailure(channel, "transport_error", elapsed(), "ReadError")
	}
	latency := elapsed()
	if resp.StatusCode != http.StatusOK {
		return g.providerFailure(channel, fmt.Sprintf("http_%d", resp.StatusCode), latency, workerError(raw))
	}
	decoded, err := pydoc.Decode(raw)
	if err != nil {
		return g.providerFailure(channel, "transport_error", latency, "JSONDecodeError")
	}
	data, _ := decoded.(bson.D)
	text, isText := mustGet(data, "text").(string)
	if !isText {
		return g.providerFailure(channel, "invalid_payload", latency, "")
	}
	usage, _ := mustGet(data, "usage").(bson.D)
	input, err := pyval.IntOr(pyval.Or(mustGet(usage, "inputTokens"), mustGet(usage, "prompt_tokens")))
	if err != nil {
		return g.providerFailure(channel, "transport_error", latency, errorName(err))
	}
	output, err := pyval.IntOr(pyval.Or(mustGet(usage, "outputTokens"), mustGet(usage, "completion_tokens")))
	if err != nil {
		return g.providerFailure(channel, "transport_error", latency, errorName(err))
	}
	model := pyval.Prefix(pyval.Str(pyval.Or(mustGet(data, "model"), "")), 96)
	text = TrimComplete(text, MaxOutputChars(eventType))
	if text == "" {
		return g.providerFailure(channel, "empty_response", latency, "")
	}
	switch eventType {
	case "player_portrait":
		if ok, why := Portrait(text, facts); !ok {
			return g.providerFailure(channel, "portrait_contract_rejected:"+orUnknown(why), latency, "")
		}
	case "matthias_daily":
		if ok, why := Daily(text, facts); !ok {
			return g.providerFailure(channel, "matthias_daily_contract_rejected:"+orUnknown(why), latency, "")
		}
	case "game_opening_banter":
		if ok, why := OpeningBanter(text, facts); !ok {
			return g.providerFailure(channel, "opening_banter_contract_rejected:"+orUnknown(why), latency, "")
		}
	}
	if ok, concept := Grounded(text, eventType, facts); !ok {
		return g.providerFailure(channel, "ungrounded_"+concept, latency, "")
	}
	if ok, marker := Register(text, eventType); !ok {
		return g.providerFailure(channel, "register_tuteo:"+marker, latency, "")
	}
	g.success(channel)
	return Outcome{Text: text, Reason: "ok", LatencyMS: latency, InputTokens: max(0, input), OutputTokens: max(0, output), Model: model}
}

func orUnknown(reason string) string {
	if reason == "" {
		return "unknown"
	}
	return reason
}

func errorName(err error) string {
	if errors.Is(err, pyval.ErrType) {
		return "TypeError"
	}
	return "ValueError"
}

func isTimeout(err error) bool {
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

// transportErrorName approximates httpx's exception class names.
func transportErrorName(err error) string {
	var opErr *net.OpError
	if errors.As(err, &opErr) && opErr.Op == "dial" {
		return "ConnectError"
	}
	return "TransportError"
}

// workerError mirrors the Worker error summary: error[:48]:name[:32]:code[:32].
func workerError(raw []byte) string {
	decoded, err := pydoc.Decode(raw)
	if err != nil {
		return ""
	}
	payload, ok := decoded.(bson.D)
	if !ok || !pyval.Truthy(mustGet(payload, "error")) {
		return ""
	}
	parts := []string{pyval.Prefix(pyval.Str(mustGet(payload, "error")), 48)}
	if name := pyval.Prefix(pyval.Str(pyval.Or(mustGet(payload, "error_name"), "")), 32); name != "" {
		parts = append(parts, name)
	}
	if code := pyval.Prefix(pyval.Str(pyval.Or(mustGet(payload, "error_code"), "")), 32); code != "" {
		parts = append(parts, code)
	}
	return pyval.Prefix(strings.Join(parts, ":"), 80)
}

// Result is generate_narrative's answer.
type Result struct {
	Text      string
	Provider  string
	LatencyMS float64
	Model     string
}

// Doc is the JSON body the routes answer.
func (r Result) Doc() bson.D {
	doc := bson.D{{Key: "text", Value: r.Text}, {Key: "provider", Value: r.Provider}, {Key: "latencyMs", Value: pyRound(r.LatencyMS, 1)}}
	if r.Provider == "cloudflare" {
		var model any
		if r.Model != "" {
			model = r.Model
		}
		doc = append(doc, bson.E{Key: "model", Value: model})
	}
	return doc
}

// Generate mirrors generate_narrative: the model's line when it passes
// every contract, the local fallback otherwise; both are recorded.
func (g *Gateway) Generate(ctx context.Context, eventType string, facts bson.D, tone, locale *string, requestKind string, requestID *string) Result {
	outcome := g.Request(ctx, eventType, facts, tone, locale, requestID)
	rid := "-"
	if requestID != nil && *requestID != "" {
		rid = *requestID
	}
	event := pyval.Prefix(orDefault(&eventType, "generic"), 48)
	kind := pyval.Prefix(orDefault(&requestKind, "default"), 32)
	channel := Channel(eventType)
	if outcome.Text != "" {
		g.record("cloudflare", eventType, requestKind, outcome, outcome.Text)
		model := outcome.Model
		if model == "" {
			model = "-"
		}
		g.log(fmt.Sprintf("INFO:     workers_ai_ok request_id=%s event_type=%s request_kind=%s channel=%s model=%s latency_ms=%.1f input_tokens=%d output_tokens=%d",
			rid, event, kind, channel, model, outcome.LatencyMS, outcome.InputTokens, outcome.OutputTokens))
		return Result{Text: outcome.Text, Provider: "cloudflare", LatencyMS: outcome.LatencyMS, Model: outcome.Model}
	}
	text := Fallback(eventType, facts)
	g.record("local", eventType, requestKind, outcome, text)
	snapshot := g.CircuitSnapshot()
	workerErr := outcome.WorkerError
	if workerErr == "" {
		workerErr = "-"
	}
	failures := int64(0)
	if chans, ok := mustGet(snapshot, "channels").(bson.D); ok {
		if row, ok := mustGet(chans, channel).(bson.D); ok {
			failures, _ = mustGet(row, "consecutive_failures").(int64)
		}
	}
	open, _ := mustGet(snapshot, "open").(bool)
	g.log(fmt.Sprintf("WARNING:  workers_ai_fallback request_id=%s event_type=%s request_kind=%s channel=%s reason=%s worker_error=%s latency_ms=%.1f circuit_open=%s failures=%d",
		rid, event, kind, channel, outcome.Reason, workerErr, outcome.LatencyMS, pyBool(open), failures))
	return Result{Text: text, Provider: "local", LatencyMS: outcome.LatencyMS}
}

func pyBool(v bool) string {
	if v {
		return "True"
	}
	return "False"
}

func (g *Gateway) record(provider, eventType, requestKind string, outcome Outcome, text string) {
	event := Event{
		At:           g.now().Unix(),
		Provider:     provider,
		EventType:    pyval.Prefix(orDefault(&eventType, "generic"), 48),
		RequestKind:  pyval.Prefix(orDefault(&requestKind, "default"), 32),
		Channel:      Channel(eventType),
		LatencyMS:    math.Max(0, pyRound(outcome.LatencyMS, 2)),
		Reason:       pyval.Prefix(orDefault(&outcome.Reason, "unknown"), 64),
		Chars:        len([]rune(text)),
		InputTokens:  max(0, outcome.InputTokens),
		OutputTokens: max(0, outcome.OutputTokens),
		Model:        pyval.Prefix(outcome.Model, 96),
		WorkerError:  pyval.Prefix(outcome.WorkerError, 80),
	}
	g.mu.Lock()
	g.telemetry = append(g.telemetry, event)
	if len(g.telemetry) > maxTelemetryEvents {
		g.telemetry = g.telemetry[len(g.telemetry)-maxTelemetryEvents:]
	}
	g.mu.Unlock()
	g.history.RecordAI(obshistory.AIEvent{
		Provider: event.Provider, EventType: event.EventType, RequestKind: event.RequestKind, Channel: event.Channel,
		LatencyMS: event.LatencyMS, Reason: event.Reason, InputTokens: event.InputTokens, OutputTokens: event.OutputTokens,
		Model: event.Model, WorkerError: event.WorkerError,
	})
}

func (g *Gateway) events() []Event {
	g.mu.Lock()
	defer g.mu.Unlock()
	return append([]Event(nil), g.telemetry...)
}

// CircuitSnapshot is _circuit_snapshot.
func (g *Gateway) CircuitSnapshot() bson.D {
	g.mu.Lock()
	defer g.mu.Unlock()
	now := g.now()
	rows := bson.D{}
	anyOpen, anyHalf := false, false
	maxRemaining, maxFailures, openSum := 0.0, int64(0), int64(0)
	for _, ch := range channels {
		s := g.circuit[ch]
		remaining := 0.0
		if s.openedUntil.After(now) {
			remaining = s.openedUntil.Sub(now).Seconds()
		}
		rounded := pyRound(remaining, 1)
		open := remaining > 0
		anyOpen = anyOpen || open
		anyHalf = anyHalf || s.halfOpen
		maxRemaining = math.Max(maxRemaining, rounded)
		maxFailures = max(maxFailures, int64(s.failures))
		openSum += int64(s.openCount)
		rows = append(rows, bson.E{Key: ch, Value: bson.D{
			{Key: "open", Value: open},
			{Key: "seconds_remaining", Value: rounded},
			{Key: "consecutive_failures", Value: int64(s.failures)},
			{Key: "open_count", Value: int64(s.openCount)},
			{Key: "half_open", Value: s.halfOpen},
			{Key: "failure_threshold", Value: int64(g.failureThreshold(ch))},
			{Key: "reset_seconds", Value: g.resetSeconds(ch)},
		}})
	}
	return bson.D{
		{Key: "open", Value: anyOpen},
		{Key: "seconds_remaining", Value: maxRemaining},
		{Key: "consecutive_failures", Value: maxFailures},
		{Key: "open_count", Value: openSum},
		{Key: "half_open", Value: anyHalf},
		{Key: "failure_threshold", Value: int64(g.failureThreshold("analysis"))},
		{Key: "reset_seconds", Value: g.resetSeconds("analysis")},
		{Key: "channels", Value: rows},
	}
}

func percentile(values []float64, p float64) any {
	if len(values) == 0 {
		return nil
	}
	ordered := append([]float64(nil), values...)
	sort.Float64s(ordered)
	idx := max(0, int(math.Ceil(p*float64(len(ordered))))-1)
	return pyRound(ordered[idx], 2)
}

func percent(part, total int) any {
	if total == 0 {
		return nil
	}
	return pyRound(float64(part)*100/float64(total), 1)
}

// mostCommon is dict(Counter(...).most_common(n)): count desc, first seen first.
func mostCommon(items []string, n int) bson.D {
	counts := map[string]int64{}
	var order []string
	for _, it := range items {
		if _, seen := counts[it]; !seen {
			order = append(order, it)
		}
		counts[it]++
	}
	sort.SliceStable(order, func(i, j int) bool { return counts[order[i]] > counts[order[j]] })
	out := bson.D{}
	for i, key := range order {
		if n >= 0 && i == n {
			break
		}
		out = append(out, bson.E{Key: key, Value: counts[key]})
	}
	return out
}

// Metrics mirrors get_ai_metrics (GET /api/admin/ai-metrics).
func (g *Gateway) Metrics() bson.D {
	events := g.events()
	var providers, reasons, eventTypes, kinds, workerErrors, models []string
	var cloudLatencies []float64
	cloud, local := 0, 0
	var inputTokens, outputTokens int64
	for _, e := range events {
		providers = append(providers, e.Provider)
		reasons = append(reasons, e.Reason)
		eventTypes = append(eventTypes, e.EventType)
		kinds = append(kinds, orDefault(&e.RequestKind, "default"))
		if e.WorkerError != "" {
			workerErrors = append(workerErrors, e.WorkerError)
		}
		if e.Model != "" {
			models = append(models, e.Model)
		}
		switch e.Provider {
		case "cloudflare":
			cloud++
			cloudLatencies = append(cloudLatencies, e.LatencyMS)
			inputTokens += e.InputTokens
			outputTokens += e.OutputTokens
		case "local":
			local++
		}
	}
	total := len(events)
	channelRows := bson.D{}
	for _, ch := range channels {
		var lat []float64
		rowTotal, rowCloud, rowLocal := 0, 0, 0
		for _, e := range events {
			if orDefault(&e.Channel, Channel(e.EventType)) != ch {
				continue
			}
			rowTotal++
			switch e.Provider {
			case "cloudflare":
				rowCloud++
				lat = append(lat, e.LatencyMS)
			case "local":
				rowLocal++
			}
		}
		channelRows = append(channelRows, bson.E{Key: ch, Value: bson.D{
			{Key: "samples", Value: int64(rowTotal)},
			{Key: "cloudflare_percent", Value: percent(rowCloud, rowTotal)},
			{Key: "fallback_percent", Value: percent(rowLocal, rowTotal)},
			{Key: "p50_ms", Value: percentile(lat, 0.50)},
			{Key: "p95_ms", Value: percentile(lat, 0.95)},
			{Key: "p99_ms", Value: percentile(lat, 0.99)},
		}})
	}
	var lastAt any
	if total > 0 {
		lastAt = events[total-1].At
	}
	return bson.D{
		{Key: "window", Value: int64(maxTelemetryEvents)},
		{Key: "samples", Value: int64(total)},
		{Key: "cloudflare", Value: int64(cloud)},
		{Key: "local_fallback", Value: int64(local)},
		{Key: "cloudflare_percent", Value: percent(cloud, total)},
		{Key: "fallback_percent", Value: percent(local, total)},
		{Key: "cloudflare_p50_ms", Value: percentile(cloudLatencies, 0.50)},
		{Key: "cloudflare_p95_ms", Value: percentile(cloudLatencies, 0.95)},
		{Key: "cloudflare_p99_ms", Value: percentile(cloudLatencies, 0.99)},
		{Key: "reasons", Value: mostCommon(reasons, 8)},
		{Key: "event_types", Value: mostCommon(eventTypes, 12)},
		{Key: "request_kinds", Value: mostCommon(kinds, 8)},
		{Key: "worker_errors", Value: mostCommon(workerErrors, 8)},
		{Key: "usage", Value: bson.D{
			{Key: "input_tokens", Value: inputTokens},
			{Key: "output_tokens", Value: outputTokens},
			{Key: "total_tokens", Value: inputTokens + outputTokens},
			{Key: "estimated_neurons", Value: pyRound(float64(inputTokens*4625+outputTokens*30475)/1_000_000, 3)},
			{Key: "estimated_cost_usd", Value: pyRound((float64(inputTokens)*0.051+float64(outputTokens)*0.34)/1_000_000, 6)},
			{Key: "pricing_note", Value: "Estimación de la ventana reciente; Cloudflare billing es la fuente de verdad."},
		}},
		{Key: "models", Value: mostCommon(models, 4)},
		{Key: "channels", Value: channelRows},
		{Key: "last_event_at", Value: lastAt},
		{Key: "enabled", Value: g.Enabled()},
		{Key: "circuit", Value: g.CircuitSnapshot()},
	}
}

// EventMetrics mirrors get_ai_event_metrics (Admin's "today" for one event).
func (g *Gateway) EventMetrics(eventType string, since int64) bson.D {
	all := g.events()
	target := pyval.Prefix(orDefault(&eventType, "generic"), 48)
	var reasons []string
	var latencies []float64
	total, cloud, local := 0, 0, 0
	for _, e := range all {
		if e.EventType != target || e.At < since {
			continue
		}
		total++
		reasons = append(reasons, orDefault(&e.Reason, "unknown"))
		switch e.Provider {
		case "cloudflare":
			cloud++
			latencies = append(latencies, e.LatencyMS)
		case "local":
			local++
		}
	}
	reasonCounts := mostCommon(reasons, 6)
	timeouts := int64(0)
	for _, r := range reasons {
		if r == "timeout" {
			timeouts++
		}
	}
	return bson.D{
		{Key: "calls", Value: int64(total)},
		{Key: "cloudflare", Value: int64(cloud)},
		{Key: "localFallback", Value: int64(local)},
		{Key: "cloudflarePercent", Value: percent(cloud, total)},
		{Key: "fallbackPercent", Value: percent(local, total)},
		{Key: "timeouts", Value: timeouts},
		{Key: "errorsOrFallbacks", Value: int64(local)},
		{Key: "p50Ms", Value: percentile(latencies, 0.50)},
		{Key: "p95Ms", Value: percentile(latencies, 0.95)},
		{Key: "reasons", Value: reasonCounts},
		{Key: "boundedWindow", Value: len(all) >= maxTelemetryEvents},
	}
}

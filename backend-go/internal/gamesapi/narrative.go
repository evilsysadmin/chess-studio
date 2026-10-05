package gamesapi

// Native narrative routes, mirroring narrative_api.py and the audience in
// matthias_daily_api.py:
//
//	POST /api/narrative                Workers AI narrative (per-bucket limits, manual cooldowns)
//	POST /api/matthias/daily           the daily audience with Matthias
//	GET  /api/admin/ai-metrics         Admin's AI telemetry window
//	GET  /api/admin/matthias-status    Admin's Matthias memory aggregate
//
// They move together because the admin reads come from the gateway's
// in-process telemetry.

import (
	"container/list"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matthiasmem"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/narrative"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	NarrativePattern        = "/api/narrative"
	MatthiasAudiencePath    = "/api/matthias/daily"
	AdminAIMetricsPattern   = "/api/admin/ai-metrics"
	AdminMatthiasPattern    = "/api/admin/matthias-status"
	matthiasAudiencePattern = "POST " + MatthiasAudiencePath
)

// NarrativeRoute reports whether a request is a native narrative route; the
// pattern distinguishes the audience (POST) from the daily status (GET).
func NarrativeRoute(r *http.Request) (string, bool) {
	method := r.Method
	if method == http.MethodOptions {
		method = preflightMethod(r)
	}
	switch {
	case r.URL.Path == NarrativePattern && method == http.MethodPost:
		return NarrativePattern, true
	case r.URL.Path == MatthiasAudiencePath && method == http.MethodPost:
		return matthiasAudiencePattern, true
	case r.URL.Path == AdminAIMetricsPattern && method == http.MethodGet:
		return AdminAIMetricsPattern, true
	case r.URL.Path == AdminMatthiasPattern && method == http.MethodGet:
		return AdminMatthiasPattern, true
	}
	return "", false
}

// MatthiasMemory is matthiasmem.Store as the narrative routes use it.
type MatthiasMemory interface {
	Memory(ctx context.Context, username string) (bson.D, error)
	ObserveFacts(ctx context.Context, username string, facts bson.D, now time.Time) error
	ObserveEpisodes(ctx context.Context, username string, facts bson.D, now time.Time) (bson.D, error)
	Context(ctx context.Context, username string, facts bson.D, now time.Time) (bson.D, error)
	Replay(ctx context.Context, username string, consultationID any) (bson.D, error)
	RecordConsultation(ctx context.Context, username string, questionKind, adviceText any, facts bson.D, consultationID any, now time.Time) (bool, error)
	RecordEmblematicPosition(ctx context.Context, username string, facts bson.D, now time.Time) (bool, error)
	Reserve(ctx context.Context, username string, now time.Time) (matthiasmem.Claim, error)
	Release(ctx context.Context, username, reservation string, now time.Time)
	Commit(ctx context.Context, username, reservation, questionKind, answer string, now time.Time) (bson.D, error)
	AdminRows(ctx context.Context) ([]bson.D, error)
}

// NarrativeGateway is narrative.Gateway.
type NarrativeGateway interface {
	Generate(ctx context.Context, eventType string, facts bson.D, tone, locale *string, requestKind string, requestID *string) narrative.Result
	Metrics() bson.D
	EventMetrics(eventType string, since int64) bson.D
	Enter() int64
	Exit()
	ShouldShed(inflight int64) bool
}

type NarrativeConfig struct {
	Config
	Memory         MatthiasMemory
	Gateway        NarrativeGateway
	AdminUsernames []string
	// Env reads the cooldown settings once, as the Python router does.
	Env func(string) string
	// Log writes Python's warning lines (narrative_429, memory failures).
	Log func(string)
}

type NarrativeHandler struct {
	base      *Handler
	memory    MatthiasMemory
	gateway   NarrativeGateway
	log       func(string)
	admins    map[string]bool
	allAdmins bool

	defaultLimits map[string]*limiter
	comments      *slidingWindow
	portraits     *slidingWindow
	analysis      *slidingWindow
	portraitCool  *cooldown
	planCool      *cooldown
	puzzleCool    *cooldown
}

func manualCooldown(env func(string) string, name string, fallback int64) time.Duration {
	raw := strings.TrimSpace(env(name))
	seconds := fallback
	if raw != "" {
		if n, err := pyval.Int(raw); err == nil {
			seconds = max(60, min(n, 7*24*60*60))
		}
	}
	return time.Duration(seconds) * time.Second
}

func NewNarrative(cfg NarrativeConfig) (*NarrativeHandler, error) {
	if cfg.Memory == nil || cfg.Gateway == nil {
		return nil, errors.New("narrative API needs the Matthias memory and the gateway")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	env := cfg.Env
	if env == nil {
		env = os.Getenv
	}
	log := cfg.Log
	if log == nil {
		log = func(string) {}
	}
	h := &NarrativeHandler{
		base: base, memory: cfg.Memory, gateway: cfg.Gateway, log: log, admins: map[string]bool{},
		defaultLimits: map[string]*limiter{
			NarrativePattern: newLimiter(120, time.Minute), matthiasAudiencePattern: newLimiter(120, time.Minute),
			AdminAIMetricsPattern: newLimiter(120, time.Minute), AdminMatthiasPattern: newLimiter(120, time.Minute),
		},
		// Python's router keeps comments, portraits and rich analysis in
		// separate buckets (30, max(5, 30) and max(10, 30) per minute).
		comments:     newSlidingWindow(30, time.Minute),
		portraits:    newSlidingWindow(30, time.Minute),
		analysis:     newSlidingWindow(30, time.Minute),
		portraitCool: newCooldown(manualCooldown(env, "AI_PORTRAIT_MANUAL_COOLDOWN_SECONDS", 6*60*60), "Player portrait manual refresh cooldown"),
		planCool:     newCooldown(manualCooldown(env, "AI_TRAINING_PLAN_MANUAL_COOLDOWN_SECONDS", 6*60*60), "Training plan manual refresh cooldown"),
		puzzleCool:   newCooldown(manualCooldown(env, "AI_PERSONAL_PUZZLE_COOLDOWN_SECONDS", 12*60*60), "Personal puzzle generation cooldown"),
	}
	for _, raw := range cfg.AdminUsernames {
		name := strings.ToLower(strings.TrimSpace(raw))
		if name == "*" {
			h.allAdmins = true
		} else if name != "" {
			h.admins[name] = true
		}
	}
	return h, nil
}

func (h *NarrativeHandler) isAdmin(username string) bool {
	return h.allAdmins || h.admins[strings.ToLower(username)]
}

func (h *NarrativeHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, ok := NarrativeRoute(r)
	if !ok {
		http.NotFound(w, r)
		return
	}
	b := h.base
	securityHeaders(w)
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	_, allowed := b.origins[origin]
	if r.Method == http.MethodOptions {
		b.preflight(w, r, origin, allowed)
		return
	}
	if origin != "" && allowed {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
		w.Header().Add("Vary", "Origin")
	}
	w.Header().Set("X-Chess-Narrative-Native", "go")

	// Optional work is shed before anything else to protect the games.
	if pattern == NarrativePattern || pattern == AdminAIMetricsPattern {
		inflight := h.gateway.Enter()
		defer h.gateway.Exit()
		if h.gateway.ShouldShed(inflight) {
			w.Header().Set("Retry-After", "5")
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"detail":    "Servicio ocupado; la función secundaria se ha aplazado para proteger las partidas.",
				"requestId": w.Header().Get("X-Request-ID"),
				"degraded":  true,
			})
			return
		}
	}

	var raw []byte
	if r.Method == http.MethodPost {
		var status int
		if raw, status = readBody(w, r); status != 0 {
			return
		}
	} else if r.ContentLength > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}

	subject, version, tokenErr := b.verify(r)
	key := "user:" + subject
	if tokenErr != nil {
		key = "ip:" + b.clientIP(r)
	}
	if !h.defaultLimits[pattern].allow(key, b.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
		return
	}

	var body any
	hasBody := false
	if r.Method == http.MethodPost {
		decoded, ok := decodeModelBody(w, r, raw)
		if !ok {
			return
		}
		if _, isObject := decoded.(map[string]any); isObject {
			// Ordered, typed like json.loads: fact order and ints matter.
			if ordered, err := pydoc.Decode(raw); err == nil {
				decoded = ordered
			}
		}
		body, hasBody = decoded, decoded != nil
	}

	username, status, detail := b.currentUser(r, subject, version, tokenErr)
	if status != 0 {
		writeJSON(w, status, map[string]any{"detail": detail})
		return
	}
	if b.presence != nil {
		b.presence.Touch(r, username)
	}
	ctx := context.WithoutCancel(r.Context())
	switch pattern {
	case NarrativePattern:
		h.narrative(ctx, w, r, username, body, hasBody)
	case matthiasAudiencePattern:
		h.audience(ctx, w, username, body, hasBody)
	default:
		if !h.isAdmin(username) {
			writeJSON(w, http.StatusForbidden, map[string]any{"detail": "No tienes permisos de administrador."})
			return
		}
		if pattern == AdminAIMetricsPattern {
			writeDoc(w, http.StatusOK, h.gateway.Metrics())
			return
		}
		h.adminMatthias(ctx, w)
	}
}

type modelField struct {
	name     string
	limit    int
	required bool
	optional bool // Optional[str]: null allowed
	fallback string
}

// validateOrdered mirrors pydantic for a model of strings plus one dict
// field over an ordered JSON object.
func validateOrdered(body any, hasBody bool, fields []modelField, dictField string) (map[string]*string, bson.D, []map[string]any) {
	if !hasBody {
		return nil, nil, []map[string]any{{"type": "missing", "loc": []any{"body"}, "msg": "Field required"}}
	}
	object, ok := body.(bson.D)
	if !ok {
		return nil, nil, []map[string]any{{"type": "model_attributes_type", "loc": []any{"body"}, "msg": "Input should be a valid dictionary or object to extract fields from"}}
	}
	values := map[string]*string{}
	var facts bson.D
	var detail []map[string]any
	for _, f := range fields {
		if f.name == dictField {
			raw, present := pydoc.Get(object, f.name)
			if !present {
				facts = bson.D{}
				continue
			}
			d, isDict := raw.(bson.D)
			if !isDict {
				detail = append(detail, map[string]any{"type": "dict_type", "loc": []any{"body", f.name}, "msg": "Input should be a valid dictionary"})
				continue
			}
			facts = d
			continue
		}
		raw, present := pydoc.Get(object, f.name)
		if !present {
			if f.required {
				detail = append(detail, map[string]any{"type": "missing", "loc": []any{"body", f.name}, "msg": "Field required"})
				continue
			}
			if !f.optional {
				fallback := f.fallback
				values[f.name] = &fallback
			}
			continue
		}
		if raw == nil && f.optional {
			continue
		}
		s, isString := raw.(string)
		if !isString {
			detail = append(detail, map[string]any{"type": "string_type", "loc": []any{"body", f.name}, "msg": "Input should be a valid string"})
			continue
		}
		if utf8.RuneCountInString(s) > f.limit {
			detail = append(detail, map[string]any{"type": "string_too_long", "loc": []any{"body", f.name}, "msg": "String should have at most " + characters(f.limit)})
			continue
		}
		values[f.name] = &s
	}
	return values, facts, detail
}

var allowedRequestKinds = map[string]bool{
	"default": true, "opening_banter": true, "portrait_auto": true, "portrait_manual": true, "post_game": true,
	"combat_briefing": true, "combat_debrief": true, "unit_bio": true, "observability_summary": true,
	"training_plan": true, "training_plan_manual": true, "personal_puzzle_batch": true, "matthias_position": true,
}

var memoryEvents = map[string]bool{"player_portrait": true, "training_plan": true, "post_game_autopsy": true, "matthias_position": true}

func (h *NarrativeHandler) requestID(w http.ResponseWriter) *string {
	id := pyval.Prefix(strings.TrimSpace(w.Header().Get("X-Request-ID")), 80)
	if id == "" {
		return nil
	}
	return &id
}

func (h *NarrativeHandler) tooMany(w http.ResponseWriter, rid *string, eventType, requestKind, bucket, reason, retryAfter string) {
	id := "-"
	if rid != nil {
		id = *rid
	}
	ra := retryAfter
	if ra == "" {
		ra = "-"
	} else {
		w.Header().Set("Retry-After", retryAfter)
	}
	h.log(fmt.Sprintf("WARNING:  narrative_429 request_id=%s event_type=%s request_kind=%s bucket=%s reason=%s retry_after=%s",
		id, pyval.Prefix(eventTypeOr(eventType), 48), requestKind, bucket, pyval.Prefix(reason, 80), ra))
	writeJSON(w, http.StatusTooManyRequests, map[string]any{"detail": reason})
}

func eventTypeOr(eventType string) string {
	if eventType == "" {
		return "generic"
	}
	return eventType
}

// narrative mirrors narrative_api.narrative.
func (h *NarrativeHandler) narrative(ctx context.Context, w http.ResponseWriter, r *http.Request, username string, body any, hasBody bool) {
	values, facts, detail := validateOrdered(body, hasBody, []modelField{
		{name: "eventType", limit: 48, fallback: "generic"},
		{name: "requestKind", limit: 32, fallback: "default"},
		{name: "facts"},
		{name: "tone", limit: 32, fallback: "friendly_sarcastic"},
		{name: "locale", limit: 16, fallback: "es-ES"},
	}, "facts")
	if detail != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": detail})
		return
	}
	eventType := *values["eventType"]
	identityKey := "user:" + strings.ToLower(username)
	identityName := strings.TrimSpace(username)
	adminBypass := identityName != "" && h.isAdmin(identityName)
	requestKind := strings.ToLower(strings.TrimSpace(*values["requestKind"]))
	if requestKind == "" || !allowedRequestKinds[requestKind] {
		requestKind = "default"
	}
	isPortrait := eventType == "player_portrait"
	isAnalysis := narrative.RichAnalysisEvents[eventType]
	bucket, window := "comments", h.comments
	switch {
	case isPortrait:
		bucket, window = "player_portrait", h.portraits
	case isAnalysis:
		bucket, window = "analysis", h.analysis
	}
	rid := h.requestID(w)
	now := h.base.now()
	if !window.check(identityKey, now) {
		h.tooMany(w, rid, eventType, requestKind, bucket, "Narrative rate limit exceeded", "")
		return
	}
	var cool *cooldown
	switch {
	case isPortrait && requestKind == "portrait_manual" && !adminBypass:
		cool = h.portraitCool
	case eventType == "training_plan" && requestKind == "training_plan_manual" && !adminBypass:
		cool = h.planCool
	case eventType == "personal_puzzle_batch" && requestKind == "personal_puzzle_batch" && !adminBypass:
		cool = h.puzzleCool
	}
	if cool != nil {
		if retryAfter, blocked := cool.check(identityKey, now); blocked {
			h.tooMany(w, rid, eventType, requestKind, bucket, cool.detail, strconv.Itoa(retryAfter))
			return
		}
	}

	effective := facts
	if identityName != "" && memoryEvents[eventType] {
		if err := h.attachMemory(ctx, identityName, eventType, facts, &effective); err != nil {
			h.log(fmt.Sprintf("WARNING:  matthias_memory_context_failed event_type=%s error=%s", eventType, errorClass(err)))
		}
	}
	result := h.gateway.Generate(ctx, eventType, effective, values["tone"], values["locale"], requestKind, rid)
	if identityName != "" && eventType == "matthias_position" && pyval.Strip(result.Text) != "" {
		if _, err := h.memory.RecordEmblematicPosition(ctx, identityName, facts, h.base.now()); err != nil {
			h.log("WARNING:  matthias_position_memory_failed error=" + errorClass(err))
		}
	}
	// Only a real Workers AI answer spends a manual window.
	if cool != nil && result.Provider == "cloudflare" {
		cool.commit(identityKey, h.base.now())
	}
	writeDoc(w, http.StatusOK, result.Doc())
}

func (h *NarrativeHandler) attachMemory(ctx context.Context, username, eventType string, facts bson.D, effective *bson.D) error {
	now := h.base.now()
	if eventType == "player_portrait" {
		if err := h.memory.ObserveFacts(ctx, username, facts, now); err != nil {
			return err
		}
		if _, err := h.memory.ObserveEpisodes(ctx, username, facts, now); err != nil {
			return err
		}
	}
	memory, err := h.memory.Context(ctx, username, facts, now)
	if err != nil {
		return err
	}
	*effective = pydoc.Set(pydoc.Copy(facts), "matthias_memory", memory)
	return nil
}

// errorClass names the failure the way Python's logs do.
func errorClass(err error) string {
	switch {
	case errors.Is(err, pyval.ErrType):
		return "TypeError"
	case errors.Is(err, pyval.ErrValue):
		return "ValueError"
	}
	return "PersistentStorageUnavailable"
}

var questionKinds = map[string]bool{"improve": true, "tactics": true, "strengths": true, "action": true, "openings": true}

var allowedFactKeys = map[string]bool{
	"total_games": true, "record": true, "color_usage": true, "longest_win_streak": true, "human_captures": true, "by_mode": true,
	"favorite_opening": true, "openings": true, "rating_trend": true, "cpu_rivalry": true, "noteworthy_incidents": true,
	"puzzles_solved": true, "personal_training_positions": true, "achievements_unlocked": true, "achievements_total": true,
	"worst_recorded_move": true,
}

// memorySummary is _memory_summary; status is 503 or 500 when it raises.
func (h *NarrativeHandler) memorySummary(ctx context.Context, username string) (bson.D, int) {
	row, err := h.memory.Memory(ctx, username)
	if err != nil {
		return nil, http.StatusServiceUnavailable
	}
	_, doc, err := matthiasmem.MemorySummary(row, h.base.now())
	if err != nil {
		return nil, http.StatusInternalServerError
	}
	return doc, 0
}

func failWith(w http.ResponseWriter, status int) {
	if status == http.StatusServiceUnavailable {
		storageUnavailable(w)
		return
	}
	internalError(w)
}

// audience mirrors matthias_daily_api.daily_ask.
func (h *NarrativeHandler) audience(ctx context.Context, w http.ResponseWriter, username string, body any, hasBody bool) {
	values, rawFacts, detail := validateOrdered(body, hasBody, []modelField{
		{name: "questionKind", limit: 32, required: true},
		{name: "facts"},
		{name: "consultationId", limit: 80, optional: true},
	}, "facts")
	if detail != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": detail})
		return
	}
	kind := *values["questionKind"]
	var consultationID any
	if id := values["consultationId"]; id != nil {
		consultationID = *id
	}
	if !questionKinds[kind] {
		badRequest(w, "Consulta de Matthias no válida.")
		return
	}
	facts := bson.D{}
	for _, e := range rawFacts {
		if allowedFactKeys[e.Key] {
			facts = append(facts, e)
		}
	}
	facts = pydoc.Set(facts, "question_kind", kind)
	games, err := pyval.IntOr(mustGetD(facts, "total_games"))
	if err != nil {
		internalError(w)
		return
	}
	if games < 1 {
		writeJSON(w, http.StatusConflict, map[string]any{"detail": "Juega al menos una partida antes de pedir audiencia a Matthias."})
		return
	}
	admin := h.isAdmin(username)
	now := h.base.now()

	replay, err := h.memory.Replay(ctx, username, consultationID)
	if err != nil {
		h.log("WARNING:  matthias_memory_replay_failed error=" + errorClass(err))
		replay = nil
	}
	if replay != nil {
		if mustGetD(replay, "questionKind") != kind {
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "Ese identificador de consulta ya pertenece a otra pregunta de Matthias."})
			return
		}
		memory, status := h.memorySummary(ctx, username)
		if status != 0 {
			failWith(w, status)
			return
		}
		writeDoc(w, http.StatusOK, bson.D{
			{Key: "used", Value: !admin}, {Key: "pending", Value: false}, {Key: "unlimited", Value: admin},
			{Key: "questionKind", Value: kind}, {Key: "text", Value: mustGetD(replay, "text")},
			{Key: "provider", Value: "cloudflare"}, {Key: "retryable", Value: false}, {Key: "replayed", Value: true},
			{Key: "memory", Value: memory},
		})
		return
	}

	memoryContext := matthiasmem.FallbackContext()
	if err := h.observeForAudience(ctx, username, facts, now, &memoryContext); err != nil {
		h.log("WARNING:  matthias_memory_read_failed error=" + errorClass(err))
	}
	workerFacts := pydoc.Set(pydoc.Copy(facts), "matthias_memory", memoryContext)

	reservation := "admin-unlimited"
	if !admin {
		claim, err := h.memory.Reserve(ctx, username, now)
		if err != nil {
			storageUnavailable(w)
			return
		}
		if !claim.Claimed {
			if used, _ := pydoc.Get(claim.Status, "used"); used == true {
				writeJSON(w, http.StatusTooManyRequests, map[string]any{"detail": "Matthias ya ha concedido su audiencia de hoy."})
				return
			}
			writeJSON(w, http.StatusConflict, map[string]any{"detail": "Matthias ya está atendiendo otra consulta tuya. Bitte, una audiencia a la vez."})
			return
		}
		reservation = claim.Reservation
	}
	release := func() {
		if !admin {
			h.memory.Release(ctx, username, reservation, h.base.now())
		}
	}
	tone, locale := "friendly_sarcastic", "es-ES"
	result := h.gateway.Generate(ctx, "matthias_daily", workerFacts, &tone, &locale, "matthias_"+kind, h.requestID(w))
	text := pyval.Strip(result.Text)
	// Only a real Workers AI answer spends the audience; a fallback frees the
	// reservation so the player can retry today.
	if result.Provider != "cloudflare" || text == "" {
		release()
		provider := result.Provider
		if provider == "" {
			provider = "local"
		}
		var answer any
		if text != "" {
			answer = text
		}
		writeDoc(w, http.StatusOK, bson.D{
			{Key: "used", Value: false}, {Key: "pending", Value: false}, {Key: "unlimited", Value: admin},
			{Key: "provider", Value: provider}, {Key: "text", Value: answer}, {Key: "retryable", Value: true},
		})
		return
	}
	record := func() {
		if _, err := h.memory.RecordConsultation(ctx, username, kind, text, facts, consultationID, h.base.now()); err != nil {
			h.log("WARNING:  matthias_memory_write_failed error=" + errorClass(err))
		}
	}
	if admin {
		record()
		memory, status := h.memorySummary(ctx, username)
		if status != 0 {
			failWith(w, status)
			return
		}
		writeDoc(w, http.StatusOK, bson.D{
			{Key: "used", Value: false}, {Key: "pending", Value: false}, {Key: "unlimited", Value: true},
			{Key: "questionKind", Value: kind}, {Key: "text", Value: text}, {Key: "provider", Value: "cloudflare"},
			{Key: "retryable", Value: false}, {Key: "memory", Value: memory},
		})
		return
	}
	committed, err := h.memory.Commit(ctx, username, reservation, kind, text, h.base.now())
	if err != nil {
		release()
		storageUnavailable(w)
		return
	}
	record()
	memory, status := h.memorySummary(ctx, username)
	if status != 0 {
		release()
		failWith(w, status)
		return
	}
	writeDoc(w, http.StatusOK, append(committed,
		bson.E{Key: "unlimited", Value: false}, bson.E{Key: "provider", Value: "cloudflare"},
		bson.E{Key: "retryable", Value: false}, bson.E{Key: "memory", Value: memory}))
}

func (h *NarrativeHandler) observeForAudience(ctx context.Context, username string, facts bson.D, now time.Time, out *bson.D) error {
	if err := h.memory.ObserveFacts(ctx, username, facts, now); err != nil {
		return err
	}
	if _, err := h.memory.ObserveEpisodes(ctx, username, facts, now); err != nil {
		return err
	}
	memory, err := h.memory.Context(ctx, username, facts, now)
	if err != nil {
		return err
	}
	*out = memory
	return nil
}

func mustGetD(doc bson.D, key string) any {
	v, _ := pydoc.Get(doc, key)
	return v
}

// adminMatthias mirrors admin_matthias_status.
func (h *NarrativeHandler) adminMatthias(ctx context.Context, w http.ResponseWriter) {
	rows, err := h.memory.AdminRows(ctx)
	if err != nil {
		storageUnavailable(w)
		return
	}
	status, err := matthiasmem.AdminStatus(rows, "mongo")
	if err != nil {
		internalError(w)
		return
	}
	now := h.base.now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	writeDoc(w, http.StatusOK, append(status, bson.E{Key: "aiToday", Value: h.gateway.EventMetrics("matthias_daily", today.Unix())}))
}

// slidingWindow mirrors SlidingWindowLimiter (bounded identities, LRU).
type slidingWindow struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	order  *list.List
	events map[string]*list.Element
}

type windowEntry struct {
	key   string
	times []time.Time
}

func newSlidingWindow(limit int, window time.Duration) *slidingWindow {
	return &slidingWindow{limit: limit, window: window, order: list.New(), events: map[string]*list.Element{}}
}

func (s *slidingWindow) check(key string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := &windowEntry{key: key}
	if el, ok := s.events[key]; ok {
		entry = s.order.Remove(el).(*windowEntry)
	}
	cutoff := now.Add(-s.window)
	kept := entry.times[:0]
	for _, t := range entry.times {
		if !t.Before(cutoff) {
			kept = append(kept, t)
		}
	}
	entry.times = kept
	allowed := len(entry.times) < s.limit
	if allowed {
		entry.times = append(entry.times, now)
	}
	s.events[key] = s.order.PushBack(entry)
	for len(s.events) > 5000 {
		oldest := s.order.Front()
		delete(s.events, oldest.Value.(*windowEntry).key)
		s.order.Remove(oldest)
	}
	return allowed
}

// cooldown mirrors CooldownLimiter: committed only after a cloud success.
type cooldown struct {
	mu     sync.Mutex
	period time.Duration
	detail string
	last   map[string]time.Time
	order  []string
}

func newCooldown(period time.Duration, detail string) *cooldown {
	return &cooldown{period: period, detail: detail, last: map[string]time.Time{}}
}

func (c *cooldown) check(key string, now time.Time) (int, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	previous, ok := c.last[key]
	if !ok {
		return 0, false
	}
	remaining := c.period.Seconds() - now.Sub(previous).Seconds()
	if remaining > 0 {
		return max(1, int(remaining+0.999)), true
	}
	return 0, false
}

func (c *cooldown) commit(key string, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, ok := c.last[key]; !ok {
		c.order = append(c.order, key)
	}
	c.last[key] = now
	for len(c.order) > 5000 {
		delete(c.last, c.order[0])
		c.order = c.order[1:]
	}
}

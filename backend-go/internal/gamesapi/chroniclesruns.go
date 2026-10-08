package gamesapi

// Native Chronicles runs, mirroring chronicles_api.py and
// chronicles_run_store.py (default 120/minute each):
//
//	POST /api/chronicles/runs                       (201, Idempotency-Key, X-Chronicles-Party-Level)
//	GET  /api/chronicles/runs/{run_id}
//	PUT  /api/chronicles/runs/{run_id}/checkpoint

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chronicles"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesmap"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesrun"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/gameops"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	ChroniclesRunCreatePattern     = "POST /api/chronicles/runs"
	ChroniclesRunReadPattern       = "GET /api/chronicles/runs/{run_id}"
	ChroniclesRunCheckpointPattern = "PUT /api/chronicles/runs/{run_id}/checkpoint"
	chroniclesRunsPath             = "/api/chronicles/runs"
	partyLevelHeader               = "X-Chronicles-Party-Level"
)

var chroniclesRunNamespace = uuid.MustParse("e73c9496-fffd-4dc4-a0d0-8c7b6060a116")

// ChroniclesRunsRoute reports whether a request is a native run route.
func ChroniclesRunsRoute(r *http.Request) (pattern, runID string, ok bool) {
	method := r.Method
	if method == http.MethodOptions {
		method = preflightMethod(r)
	}
	path := r.URL.Path
	if path == chroniclesRunsPath {
		return ChroniclesRunCreatePattern, "", method == http.MethodPost
	}
	rest, found := strings.CutPrefix(path, chroniclesRunsPath+"/")
	if !found || rest == "" {
		return "", "", false
	}
	if id, isCheckpoint := strings.CutSuffix(rest, "/checkpoint"); isCheckpoint {
		if id != "" && !strings.Contains(id, "/") && method == http.MethodPut {
			return ChroniclesRunCheckpointPattern, id, true
		}
		return "", "", false
	}
	if !strings.Contains(rest, "/") && method == http.MethodGet {
		return ChroniclesRunReadPattern, rest, true
	}
	return "", "", false
}

// ChroniclesRunsConfig wires the run routes.
type ChroniclesRunsConfig struct {
	Config
	Runs chroniclesrun.Store
	// NewSeed is secrets.randbelow(MAX_SEED + 1); NewRunID is uuid4.
	NewSeed  func() int64
	NewRunID func() string
}

type ChroniclesRunsHandler struct {
	base     *Handler
	runs     chroniclesrun.Store
	newSeed  func() int64
	newRunID func() string
	limits   map[string]*limiter
}

func NewChroniclesRuns(cfg ChroniclesRunsConfig) (*ChroniclesRunsHandler, error) {
	if cfg.Runs == nil {
		return nil, errors.New("chronicles runs: nil store")
	}
	cfg.Store = readOnlyStore{}
	base, err := New(cfg.Config)
	if err != nil {
		return nil, err
	}
	h := &ChroniclesRunsHandler{base: base, runs: cfg.Runs, newSeed: cfg.NewSeed, newRunID: cfg.NewRunID, limits: map[string]*limiter{
		ChroniclesRunCreatePattern:     newLimiter(120, time.Minute),
		ChroniclesRunReadPattern:       newLimiter(120, time.Minute),
		ChroniclesRunCheckpointPattern: newLimiter(120, time.Minute),
	}}
	if h.newSeed == nil {
		h.newSeed = func() int64 {
			n, err := rand.Int(rand.Reader, big.NewInt(chroniclesmap.MapCodeMaxSeed+1))
			if err != nil {
				panic(err)
			}
			return n.Int64()
		}
	}
	if h.newRunID == nil {
		h.newRunID = func() string { return uuid.NewString() }
	}
	return h, nil
}

// pydantic error documents.
func problemDoc(kind string, loc bson.A, msg string, input any, ctx bson.D) bson.D {
	d := bson.D{{Key: "type", Value: kind}, {Key: "loc", Value: loc}, {Key: "msg", Value: msg}, {Key: "input", Value: input}}
	if ctx != nil {
		d = append(d, bson.E{Key: "ctx", Value: ctx})
	}
	return d
}

func withLoc(loc bson.A, more ...any) bson.A {
	out := append(bson.A(nil), loc...)
	return append(out, more...)
}

// laxInt is pydantic's python-mode int: the value, or its error.
func pydanticInt(value any, loc bson.A) (int64, bson.D) {
	switch v := value.(type) {
	case bool:
		if v {
			return 1, nil
		}
		return 0, nil
	case int32:
		return int64(v), nil
	case int64:
		return v, nil
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, problemDoc("finite_number", loc, "Input should be a finite number", v, nil)
		}
		if v != math.Trunc(v) {
			return 0, problemDoc("int_from_float", loc, "Input should be a valid integer, got a number with a fractional part", v, nil)
		}
		if math.Abs(v) >= 1<<63 {
			return 0, problemDoc("int_parsing_size", loc, "Unable to parse input string as an integer, exceeded maximum size", v, nil)
		}
		return int64(v), nil
	case string:
		n := queryInt(v)
		if n == nil {
			return 0, problemDoc("int_parsing", loc, "Input should be a valid integer, unable to parse string as an integer", v, nil)
		}
		if !n.IsInt64() {
			return math.MaxInt64, nil // beyond every bound we check
		}
		return n.Int64(), nil
	}
	return 0, problemDoc("int_type", loc, "Input should be a valid integer", value, nil)
}

// aliasField is one field of a pydantic model with populate_by_name.
type aliasField struct{ alias, name string }

// pick returns the key used for the field, its value and whether present.
func (f aliasField) pick(object bson.D) (string, any, bool) {
	if v, ok := pydoc.Get(object, f.alias); ok {
		return f.alias, v, true
	}
	if f.name != "" {
		if v, ok := pydoc.Get(object, f.name); ok {
			return f.name, v, true
		}
	}
	return f.alias, nil, false
}

// extras are the extra="forbid" errors for keys no field used.
func extras(object bson.D, used map[string]bool) bson.A {
	var out bson.A
	for _, e := range object {
		if !used[e.Key] {
			out = append(out, problemDoc("extra_forbidden", bson.A{"body", e.Key}, "Extra inputs are not permitted", e.Value, nil))
		}
	}
	return out
}

func modelObject(body any) (bson.D, bson.A) {
	if body == nil {
		return nil, bson.A{problemDoc("missing", bson.A{"body"}, "Field required", nil, nil)}
	}
	object, ok := body.(bson.D)
	if !ok {
		return nil, bson.A{problemDoc("model_attributes_type", bson.A{"body"}, "Input should be a valid dictionary or object to extract fields from", body, nil)}
	}
	return object, nil
}

// createRunBody mirrors CreateChroniclesRunRequest.
func createRunBody(body any) (*string, *int64, bson.A) {
	object, problems := modelObject(body)
	if problems != nil {
		return nil, nil, problems
	}
	used := map[string]bool{}
	key, value, present := aliasField{"mapId", "map_id"}.pick(object)
	var mapID *string
	if present {
		used[key] = true
		switch value := value.(type) {
		case nil:
		case string:
			mapID = &value
		default:
			problems = append(problems, problemDoc("string_type", bson.A{"body", key}, "Input should be a valid string", value, nil))
		}
	}
	key, value, present = aliasField{"dungeonLevel", "dungeon_level"}.pick(object)
	var dungeonLevel *int64
	if present {
		used[key] = true
		if value != nil {
			if level, problem := pydanticInt(value, bson.A{"body", key}); problem != nil {
				problems = append(problems, problem)
			} else if level < 1 {
				problems = append(problems, problemDoc("greater_than_equal", bson.A{"body", key}, "Input should be greater than or equal to 1", value, bson.D{{Key: "ge", Value: int64(1)}}))
			} else if level > 99 {
				problems = append(problems, problemDoc("less_than_equal", bson.A{"body", key}, "Input should be less than or equal to 99", value, bson.D{{Key: "le", Value: int64(99)}}))
			} else {
				dungeonLevel = &level
			}
		}
	}
	return mapID, dungeonLevel, append(problems, extras(object, used)...)
}

type checkpointBody struct {
	expectedWorldVersion          int64
	currentMapID                  string
	worldFlags, inventory, quests bson.D
	consumed, claimed             []string
	terminalStatus                *string
}

func strField(loc bson.A, value any, minLen, maxLen int) (string, bson.D) {
	s, ok := value.(string)
	if !ok {
		return "", problemDoc("string_type", loc, "Input should be a valid string", value, nil)
	}
	n := utf8.RuneCountInString(s)
	if n < minLen {
		return "", problemDoc("string_too_short", loc, fmt.Sprintf("String should have at least %s", characters(minLen)), s, bson.D{{Key: "min_length", Value: int64(minLen)}})
	}
	if n > maxLen {
		return "", problemDoc("string_too_long", loc, fmt.Sprintf("String should have at most %s", characters(maxLen)), s, bson.D{{Key: "max_length", Value: int64(maxLen)}})
	}
	return s, nil
}

// checkpointRunBody mirrors CheckpointChroniclesRunRequest.
func checkpointRunBody(body any) (checkpointBody, bson.A) {
	var req checkpointBody
	object, problems := modelObject(body)
	if problems != nil {
		return req, problems
	}
	used := map[string]bool{}
	field := func(alias, name string) (bson.A, any, bool) {
		key, value, present := aliasField{alias, name}.pick(object)
		if present {
			used[key] = true
		}
		return bson.A{"body", key}, value, present
	}
	if loc, value, present := field("expectedWorldVersion", "expected_world_version"); !present {
		problems = append(problems, problemDoc("missing", loc, "Field required", object, nil))
	} else if n, problem := pydanticInt(value, loc); problem != nil {
		problems = append(problems, problem)
	} else if n < 0 {
		problems = append(problems, problemDoc("greater_than_equal", loc, "Input should be greater than or equal to 0", value, bson.D{{Key: "ge", Value: int64(0)}}))
	} else {
		req.expectedWorldVersion = n
	}
	if loc, value, present := field("currentMapId", "current_map_id"); !present {
		problems = append(problems, problemDoc("missing", loc, "Field required", object, nil))
	} else if s, problem := strField(loc, value, 1, 64); problem != nil {
		problems = append(problems, problem)
	} else {
		req.currentMapID = s
	}
	for _, f := range []struct {
		alias, name string
		dst         *bson.D
	}{{"worldFlags", "world_flags", &req.worldFlags}, {"inventory", "", &req.inventory}, {"quests", "", &req.quests}} {
		*f.dst = bson.D{}
		loc, value, present := field(f.alias, f.name)
		if !present {
			continue
		}
		if d, ok := value.(bson.D); ok {
			*f.dst = d
		} else {
			problems = append(problems, problemDoc("dict_type", loc, "Input should be a valid dictionary", value, nil))
		}
	}
	for _, f := range []struct {
		alias, name string
		dst         *[]string
	}{{"consumedContentIds", "consumed_content_ids", &req.consumed}, {"claimedRewards", "claimed_rewards", &req.claimed}} {
		loc, value, present := field(f.alias, f.name)
		if !present {
			continue
		}
		list, ok := value.(bson.A)
		if !ok {
			problems = append(problems, problemDoc("list_type", loc, "Input should be a valid list", value, nil))
			continue
		}
		for i, item := range list {
			if s, isString := item.(string); isString {
				*f.dst = append(*f.dst, s)
			} else {
				problems = append(problems, problemDoc("string_type", withLoc(loc, int64(i)), "Input should be a valid string", item, nil))
			}
		}
	}
	if loc, value, present := field("terminalStatus", "terminal_status"); present && value != nil {
		if s, ok := value.(string); ok && (s == "completed" || s == "defeated") {
			req.terminalStatus = &s
		} else {
			problems = append(problems, problemDoc("literal_error", loc, "Input should be 'completed' or 'defeated'", value, bson.D{{Key: "expected", Value: "'completed' or 'defeated'"}}))
		}
	}
	return req, append(problems, extras(object, used)...)
}

// partyLevelFromHeader is `int | None = Header(ge=1, le=12)`.
func partyLevelFromHeader(r *http.Request) (*int64, bson.D) {
	values := r.Header.Values(partyLevelHeader)
	if len(values) == 0 {
		return nil, nil
	}
	raw := values[0]
	loc := bson.A{"header", partyLevelHeader}
	n := queryInt(raw)
	switch {
	case n == nil:
		return nil, problemDoc("int_parsing", loc, "Input should be a valid integer, unable to parse string as an integer", raw, nil)
	case n.Cmp(big.NewInt(1)) < 0:
		return nil, problemDoc("greater_than_equal", loc, "Input should be greater than or equal to 1", raw, bson.D{{Key: "ge", Value: int64(1)}})
	case n.Cmp(big.NewInt(12)) > 0:
		return nil, problemDoc("less_than_equal", loc, "Input should be less than or equal to 12", raw, bson.D{{Key: "le", Value: int64(12)}})
	}
	level := n.Int64()
	return &level, nil
}

type httpError struct {
	status int
	detail string
}

func (e *httpError) Error() string { return e.detail }

func fail(status int, detail string) error { return &httpError{status, detail} }

// canonicalLen is len(_canonical_bytes(value)).
func canonicalLen(value bson.D) int {
	raw, err := pydoc.EncodeSorted(value, false)
	if err != nil {
		return math.MaxInt
	}
	return len(raw)
}

func runeLen(s string) int { return utf8.RuneCountInString(s) }

func normalizeFlags(flags bson.D) (bson.D, error) {
	if len(flags) > 128 || canonicalLen(flags) > 16_384 {
		return nil, fail(400, "El checkpoint contiene demasiados flags.")
	}
	for _, e := range flags {
		if e.Key == "" || runeLen(e.Key) > 96 {
			return nil, fail(400, "El checkpoint contiene una clave de flag inválida.")
		}
		switch v := e.Value.(type) {
		case nil, bool, int32, int64:
		case string:
			if runeLen(v) > 256 {
				return nil, fail(400, fmt.Sprintf("El flag %s es demasiado largo.", e.Key))
			}
		default:
			return nil, fail(400, fmt.Sprintf("El flag %s usa un valor no persistible.", e.Key))
		}
	}
	return flags, nil
}

func lookupOr(d bson.D, key string, fallback any) any {
	if v, ok := pydoc.Get(d, key); ok {
		return v
	}
	return fallback
}

func normalizeInventory(inventory bson.D) (bson.D, error) {
	if len(inventory) > 64 || canonicalLen(inventory) > 16_384 {
		return nil, fail(400, "El checkpoint contiene demasiado inventario.")
	}
	out := bson.D{}
	for _, e := range inventory {
		id := e.Key
		if id == "" || runeLen(id) > 96 {
			return nil, fail(400, "El inventario contiene un ID inválido.")
		}
		item, ok := e.Value.(bson.D)
		if !ok {
			return nil, fail(400, fmt.Sprintf("El objeto %s usa un formato inválido.", id))
		}
		quantity := lookupOr(item, "quantity", nil)
		var n int64
		isInt := false
		switch q := quantity.(type) {
		case int32:
			n, isInt = int64(q), true
		case int64:
			n, isInt = q, true
		}
		if !isInt || n < 1 || n > 9999 {
			return nil, fail(400, fmt.Sprintf("El objeto %s tiene una cantidad inválida.", id))
		}
		name, isString := lookupOr(item, "name", id).(string)
		if !isString || name == "" || runeLen(name) > 160 {
			return nil, fail(400, fmt.Sprintf("El objeto %s tiene un nombre inválido.", id))
		}
		description, isString := lookupOr(item, "description", "").(string)
		if !isString || runeLen(description) > 1024 {
			return nil, fail(400, fmt.Sprintf("El objeto %s tiene una descripción inválida.", id))
		}
		out = append(out, bson.E{Key: id, Value: bson.D{
			{Key: "id", Value: id}, {Key: "name", Value: name}, {Key: "description", Value: description}, {Key: "quantity", Value: quantity},
		}})
	}
	return out, nil
}

var errUnhashable = errors.New("TypeError: unhashable type")

func normalizeQuests(quests bson.D) (bson.D, error) {
	if len(quests) > 64 || canonicalLen(quests) > 32_768 {
		return nil, fail(400, "El checkpoint contiene demasiadas quests.")
	}
	out := bson.D{}
	for _, e := range quests {
		id := e.Key
		if id == "" || runeLen(id) > 96 {
			return nil, fail(400, "Las quests contienen un ID inválido.")
		}
		quest, ok := e.Value.(bson.D)
		if !ok {
			return nil, fail(400, fmt.Sprintf("La quest %s usa un formato inválido.", id))
		}
		status := lookupOr(quest, "status", nil)
		switch status.(type) {
		case bson.D, bson.A:
			return nil, errUnhashable // `status not in {...}` raises: a 500
		}
		if status != "active" && status != "completed" {
			return nil, fail(400, fmt.Sprintf("La quest %s tiene un estado inválido.", id))
		}
		title, isString := lookupOr(quest, "title", id).(string)
		if !isString || title == "" || runeLen(title) > 200 {
			return nil, fail(400, fmt.Sprintf("La quest %s tiene un título inválido.", id))
		}
		description, isString := lookupOr(quest, "description", "").(string)
		if !isString || runeLen(description) > 2048 {
			return nil, fail(400, fmt.Sprintf("La quest %s tiene una descripción inválida.", id))
		}
		objective, isString := lookupOr(quest, "objective", "").(string)
		if !isString || runeLen(objective) > 1024 {
			return nil, fail(400, fmt.Sprintf("La quest %s tiene un objetivo inválido.", id))
		}
		order := lookupOr(quest, "order", int64(0))
		var magnitude float64
		switch o := order.(type) {
		case int32:
			magnitude = math.Abs(float64(o))
		case int64:
			magnitude = math.Abs(float64(o))
		case float64:
			magnitude = math.Abs(o)
		default:
			return nil, fail(400, fmt.Sprintf("La quest %s tiene un orden inválido.", id))
		}
		if magnitude > 1_000_000 {
			return nil, fail(400, fmt.Sprintf("La quest %s tiene un orden inválido.", id))
		}
		out = append(out, bson.E{Key: id, Value: bson.D{
			{Key: "id", Value: id}, {Key: "title", Value: title}, {Key: "description", Value: description},
			{Key: "objective", Value: objective}, {Key: "order", Value: order}, {Key: "status", Value: status},
		}})
	}
	return out, nil
}

func normalizeIDs(values []string, label string) ([]string, error) {
	if len(values) > 512 {
		return nil, fail(400, label+" contiene demasiados elementos.")
	}
	seen := map[string]bool{}
	out := []string{}
	for _, value := range values {
		item := pyval.Strip(value)
		if item == "" || runeLen(item) > 128 {
			return nil, fail(400, label+" contiene un ID inválido.")
		}
		if !seen[item] {
			seen[item] = true
			out = append(out, item)
		}
	}
	return out, nil
}

func int64Ptr(v any) *int64 {
	if v == nil {
		return nil
	}
	n, err := pyval.Int(v)
	if err != nil {
		return nil
	}
	return &n
}

func placementOf(run bson.D) int {
	n, err := pyval.Int(pyval.Or(lookupOr(run, "contentPlacementVersion", int64(0)), int64(0)))
	if err != nil {
		return 0
	}
	return int(n)
}

func runSeed(run bson.D) int64 {
	n, _ := pyval.Int(lookupOr(run, "seed", nil))
	return n
}

func dungeonLevelOf(run bson.D) int64 {
	n, err := pyval.Int(lookupOr(run, "dungeonLevel", int64(1)))
	if err != nil || n < 1 {
		return 1
	}
	return n
}

// areaErr maps chronicles_area_envelope's HTTPExceptions.
func areaErr(err error) error {
	switch {
	case errors.Is(err, chronicles.ErrMapNotFound):
		return fail(404, "Mapa de Chronicles no encontrado.")
	case errors.Is(err, chronicles.ErrManifestInvalid):
		return fail(500, "El manifiesto de Chronicles no supera validación.")
	}
	return err
}

func routeStore(route *chronicles.RouteSnapshot) *chroniclesrun.Route {
	if route == nil {
		return nil
	}
	doc := route.Doc()
	exits, _ := pydoc.Get(doc, "primaryExitIds")
	return &chroniclesrun.Route{PolicyVersion: route.PolicyVersion, MapIDs: route.MapIDs, PrimaryExitIDs: exits.(bson.D)}
}

// bootstrap is _run_bootstrap_payload.
func bootstrap(run bson.D, route *chronicles.RouteSnapshot) (bson.D, error) {
	opts := chronicles.AreaOptions{
		Route: route, PlannerSnapshot: lookupOr(run, "plannerSnapshot", nil),
		PartyLevel: int64Ptr(lookupOr(run, "partyLevel", nil)), DungeonLevel: dungeonLevelOf(run), PlacementVersion: placementOf(run),
	}
	currentMapID := lookupOr(run, "currentMapId", nil)
	areas := bson.A{}
	var area bson.D
	for _, mapID := range chronicles.ShippedMapIDs() {
		envelope, err := chronicles.AreaEnvelope(mapID, runSeed(run), opts)
		if err != nil {
			return nil, areaErr(err)
		}
		areas = append(areas, envelope)
		if area == nil && lookupOr(envelope, "mapId", nil) == currentMapID {
			area = envelope
		}
	}
	if area == nil {
		return nil, fail(409, "El mapa actual de esta run ya no está disponible.")
	}
	if !pydoc.Equal(lookupOr(area, "contentVersion", nil), lookupOr(run, "contentVersion", nil)) ||
		!pydoc.Equal(lookupOr(area, "manifestRevision", nil), lookupOr(run, "manifestRevision", nil)) {
		return nil, fail(409, "La revisión de contenido de esta run ya no está disponible.")
	}
	payload := append(append(bson.D(nil), run...), bson.E{Key: "area", Value: area}, bson.E{Key: "areas", Value: areas})
	if route != nil {
		ids := bson.A{}
		for _, id := range route.MapIDs {
			ids = append(ids, id)
		}
		payload = pydoc.Set(payload, "route", bson.D{
			{Key: "policyVersion", Value: route.PolicyVersion},
			{Key: "revision", Value: route.Revision(runSeed(run))},
			{Key: "mapIds", Value: ids},
		})
	}
	return payload, nil
}

func (h *ChroniclesRunsHandler) create(ctx context.Context, r *http.Request, username string, mapID *string, partyLevel, requestedDungeonLevel *int64) (bson.D, error) {
	var rawKey *string
	if values := r.Header.Values("Idempotency-Key"); len(values) > 0 {
		rawKey = &values[0]
	}
	key, err := gameops.NormalizeKey(rawKey)
	if err != nil {
		return nil, fail(400, gameops.InvalidKeyDetail)
	}
	var mapValue any
	if mapID != nil {
		mapValue = *mapID
	}
	fingerprintInput := map[string]any{"mapId": mapValue}
	if requestedDungeonLevel != nil {
		fingerprintInput["dungeonLevel"] = *requestedDungeonLevel
	}
	fingerprint, err := gameops.Fingerprint(fingerprintInput)
	if err != nil {
		return nil, err
	}
	dungeonLevel := int64(1)
	if requestedDungeonLevel != nil {
		dungeonLevel = *requestedDungeonLevel
	}
	runID := h.newRunID()
	if key != nil {
		runID = uuid.NewSHA1(chroniclesRunNamespace, []byte(username+":"+*key)).String()
	}
	conflict := func(err error) error {
		if errors.Is(err, chroniclesrun.ErrIdempotencyConflict) {
			return fail(409, "La misma Idempotency-Key se reutilizó con otra configuración de run.")
		}
		return err
	}
	stableRoute := func(run bson.D) (*chronicles.RouteSnapshot, error) {
		route, err := chronicles.NormalizeRouteSnapshot(lookupOr(run, "route", nil))
		if err != nil || route != nil || mapID != nil {
			return route, err
		}
		return chronicles.RouteSnapshotForLevel(runSeed(run), dungeonLevelOf(run))
	}
	if key != nil {
		existing, err := h.runs.Replay(ctx, runID, username, fingerprint)
		if err != nil {
			return nil, conflict(err)
		}
		if existing != nil {
			route, err := stableRoute(existing)
			if err != nil {
				return nil, err
			}
			return bootstrap(existing, route)
		}
	}
	seed := h.newSeed()
	var route *chronicles.RouteSnapshot
	selected := ""
	if mapID == nil {
		if route, err = chronicles.RouteSnapshotForLevel(seed, dungeonLevel); err != nil {
			return nil, err
		}
		selected = route.MapIDs[0]
	} else {
		selected = *mapID
	}
	placement := int64(chronicles.ContentPlacementVersion)
	area, err := chronicles.AreaEnvelope(selected, seed, chronicles.AreaOptions{Route: route, PartyLevel: partyLevel, DungeonLevel: dungeonLevel, PlacementVersion: int(placement)})
	if err != nil {
		return nil, areaErr(err)
	}
	contentVersion, _ := pyval.Int(lookupOr(area, "contentVersion", nil))
	revision, _ := lookupOr(area, "manifestRevision", "").(string)
	run, err := h.runs.Create(ctx, chroniclesrun.NewRun{
		RunID: runID, Owner: username, Seed: seed, MapID: selected, ContentVersion: contentVersion,
		ManifestRevision: revision, Fingerprint: fingerprint, Route: routeStore(route),
		PartyLevel: partyLevel, DungeonLevel: &dungeonLevel, PlacementVersion: &placement, Now: h.base.now().UTC(),
	})
	if err != nil {
		return nil, conflict(err)
	}
	stable, err := stableRoute(run)
	if err != nil {
		return nil, err
	}
	return bootstrap(run, stable)
}

func (h *ChroniclesRunsHandler) checkpoint(ctx context.Context, username, runID string, body checkpointBody) (bson.D, error) {
	run, err := h.runs.Get(ctx, runID, username)
	if err != nil {
		return nil, err
	}
	if run == nil {
		return nil, fail(404, "Run de Chronicles no encontrada.")
	}
	route, err := chronicles.NormalizeRouteSnapshot(lookupOr(run, "route", nil))
	if err != nil {
		return nil, err
	}
	planner := lookupOr(run, "plannerSnapshot", nil)
	opts := chronicles.AreaOptions{Route: route, PlannerSnapshot: planner, PartyLevel: int64Ptr(lookupOr(run, "partyLevel", nil)), DungeonLevel: dungeonLevelOf(run), PlacementVersion: placementOf(run)}
	currentMapID, _ := lookupOr(run, "currentMapId", "").(string)
	current, err := chronicles.AreaEnvelope(currentMapID, runSeed(run), opts)
	if err != nil {
		return nil, areaErr(err)
	}
	if !pydoc.Equal(lookupOr(current, "contentVersion", nil), lookupOr(run, "contentVersion", nil)) ||
		!pydoc.Equal(lookupOr(current, "manifestRevision", nil), lookupOr(run, "manifestRevision", nil)) {
		return nil, fail(409, "La revisión de contenido de esta run ya no está disponible.")
	}
	target := body.currentMapID
	if !chroniclesMapID(target) {
		return nil, fail(404, "Mapa de Chronicles no encontrado.")
	}
	manifest, _ := lookupOr(current, "manifest", nil).(bson.D)
	if target != currentMapID && !chronicles.TransitionTargets(manifest)[target] {
		return nil, fail(409, "La transición solicitada no pertenece al mundo actual de la run.")
	}
	targetArea := current
	if target != currentMapID {
		if targetArea, err = chronicles.AreaEnvelope(target, runSeed(run), opts); err != nil {
			return nil, areaErr(err)
		}
	}
	flags, err := normalizeFlags(body.worldFlags)
	if err != nil {
		return nil, err
	}
	if body.terminalStatus != nil {
		expected := "defeated"
		if *body.terminalStatus == "completed" {
			expected = "escaped"
		}
		if phase, _ := pydoc.Get(flags, "__chrRuntime.phase"); phase != expected {
			return nil, fail(400, fmt.Sprintf("terminalStatus=%s no coincide con la fase runtime.", *body.terminalStatus))
		}
	}
	inventory, err := normalizeInventory(body.inventory)
	if err != nil {
		return nil, err
	}
	quests, err := normalizeQuests(body.quests)
	if err != nil {
		return nil, err
	}
	consumed, err := normalizeIDs(body.consumed, "consumedContentIds")
	if err != nil {
		return nil, err
	}
	claimed, err := normalizeIDs(body.claimed, "claimedRewards")
	if err != nil {
		return nil, err
	}
	contentVersion, _ := pyval.Int(lookupOr(targetArea, "contentVersion", nil))
	revision, _ := lookupOr(targetArea, "manifestRevision", "").(string)
	updated, err := h.runs.Checkpoint(ctx, chroniclesrun.Checkpoint{
		RunID: runID, Owner: username, ExpectedWorldVersion: body.expectedWorldVersion, MapID: target,
		ContentVersion: contentVersion, ManifestRevision: revision, WorldFlags: flags, Inventory: inventory,
		Quests: quests, ConsumedContentIDs: consumed, ClaimedRewards: claimed, TerminalStatus: body.terminalStatus,
		Now: h.base.now().UTC(),
	})
	switch {
	case errors.Is(err, chroniclesrun.ErrWorldVersion):
		return nil, fail(409, "La run cambió desde este cliente; recarga antes de guardar otro checkpoint.")
	case errors.Is(err, chroniclesrun.ErrTerminal):
		return nil, fail(409, "La run de Chronicles ya terminó y no admite más checkpoints.")
	case err != nil:
		return nil, err
	case updated == nil:
		return nil, fail(404, "Run de Chronicles no encontrada.")
	}
	return updated, nil
}

func chroniclesMapID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for i, c := range id {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || (c == '-' && i > 0)) {
			return false
		}
	}
	return true
}

func (h *ChroniclesRunsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, runID, ok := ChroniclesRunsRoute(r)
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
	w.Header().Set("X-Chess-Chronicles-Native", "go")
	if r.ContentLength > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}
	subject, version, tokenErr := b.verify(r)
	key := "user:" + subject
	if tokenErr != nil {
		key = "ip:" + b.clientIP(r)
	}
	if !h.limits[pattern].allow(key, b.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
		return
	}
	var body any
	if pattern != ChroniclesRunReadPattern {
		raw, status := readBody(w, r)
		if status != 0 {
			return
		}
		if body, ok = decodeOrderedBody(w, r, raw); !ok {
			return
		}
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
	var (
		payload bson.D
		err     error
		code    = http.StatusOK
	)
	switch pattern {
	case ChroniclesRunReadPattern:
		payload, err = h.runs.Get(ctx, runID, username)
		if err == nil && payload == nil {
			err = fail(404, "Run de Chronicles no encontrada.")
		}
	case ChroniclesRunCreatePattern:
		level, headerProblem := partyLevelFromHeader(r)
		mapID, dungeonLevel, problems := createRunBody(body)
		if headerProblem != nil {
			problems = append(bson.A{headerProblem}, problems...)
		}
		if problems != nil {
			writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: problems}})
			return
		}
		code = http.StatusCreated
		payload, err = h.create(ctx, r, username, mapID, level, dungeonLevel)
	default:
		req, problems := checkpointRunBody(body)
		if problems != nil {
			writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: problems}})
			return
		}
		payload, err = h.checkpoint(ctx, username, runID, req)
	}
	var httpErr *httpError
	switch {
	case errors.As(err, &httpErr):
		writeJSON(w, httpErr.status, map[string]any{"detail": httpErr.detail})
	case errors.Is(err, chroniclesrun.ErrUnavailable):
		storageUnavailable(w)
	case err != nil:
		internalError(w)
	default:
		writeDoc(w, code, payload)
	}
}

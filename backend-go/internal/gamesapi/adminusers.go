package gamesapi

// Native Admin user tools, mirroring admin_api.py (require_admin, default
// 120/minute each):
//
//	GET  /api/admin/users
//	GET  /api/admin/matchmaking-telemetry
//	POST /api/admin/user-rating
//	POST /api/admin/user-insights
//	GET  /api/admin/users/{target_username}/insights
//	POST /api/admin/matthias/memory
//	POST /api/admin/matthias/reset-memory
//	POST /api/admin/delete-user

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf16"

	"go.mongodb.org/mongo-driver/v2/bson"
	"golang.org/x/text/cases"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/admininsights"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/matthiasmem"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/profilestore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	AdminUsersPattern           = "GET /api/admin/users"
	AdminMatchmakingPattern     = "GET /api/admin/matchmaking-telemetry"
	AdminUserRatingPattern      = "POST /api/admin/user-rating"
	AdminUserInsightsPattern    = "POST /api/admin/user-insights"
	AdminUserInsightsGetPattern = "GET /api/admin/users/{target_username}/insights"
	AdminMatthiasMemoryPattern  = "POST /api/admin/matthias/memory"
	AdminMatthiasResetPattern   = "POST /api/admin/matthias/reset-memory"
	AdminDeleteUserPattern      = "POST /api/admin/delete-user"

	ratingKey      = "chess-study-player-rating"
	ratingAuditKey = "chess-study-admin-rating-audit"
	matchmakingKey = "chess-study-matchmaking-telemetry-v1"
)

var adminUserPaths = map[string]string{
	"/api/admin/users": AdminUsersPattern, "/api/admin/matchmaking-telemetry": AdminMatchmakingPattern,
	"/api/admin/user-rating": AdminUserRatingPattern, "/api/admin/user-insights": AdminUserInsightsPattern,
	"/api/admin/matthias/memory": AdminMatthiasMemoryPattern, "/api/admin/matthias/reset-memory": AdminMatthiasResetPattern,
	"/api/admin/delete-user": AdminDeleteUserPattern,
}

// AdminUsersRoute reports whether a request is a native Admin user route
// (and, for the GET insights route, its path username).
func AdminUsersRoute(r *http.Request) (pattern, target string, ok bool) {
	method := r.Method
	if method == http.MethodOptions {
		method = preflightMethod(r)
	}
	if p, known := adminUserPaths[r.URL.Path]; known {
		return p, "", strings.HasPrefix(p, method+" ")
	}
	rest, found := strings.CutPrefix(r.URL.Path, "/api/admin/users/")
	if name, isInsights := strings.CutSuffix(rest, "/insights"); found && isInsights && name != "" && !strings.Contains(name, "/") && method == http.MethodGet {
		return AdminUserInsightsGetPattern, name, true
	}
	return "", "", false
}

// AdminUserAccounts is the users collection side Admin reads.
type AdminUserAccounts interface {
	ListOverview(ctx context.Context) ([]bson.D, error)
	Exists(ctx context.Context, username string) (bool, error)
	Usernames(ctx context.Context) ([]any, error)
	Delete(ctx context.Context, username string) (bool, error)
}

// AdminProfiles is profilestore.Store.
type AdminProfiles interface {
	Get(ctx context.Context, username string) (bson.D, bool, error)
	Patch(ctx context.Context, username string, changes, expected bson.D) (bson.D, *profilestore.Conflict, error)
	DataForUsers(ctx context.Context, usernames, keys []string) (map[string]bson.D, error)
}

// AdminMatthiasMemory is matthiasmem.Store's per-user memory.
type AdminMatthiasMemory interface {
	Memory(ctx context.Context, username string) (bson.D, error)
	DeleteMemory(ctx context.Context, username string) error
}

// CountryResolver is ipgeo.Resolver.
type CountryResolver interface {
	Cached(raw any) string
	Schedule(raw any) bool
}

type AdminUsersConfig struct {
	Config
	Users          AdminUserAccounts
	Profiles       AdminProfiles
	Matthias       AdminMatthiasMemory
	Purge          Purger
	Countries      CountryResolver
	NetworkStatus  func(raw any) string
	AdminUsernames []string
	// Gateway and Memory serve the portrait and personality preview.
	Gateway NarrativeGateway
	Memory  AdminPortraitMemory
}

type AdminUsersHandler struct {
	cfg    AdminUsersConfig
	base   *Handler
	admins adminSet
	limits map[string]*limiter
}

func NewAdminUsers(cfg AdminUsersConfig) (*AdminUsersHandler, error) {
	if cfg.Users == nil || cfg.Profiles == nil || cfg.Matthias == nil || cfg.Purge == nil || cfg.Countries == nil || cfg.NetworkStatus == nil || cfg.Gateway == nil || cfg.Memory == nil {
		return nil, errors.New("admin users API: missing dependency")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	limits := map[string]*limiter{}
	for _, p := range adminUserPaths {
		limits[p] = newLimiter(120, time.Minute)
	}
	limits[AdminUserInsightsGetPattern] = newLimiter(120, time.Minute)
	return &AdminUsersHandler{cfg: cfg, base: base, admins: newAdminSet(cfg.AdminUsernames), limits: limits}, nil
}

var errStorage = errors.New("storage unavailable")

func storage(err error) error {
	if err != nil {
		return errStorage
	}
	return nil
}

// resolveTarget is _resolve_admin_target_username.
func (h *AdminUsersHandler) resolveTarget(ctx context.Context, raw string) (string, error) {
	candidate := pyval.Strip(raw)
	if candidate == "" {
		return "", fail(400, "Falta el usuario a consultar.")
	}
	exists, err := h.cfg.Users.Exists(ctx, candidate)
	if err != nil {
		return "", errStorage
	}
	if exists {
		return candidate, nil
	}
	if lowered := strings.ToLower(candidate); lowered != candidate {
		exists, err := h.cfg.Users.Exists(ctx, lowered)
		if err != nil {
			return "", errStorage
		}
		if exists {
			return lowered, nil
		}
	}
	names, err := h.cfg.Users.Usernames(ctx)
	if err != nil {
		return "", errStorage
	}
	fold := cases.Fold()
	want := fold.String(candidate)
	for _, name := range names {
		if s := pyval.Str(name); fold.String(s) == want {
			return s, nil
		}
	}
	return "", fail(404, "Usuario no encontrado.")
}

// usernameBody validates {username: str (max 64)} plus, for the rating
// route, {rating: int 400..3000} (pydantic, extras ignored).
func usernameBody(body any, withRating bool) (string, int64, bson.A) {
	object, problems := modelObject(body)
	if problems != nil {
		return "", 0, problems
	}
	username, problem := stringField(object, "username", 0, 64)
	if problem != nil {
		problems = append(problems, problem)
	}
	var rating int64
	if withRating {
		loc := bson.A{"body", "rating"}
		raw, present := pydoc.Get(object, "rating")
		switch n, problem := pydanticInt(raw, loc); {
		case !present:
			problems = append(problems, problemDoc("missing", loc, "Field required", object, nil))
		case problem != nil:
			problems = append(problems, problem)
		case n < 400:
			problems = append(problems, problemDoc("greater_than_equal", loc, "Input should be greater than or equal to 400", raw, bson.D{{Key: "ge", Value: int64(400)}}))
		case n > 3000:
			problems = append(problems, problemDoc("less_than_equal", loc, "Input should be less than or equal to 3000", raw, bson.D{{Key: "le", Value: int64(3000)}}))
		default:
			rating = n
		}
	}
	return username, rating, problems
}

// asciiJSON is json.dumps(value, separators=(",", ":")): document order,
// ensure_ascii.
func asciiJSON(value any) (string, error) {
	raw, err := pydoc.Encode(value)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	for _, r := range string(raw) {
		if r < 0x80 {
			b.WriteRune(r)
			continue
		}
		for _, unit := range utf16.Encode([]rune{r}) {
			fmt.Fprintf(&b, `\u%04x`, unit)
		}
	}
	return b.String(), nil
}

func (h *AdminUsersHandler) listUsers(ctx context.Context) (bson.D, error) {
	rows, err := h.cfg.Users.ListOverview(ctx)
	if err != nil {
		return nil, errStorage
	}
	var names []string
	for _, row := range rows {
		name, _ := pydoc.Get(row, "username")
		names = append(names, pyval.Str(name))
	}
	profiles, err := h.cfg.Profiles.DataForUsers(ctx, names, admininsights.SummaryProfileKeys)
	if err != nil {
		return nil, errStorage
	}
	now := h.base.now()
	users := bson.A{}
	for i, row := range rows {
		field := func(key string) any {
			v, _ := pydoc.Get(row, key)
			return v
		}
		ip, country := field("last_client_ip"), field("last_client_country")
		if !pyval.Truthy(country) && h.cfg.NetworkStatus(ip) == "public" {
			if cached := h.cfg.Countries.Cached(ip); cached != "" {
				country = cached
			} else {
				country = nil
				h.cfg.Countries.Schedule(ip)
			}
		}
		status := any("resolved")
		if !pyval.Truthy(country) {
			status = h.cfg.NetworkStatus(ip)
		}
		anchor := pyval.Or(pyval.Or(field("last_activity"), field("last_login")), field("created_at"))
		summary, err := admininsights.SummaryStats(profiles[names[i]])
		if err != nil {
			return nil, err
		}
		user := bson.D{
			{Key: "username", Value: names[i]},
			{Key: "createdAt", Value: field("created_at")},
			{Key: "currentActivity", Value: field("current_activity")},
			{Key: "clientRelease", Value: field("client_release")},
			{Key: "lastClientIp", Value: ip},
			{Key: "lastClientCountry", Value: country},
			{Key: "networkLocationStatus", Value: status},
		}
		user = append(user, admininsights.PresenceSummary(anchor, field("presence_online"), now)...)
		user = append(user, admininsights.ForegroundSummary(row, now)...)
		users = append(users, append(user, summary...))
	}
	return bson.D{{Key: "users", Value: users}}, nil
}

func (h *AdminUsersHandler) matchmaking(ctx context.Context) (bson.D, error) {
	rows, err := h.cfg.Users.ListOverview(ctx)
	if err != nil {
		return nil, errStorage
	}
	var names []string
	for _, row := range rows {
		name, _ := pydoc.Get(row, "username")
		names = append(names, pyval.Str(name))
	}
	profiles, err := h.cfg.Profiles.DataForUsers(ctx, names, []string{matchmakingKey})
	if err != nil {
		return nil, errStorage
	}
	var list []bson.D
	for _, profile := range profiles {
		list = append(list, profile)
	}
	aggregate, err := admininsights.AggregateMatchmaking(list)
	if err != nil {
		return nil, err
	}
	return bson.D{{Key: "matchmaking", Value: aggregate}}, nil
}

func dataOf(profile bson.D) bson.D {
	raw, _ := pydoc.Get(profile, "data")
	data, _ := raw.(bson.D)
	return data
}

// loadsOr is json.loads(value or fallback) with (JSONDecodeError, TypeError) → nil.
func loadsOr(value any, fallback string) any {
	if !pyval.Truthy(value) {
		value = fallback
	}
	s, ok := value.(string)
	if !ok {
		return nil
	}
	decoded, err := admininsights.DecodeJSON(s)
	if err != nil {
		return nil
	}
	return decoded
}

func (h *AdminUsersHandler) userRating(ctx context.Context, rawTarget string, rating int64) (bson.D, error) {
	target, err := h.resolveTarget(ctx, rawTarget)
	if err != nil {
		return nil, err
	}
	for attempt := 0; attempt < 2; attempt++ {
		profile, _, err := h.cfg.Profiles.Get(ctx, target)
		if err != nil {
			return nil, errStorage
		}
		data := dataOf(profile)
		revisionsRaw, _ := pydoc.Get(profile, "revisions")
		revisions, _ := revisionsRaw.(bson.D)
		ratingData, _ := loadsOr(lookupOr(data, ratingKey, nil), "{}").(bson.D)
		games := int64(0)
		gamesRaw, _ := pydoc.Get(ratingData, "games")
		n, ok, err := admininsights.PyInt(pyval.Or(gamesRaw, int64(0)))
		if err != nil {
			return nil, err
		}
		if ok {
			games = max(0, n)
		}
		var previous any
		ratingRaw, _ := pydoc.Get(ratingData, "rating")
		prev, ok, err := admininsights.RoundFloatInt(ratingRaw)
		if err != nil {
			return nil, err
		}
		if ok {
			previous = prev
		}
		audit, isList := loadsOr(lookupOr(data, ratingAuditKey, nil), "[]").(bson.A)
		if !isList {
			audit = bson.A{}
		}
		audit = append(audit, bson.D{
			{Key: "date", Value: pyval.ISOFormatUTC(h.base.now())}, {Key: "source", Value: "admin"},
			{Key: "previousRating", Value: previous}, {Key: "rating", Value: rating},
		})
		if len(audit) > 50 {
			audit = audit[len(audit)-50:]
		}
		ratingJSON, err := asciiJSON(bson.D{{Key: "rating", Value: rating}, {Key: "games", Value: games}})
		if err != nil {
			return nil, err
		}
		auditJSON, err := asciiJSON(audit)
		if err != nil {
			return nil, err
		}
		expected := func(key string) int64 {
			v, _ := pydoc.Get(revisions, key)
			n, _ := pyval.IntOr(v)
			return n
		}
		_, conflict, err := h.cfg.Profiles.Patch(ctx, target,
			bson.D{{Key: ratingKey, Value: ratingJSON}, {Key: ratingAuditKey, Value: auditJSON}},
			bson.D{{Key: ratingKey, Value: expected(ratingKey)}, {Key: ratingAuditKey, Value: expected(ratingAuditKey)}})
		if err != nil {
			return nil, errStorage
		}
		if conflict == nil {
			return bson.D{{Key: "username", Value: target}, {Key: "rating", Value: rating}, {Key: "games", Value: games}, {Key: "previousRating", Value: previous}}, nil
		}
	}
	return nil, fail(409, "El perfil cambió mientras se corregía el ELO. Vuelve a intentarlo.")
}

func (h *AdminUsersHandler) insights(ctx context.Context, raw string) (bson.D, error) {
	target, err := h.resolveTarget(ctx, raw)
	if err != nil {
		return nil, err
	}
	profile, _, err := h.cfg.Profiles.Get(ctx, target)
	if err != nil {
		return nil, errStorage
	}
	payload, err := admininsights.InsightsPayload(profile)
	if err != nil {
		return nil, err
	}
	return append(bson.D{{Key: "username", Value: target}}, payload...), nil
}

func (h *AdminUsersHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, pathTarget, ok := AdminUsersRoute(r)
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
	w.Header().Set("X-Chess-Admin-Native", "go")
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
	if r.Method == http.MethodPost {
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
	if !h.admins.has(username) {
		writeJSON(w, http.StatusForbidden, map[string]any{"detail": "No tienes permisos de administrador."})
		return
	}
	ctx := context.WithoutCancel(r.Context())
	var target string
	var rating int64
	var facts bson.D
	var preset string
	switch pattern {
	case AdminPlayerPortraitPattern:
		var problems bson.A
		if target, facts, problems = portraitBody(body); problems != nil {
			writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: problems}})
			return
		}
	case AdminMatthiasPreviewPattern:
		var problems bson.A
		if preset, problems = previewBody(body); problems != nil {
			writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: problems}})
			return
		}
	}
	if r.Method == http.MethodPost && pattern != AdminPlayerPortraitPattern && pattern != AdminMatthiasPreviewPattern {
		var problems bson.A
		target, rating, problems = usernameBody(body, pattern == AdminUserRatingPattern)
		if problems != nil {
			writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: problems}})
			return
		}
	}
	var payload bson.D
	var err error
	switch pattern {
	case AdminUsersPattern:
		payload, err = h.listUsers(ctx)
	case AdminMatchmakingPattern:
		payload, err = h.matchmaking(ctx)
	case AdminUserRatingPattern:
		payload, err = h.userRating(ctx, target, rating)
	case AdminUserInsightsPattern:
		payload, err = h.insights(ctx, target)
	case AdminUserInsightsGetPattern:
		payload, err = h.insights(ctx, pathTarget)
	case AdminMatthiasMemoryPattern:
		var resolved string
		if resolved, err = h.resolveTarget(ctx, target); err == nil {
			var row bson.D
			if row, err = h.cfg.Matthias.Memory(ctx, resolved); err != nil {
				err = errStorage
			} else {
				var memory bson.D
				if _, memory, err = matthiasmem.MemorySummary(row, b.now()); err == nil {
					// user_summary itself, without the episodic block _memory_summary adds.
					payload = bson.D{{Key: "username", Value: resolved}, {Key: "memory", Value: pydoc.Delete(memory, "episodicMemory")}}
				}
			}
		}
	case AdminMatthiasResetPattern:
		var resolved string
		if resolved, err = h.resolveTarget(ctx, target); err == nil {
			if err = storage(h.cfg.Matthias.DeleteMemory(ctx, resolved)); err == nil {
				payload = bson.D{{Key: "reset", Value: true}, {Key: "username", Value: resolved}}
			}
		}
	case AdminDeleteUserPattern:
		payload, err = h.deleteUser(ctx, username, target)
	case AdminPlayerPortraitPattern:
		payload, err = h.portrait(ctx, target, facts)
	case AdminMatthiasPreviewPattern:
		payload, err = h.preview(ctx, preset)
	}
	var httpErr *httpError
	switch {
	case errors.As(err, &httpErr):
		writeJSON(w, httpErr.status, map[string]any{"detail": httpErr.detail})
	case errors.Is(err, errStorage):
		storageUnavailable(w)
	case err != nil:
		internalError(w)
	default:
		writeDoc(w, http.StatusOK, payload)
	}
}

func (h *AdminUsersHandler) deleteUser(ctx context.Context, admin, raw string) (bson.D, error) {
	target, err := h.resolveTarget(ctx, raw)
	if err != nil {
		return nil, err
	}
	if target == admin {
		return nil, fail(409, "No puedes borrar tu propia cuenta desde el panel de admin.")
	}
	purged, err := h.cfg.Purge(ctx, target)
	if err != nil {
		return nil, errStorage
	}
	deleted, err := h.cfg.Users.Delete(ctx, target)
	if err != nil {
		return nil, errStorage
	}
	if !deleted {
		return nil, fail(404, "Usuario no encontrado.")
	}
	return bson.D{{Key: "deleted", Value: true}, {Key: "username", Value: target}, {Key: "deletedGames", Value: purged.Games}}, nil
}

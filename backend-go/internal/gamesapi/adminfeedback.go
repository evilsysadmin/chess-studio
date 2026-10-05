package gamesapi

// Native Admin feedback management, mirroring admin_api.py (require_admin,
// default 120/minute each):
//
//	GET    /api/admin/feedback
//	GET    /api/admin/feedback/summary
//	GET    /api/admin/feedback/{feedback_id}/attachments/{attachment_index}
//	POST   /api/admin/feedback/{feedback_id}/status
//	POST   /api/admin/feedback/{feedback_id}/reply
//	DELETE /api/admin/feedback/{feedback_id}

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

const (
	AdminFeedbackListPattern       = "GET /api/admin/feedback"
	AdminFeedbackSummaryPattern    = "GET /api/admin/feedback/summary"
	AdminFeedbackAttachmentPattern = "GET /api/admin/feedback/{feedback_id}/attachments/{attachment_index}"
	AdminFeedbackStatusPattern     = "POST /api/admin/feedback/{feedback_id}/status"
	AdminFeedbackReplyPattern      = "POST /api/admin/feedback/{feedback_id}/reply"
	AdminFeedbackDeletePattern     = "DELETE /api/admin/feedback/{feedback_id}"
	adminFeedbackPath              = "/api/admin/feedback"
)

// adminFeedbackRoute is one matched route with its path parameters.
type adminFeedbackRoute struct {
	pattern, id, index string
}

// AdminFeedbackRoute reports whether a request is a native Admin feedback route.
func AdminFeedbackRoute(r *http.Request) (string, bool) {
	route, ok := matchAdminFeedback(r)
	if !ok {
		return "", false
	}
	return route.pattern, true
}

func matchAdminFeedback(r *http.Request) (adminFeedbackRoute, bool) {
	method := r.Method
	if method == http.MethodOptions {
		method = preflightMethod(r)
	}
	path := r.URL.Path
	if path == adminFeedbackPath {
		return adminFeedbackRoute{pattern: AdminFeedbackListPattern}, method == http.MethodGet
	}
	rest, found := strings.CutPrefix(path, adminFeedbackPath+"/")
	if !found || rest == "" {
		return adminFeedbackRoute{}, false
	}
	parts := strings.Split(rest, "/")
	for _, part := range parts {
		if part == "" {
			return adminFeedbackRoute{}, false
		}
	}
	switch {
	case len(parts) == 1 && parts[0] == "summary" && method == http.MethodGet:
		return adminFeedbackRoute{pattern: AdminFeedbackSummaryPattern}, true
	case len(parts) == 1 && method == http.MethodDelete:
		return adminFeedbackRoute{pattern: AdminFeedbackDeletePattern, id: parts[0]}, true
	case len(parts) == 2 && parts[1] == "status" && method == http.MethodPost:
		return adminFeedbackRoute{pattern: AdminFeedbackStatusPattern, id: parts[0]}, true
	case len(parts) == 2 && parts[1] == "reply" && method == http.MethodPost:
		return adminFeedbackRoute{pattern: AdminFeedbackReplyPattern, id: parts[0]}, true
	case len(parts) == 3 && parts[1] == "attachments" && method == http.MethodGet:
		return adminFeedbackRoute{pattern: AdminFeedbackAttachmentPattern, id: parts[0], index: parts[2]}, true
	}
	return adminFeedbackRoute{}, false
}

// AdminFeedbackStore is feedbackstore.Store's Admin side.
type AdminFeedbackStore interface {
	List(ctx context.Context, limit int64) ([]bson.D, error)
	Summary(ctx context.Context) (newCount, pending int64, err error)
	Attachments(ctx context.Context, id string) (bson.A, error)
	Update(ctx context.Context, id string, set bson.D) (bson.D, error)
	Delete(ctx context.Context, id string) (bool, error)
}

type AdminFeedbackConfig struct {
	Config
	Feedback       AdminFeedbackStore
	AdminUsernames []string
}

type AdminFeedbackHandler struct {
	base   *Handler
	store  AdminFeedbackStore
	admins adminSet
	limits map[string]*limiter
}

// adminSet is main.is_admin over ADMIN_USERNAMES ("*" admits everyone).
type adminSet struct {
	names map[string]bool
	all   bool
}

func newAdminSet(raw []string) adminSet {
	set := adminSet{names: map[string]bool{}}
	for _, name := range raw {
		name = strings.ToLower(strings.TrimSpace(name))
		switch name {
		case "":
		case "*":
			set.all = true
		default:
			set.names[name] = true
		}
	}
	return set
}

func (a adminSet) has(username string) bool { return a.all || a.names[strings.ToLower(username)] }

func NewAdminFeedback(cfg AdminFeedbackConfig) (*AdminFeedbackHandler, error) {
	if cfg.Feedback == nil {
		return nil, errors.New("admin feedback API needs a store")
	}
	cfg.Store = readOnlyStore{}
	base, err := New(cfg.Config)
	if err != nil {
		return nil, err
	}
	limits := map[string]*limiter{}
	for _, p := range []string{AdminFeedbackListPattern, AdminFeedbackSummaryPattern, AdminFeedbackAttachmentPattern, AdminFeedbackStatusPattern, AdminFeedbackReplyPattern, AdminFeedbackDeletePattern} {
		limits[p] = newLimiter(120, time.Minute)
	}
	return &AdminFeedbackHandler{base: base, store: cfg.Feedback, admins: newAdminSet(cfg.AdminUsernames), limits: limits}, nil
}

// pydanticBool is pydantic's python-mode bool.
func pydanticBool(value any, loc bson.A) (bool, bson.D) {
	parsing := func() (bool, bson.D) {
		return false, problemDoc("bool_parsing", loc, "Input should be a valid boolean, unable to interpret input", value, nil)
	}
	fromInt := func(n int64) (bool, bson.D) {
		switch n {
		case 0:
			return false, nil
		case 1:
			return true, nil
		}
		return parsing()
	}
	switch v := value.(type) {
	case bool:
		return v, nil
	case int32:
		return fromInt(int64(v))
	case int64:
		return fromInt(v)
	case float64:
		if v == math.Trunc(v) && math.Abs(v) < 1<<63 {
			return fromInt(int64(v))
		}
	case string:
		switch strings.ToLower(v) {
		case "0", "off", "f", "false", "n", "no":
			return false, nil
		case "1", "on", "t", "true", "y", "yes":
			return true, nil
		}
		return parsing()
	}
	return false, problemDoc("bool_type", loc, "Input should be a valid boolean", value, nil)
}

// stringField validates a required str field (no extra="forbid").
func stringField(object bson.D, key string, minLen, maxLen int) (string, bson.D) {
	value, present := pydoc.Get(object, key)
	if !present {
		return "", problemDoc("missing", bson.A{"body", key}, "Field required", object, nil)
	}
	return strField(bson.A{"body", key}, value, minLen, maxLen)
}

func (h *AdminFeedbackHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	route, ok := matchAdminFeedback(r)
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
	if !h.limits[route.pattern].allow(key, b.now()) {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
		return
	}
	var body any
	if route.pattern == AdminFeedbackStatusPattern || route.pattern == AdminFeedbackReplyPattern {
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
	switch route.pattern {
	case AdminFeedbackListPattern:
		h.list(ctx, w)
	case AdminFeedbackSummaryPattern:
		fresh, pending, err := h.store.Summary(ctx)
		if err != nil {
			storageUnavailable(w)
			return
		}
		writeDoc(w, http.StatusOK, bson.D{{Key: "newCount", Value: fresh}, {Key: "pendingCount", Value: pending}})
	case AdminFeedbackAttachmentPattern:
		h.attachment(ctx, w, route)
	case AdminFeedbackDeletePattern:
		deleted, err := h.store.Delete(ctx, route.id)
		switch {
		case err != nil:
			storageUnavailable(w)
		case !deleted:
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Feedback no encontrado."})
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	case AdminFeedbackStatusPattern:
		object, problems := modelObject(body)
		var raw string
		if problems == nil {
			var problem bson.D
			if raw, problem = stringField(object, "status", 0, 16); problem != nil {
				problems = bson.A{problem}
			}
		}
		if problems != nil {
			writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: problems}})
			return
		}
		next := strings.ToLower(strings.TrimSpace(raw))
		if next != "new" && next != "read" && next != "resolved" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "Estado de feedback inválido."})
			return
		}
		h.update(ctx, w, route.id, bson.D{{Key: "status", Value: next}, {Key: "updated_at", Value: presence.PyUTCISOFormat(b.now())}})
	case AdminFeedbackReplyPattern:
		object, problems := modelObject(body)
		var message string
		resolve := true
		if problems == nil {
			if s, problem := stringField(object, "message", 1, 1000); problem != nil {
				problems = append(problems, problem)
			} else {
				message = s
			}
			if raw, present := pydoc.Get(object, "resolve"); present {
				if v, problem := pydanticBool(raw, bson.A{"body", "resolve"}); problem != nil {
					problems = append(problems, problem)
				} else {
					resolve = v
				}
			}
		}
		if problems != nil {
			writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: problems}})
			return
		}
		clean := strings.TrimSpace(message)
		if clean == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "La respuesta no puede estar vacía."})
			return
		}
		if runes := []rune(clean); len(runes) > 1000 {
			clean = string(runes[:1000])
		}
		now := presence.PyUTCISOFormat(b.now())
		set := bson.D{{Key: "admin_reply", Value: clean}, {Key: "replied_at", Value: now}, {Key: "updated_at", Value: now}}
		if resolve {
			set = append(set, bson.E{Key: "status", Value: "resolved"})
		}
		h.update(ctx, w, route.id, set)
	}
}

func (h *AdminFeedbackHandler) list(ctx context.Context, w http.ResponseWriter) {
	rows, err := h.store.List(ctx, 100)
	if err != nil {
		storageUnavailable(w)
		return
	}
	list := bson.A{}
	fresh := int64(0)
	for _, row := range rows {
		public := publicFeedback(row)
		if status, _ := pydoc.Get(public, "status"); status == "new" {
			fresh++
		}
		list = append(list, public)
	}
	writeDoc(w, http.StatusOK, bson.D{{Key: "feedback", Value: list}, {Key: "newCount", Value: fresh}})
}

func (h *AdminFeedbackHandler) update(ctx context.Context, w http.ResponseWriter, id string, set bson.D) {
	row, err := h.store.Update(ctx, id, set)
	switch {
	case err != nil:
		storageUnavailable(w)
	case row == nil:
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Feedback no encontrado."})
	default:
		writeDoc(w, http.StatusOK, bson.D{{Key: "feedback", Value: publicFeedback(row)}})
	}
}

func (h *AdminFeedbackHandler) attachment(ctx context.Context, w http.ResponseWriter, route adminFeedbackRoute) {
	n := queryInt(route.index)
	if n == nil {
		writeDoc(w, http.StatusUnprocessableEntity, bson.D{{Key: "detail", Value: bson.A{
			problemDoc("int_parsing", bson.A{"path", "attachment_index"}, "Input should be a valid integer, unable to parse string as an integer", route.index, nil),
		}}})
		return
	}
	notFound := func() {
		writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Adjunto de feedback no encontrado."})
	}
	if n.Sign() < 0 || !n.IsInt64() {
		notFound()
		return
	}
	attachments, err := h.store.Attachments(ctx, route.id)
	if err != nil {
		storageUnavailable(w)
		return
	}
	index := n.Int64()
	if index >= int64(len(attachments)) {
		notFound()
		return
	}
	item, _ := attachments[index].(bson.D)
	data, _ := mustBytes(item)
	name, _ := pydoc.Get(item, "name")
	if s, isString := name.(string); !isString || s == "" {
		name = fmt.Sprintf("captura-%d", index+1)
	}
	filename := strings.NewReplacer(`"`, "", "\r", "", "\n", "").Replace(fmt.Sprint(name))
	mime, _ := pydoc.Get(item, "mime_type")
	if s, isString := mime.(string); !isString || s == "" {
		mime = "application/octet-stream"
	}
	for _, c := range filename {
		if c > 0xFF {
			internalError(w) // Starlette encodes header values as latin-1
			return
		}
	}
	contentType := fmt.Sprint(mime)
	if strings.HasPrefix(contentType, "text/") && !strings.Contains(strings.ToLower(contentType), "charset") {
		contentType += "; charset=utf-8"
	}
	hdr := w.Header()
	hdr.Set("Content-Type", contentType)
	hdr.Set("Content-Disposition", `inline; filename="`+filename+`"`)
	hdr.Set("Cache-Control", "private, max-age=300")
	hdr.Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

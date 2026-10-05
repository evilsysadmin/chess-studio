package gamesapi

// Native user feedback routes, mirroring admin_api.py and system_api.py:
//
//	POST   /api/feedback        submit_feedback        10/hour, 201
//	GET    /api/feedback/mine   user_list_feedback     (default 120/minute)
//	DELETE /api/feedback/{id}   delete_own_feedback    (default 120/minute)
//
// Screenshots travel inline (base64) and are stored as bytes, validated by
// their magic numbers rather than the declared type.

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

const (
	FeedbackPattern       = "/api/feedback"
	FeedbackMinePattern   = "/api/feedback/mine"
	FeedbackDeletePattern = "/api/feedback/{feedback_id}"
	// feedbackBodyLimit mirrors FEEDBACK_REQUEST_BODY_BYTES.
	feedbackBodyLimit = 9 * 1024 * 1024

	maxAttachments          = 3
	maxAttachmentBytes      = 3 * 1024 * 1024
	maxAttachmentTotalBytes = 6 * 1024 * 1024
)

// FeedbackRoute reports whether a request is a native feedback route.
func FeedbackRoute(r *http.Request) (pattern, id string, ok bool) {
	method := r.Method
	if method == http.MethodOptions {
		method = preflightMethod(r)
	}
	switch {
	case r.URL.Path == FeedbackPattern && method == http.MethodPost:
		return FeedbackPattern, "", true
	case r.URL.Path == FeedbackMinePattern && method == http.MethodGet:
		return FeedbackMinePattern, "", true
	case method == http.MethodDelete && strings.HasPrefix(r.URL.Path, FeedbackPattern+"/"):
		id := strings.TrimPrefix(r.URL.Path, FeedbackPattern+"/")
		if id != "" && !strings.Contains(id, "/") {
			return FeedbackDeletePattern, id, true
		}
	}
	return "", "", false
}

// FeedbackStore is feedbackstore.Store.
type FeedbackStore interface {
	Insert(ctx context.Context, doc bson.D) error
	ListForUser(ctx context.Context, username string, limit int64) ([]bson.D, error)
	DeleteForUser(ctx context.Context, id, username string) (bool, error)
}

type FeedbackConfig struct {
	Config
	Feedback FeedbackStore
}

type FeedbackHandler struct {
	base          *Handler
	store         FeedbackStore
	submitLimit   *limiter
	defaultLimits map[string]*limiter
}

func NewFeedback(cfg FeedbackConfig) (*FeedbackHandler, error) {
	if cfg.Feedback == nil {
		return nil, errors.New("feedback API needs a store")
	}
	baseCfg := cfg.Config
	baseCfg.Store = readOnlyStore{}
	base, err := New(baseCfg)
	if err != nil {
		return nil, err
	}
	return &FeedbackHandler{
		base: base, store: cfg.Feedback, submitLimit: newLimiter(10, time.Hour),
		defaultLimits: map[string]*limiter{
			FeedbackMinePattern:   newLimiter(120, time.Minute),
			FeedbackDeletePattern: newLimiter(120, time.Minute),
		},
	}, nil
}

func (h *FeedbackHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	pattern, id, ok := FeedbackRoute(r)
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
	w.Header().Set("X-Chess-Feedback-Native", "go")

	subject, version, tokenErr := b.verify(r)
	if limit := h.defaultLimits[pattern]; limit != nil {
		key := "user:" + subject
		if tokenErr != nil {
			key = "ip:" + b.clientIP(r)
		}
		if !limit.allow(key, b.now()) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 120 per 1 minute"})
			return
		}
	}

	var body any
	if pattern == FeedbackPattern {
		if r.ContentLength > feedbackBodyLimit {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
			return
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, feedbackBodyLimit+1))
		if err != nil || len(raw) > feedbackBodyLimit {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
			return
		}
		decoded, ok := decodeModelBody(w, r, raw)
		if !ok {
			return
		}
		body = decoded
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
	case FeedbackMinePattern:
		h.listMine(ctx, w, username)
	case FeedbackDeletePattern:
		deleted, err := h.store.DeleteForUser(ctx, id, username)
		if err != nil {
			storageUnavailable(w)
			return
		}
		if !deleted {
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "Feedback no encontrado."})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		req, problems := parseFeedback(body)
		if problems != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"detail": problems})
			return
		}
		if !h.submitLimit.allow("user:"+username, b.now()) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "Rate limit exceeded: 10 per 1 hour"})
			return
		}
		h.submit(ctx, w, username, req)
	}
}

type feedbackAttachment struct {
	Name, MimeType, Data string
}

type feedbackRequest struct {
	Category    string
	Message     string
	Context     *string
	Attachments []feedbackAttachment
}

// parseFeedback mirrors FeedbackRequest / FeedbackAttachmentRequest.
func parseFeedback(body any) (feedbackRequest, []map[string]any) {
	req := feedbackRequest{Category: "general"}
	home := "Home"
	req.Context = &home
	if body == nil {
		return req, []map[string]any{{"type": "missing", "loc": []any{"body"}, "msg": "Field required"}}
	}
	object, ok := body.(map[string]any)
	if !ok {
		return req, []map[string]any{{"type": "model_attributes_type", "loc": []any{"body"}, "msg": "Input should be a valid dictionary or object to extract fields from"}}
	}
	var detail []map[string]any
	str := func(loc []any, value any, limit int) (string, bool) {
		s, isString := value.(string)
		if !isString {
			detail = append(detail, map[string]any{"type": "string_type", "loc": loc, "msg": "Input should be a valid string"})
			return "", false
		}
		if utf8.RuneCountInString(s) > limit {
			detail = append(detail, map[string]any{"type": "string_too_long", "loc": loc, "msg": "String should have at most " + characters(limit)})
			return "", false
		}
		return s, true
	}
	if raw, present := object["category"]; present {
		if s, ok := str([]any{"body", "category"}, raw, 24); ok {
			req.Category = s
		}
	}
	if raw, present := object["message"]; !present {
		detail = append(detail, map[string]any{"type": "missing", "loc": []any{"body", "message"}, "msg": "Field required"})
	} else if s, ok := str([]any{"body", "message"}, raw, 2000); ok {
		req.Message = s
	}
	if raw, present := object["context"]; present {
		if raw == nil {
			req.Context = nil
		} else if s, ok := str([]any{"body", "context"}, raw, 80); ok {
			req.Context = &s
		}
	}
	if raw, present := object["attachments"]; present {
		items, isList := raw.([]any)
		if !isList {
			detail = append(detail, map[string]any{"type": "list_type", "loc": []any{"body", "attachments"}, "msg": "Input should be a valid list"})
		} else if len(items) > maxAttachments {
			// pydantic stops at the length bound: no per-item errors.
			detail = append(detail, map[string]any{"type": "too_long", "loc": []any{"body", "attachments"}, "msg": fmt.Sprintf("List should have at most %d items after validation, not %d", maxAttachments, len(items))})
		} else {
			for i, item := range items {
				loc := func(key string) []any { return []any{"body", "attachments", i, key} }
				fields, isObject := item.(map[string]any)
				if !isObject {
					detail = append(detail, map[string]any{"type": "model_attributes_type", "loc": []any{"body", "attachments", i}, "msg": "Input should be a valid dictionary or object to extract fields from"})
					continue
				}
				var att feedbackAttachment
				for _, f := range []struct {
					alias, name string
					limit       int
					dst         *string
				}{{"name", "", 120, &att.Name}, {"mimeType", "mime_type", 32, &att.MimeType}, {"data", "", 4_300_000, &att.Data}} {
					key, value, present := f.alias, fields[f.alias], false
					_, present = fields[f.alias]
					if !present && f.name != "" {
						value, present = fields[f.name]
						key = f.name
					}
					if !present {
						detail = append(detail, map[string]any{"type": "missing", "loc": loc(f.alias), "msg": "Field required"})
						continue
					}
					if s, ok := str(loc(key), value, f.limit); ok {
						*f.dst = s
					}
				}
				req.Attachments = append(req.Attachments, att)
			}
		}
	}
	return req, detail
}

var strictBase64 = regexp.MustCompile(`^[A-Za-z0-9+/]*={0,2}$`)

// detectedMime mirrors _detected_mime.
func detectedMime(data []byte) string {
	switch {
	case bytes.HasPrefix(data, []byte("\x89PNG\r\n\x1a\n")):
		return "image/png"
	case bytes.HasPrefix(data, []byte("\xff\xd8\xff")):
		return "image/jpeg"
	case bytes.HasPrefix(data, []byte("GIF87a")), bytes.HasPrefix(data, []byte("GIF89a")):
		return "image/gif"
	}
	return ""
}

// safeAttachmentName mirrors _safe_name: the last path component, only
// letters, digits and ._- ()[], at most 120 characters.
func safeAttachmentName(raw string, index int, mime string) string {
	ext := map[string]string{"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif"}[mime]
	fallback := fmt.Sprintf("captura-%d%s", index+1, ext)
	name := ""
	for _, part := range strings.Split(strings.ReplaceAll(raw, `\`, "/"), "/") {
		if part != "" && part != "." {
			name = part
		}
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return fallback
	}
	var clean strings.Builder
	for _, c := range name {
		if unicode.IsLetter(c) || unicode.IsNumber(c) || strings.ContainsRune("._- ()[]", c) {
			clean.WriteRune(c)
		}
	}
	cleaned := strings.Trim(clean.String(), " .")
	if runes := []rune(cleaned); len(runes) > 120 {
		cleaned = string(runes[:120])
	}
	if cleaned == "" {
		return fallback
	}
	return cleaned
}

type validAttachment struct {
	name, mime string
	data       []byte
}

// validateAttachments mirrors validate_feedback_attachments.
func validateAttachments(items []feedbackAttachment) ([]validAttachment, string) {
	if len(items) > maxAttachments {
		return nil, fmt.Sprintf("Puedes adjuntar como máximo %d imágenes.", maxAttachments)
	}
	total := 0
	var out []validAttachment
	for i, item := range items {
		declared := strings.ToLower(strings.TrimSpace(item.MimeType))
		if declared == "image/jpg" {
			declared = "image/jpeg"
		}
		if declared != "image/png" && declared != "image/jpeg" && declared != "image/gif" {
			return nil, "Sólo se admiten imágenes PNG, JPG/JPEG o GIF."
		}
		encoded := strings.TrimSpace(item.Data)
		if !strictBase64.MatchString(encoded) || len(encoded)%4 != 0 {
			return nil, "Una de las imágenes adjuntas no es válida."
		}
		raw, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return nil, "Una de las imágenes adjuntas no es válida."
		}
		if len(raw) == 0 {
			return nil, "Una de las imágenes adjuntas está vacía."
		}
		if len(raw) > maxAttachmentBytes {
			return nil, "Cada imagen de feedback puede ocupar como máximo 3 MiB."
		}
		total += len(raw)
		if total > maxAttachmentTotalBytes {
			return nil, "Los adjuntos de feedback no pueden superar 6 MiB en total."
		}
		detected := detectedMime(raw)
		if detected != declared {
			return nil, "El formato real de una imagen no coincide con PNG, JPG/JPEG o GIF."
		}
		out = append(out, validAttachment{name: safeAttachmentName(item.Name, i, detected), mime: detected, data: raw})
	}
	return out, ""
}

var feedbackCategories = map[string]bool{"general": true, "bug": true, "idea": true, "ux": true, "other": true}

// submit mirrors submit_feedback + feedback_store.create_feedback.
func (h *FeedbackHandler) submit(ctx context.Context, w http.ResponseWriter, username string, req feedbackRequest) {
	category := strings.ToLower(strings.TrimSpace(req.Category))
	if !feedbackCategories[category] {
		badRequest(w, "Categoría de feedback inválida.")
		return
	}
	message := strings.TrimSpace(req.Message)
	if utf8.RuneCountInString(message) < 3 {
		badRequest(w, "Cuéntanos un poco más para poder usar el feedback.")
		return
	}
	feedbackContext := "Home"
	if req.Context != nil {
		if trimmed := strings.TrimSpace(*req.Context); trimmed != "" {
			feedbackContext = trimmed
		}
	}
	attachments, problem := validateAttachments(req.Attachments)
	if problem != "" {
		badRequest(w, problem)
		return
	}
	idBytes := make([]byte, 16)
	if _, err := rand.Read(idBytes); err != nil {
		internalError(w)
		return
	}
	idBytes[6] = idBytes[6]&0x0f | 0x40 // uuid4().hex
	idBytes[8] = idBytes[8]&0x3f | 0x80
	id := hex.EncodeToString(idBytes)
	now := presence.PyUTCISOFormat(h.base.now())
	stored := bson.A{}
	public := bson.A{}
	for i, att := range attachments {
		stored = append(stored, bson.D{{Key: "name", Value: att.name}, {Key: "mime_type", Value: att.mime}, {Key: "size", Value: pydoc.Int(int64(len(att.data)))}, {Key: "data", Value: att.data}})
		public = append(public, bson.D{{Key: "index", Value: pydoc.Int(int64(i))}, {Key: "name", Value: att.name}, {Key: "mime_type", Value: att.mime}, {Key: "size", Value: pydoc.Int(int64(len(att.data)))}})
	}
	rest := func(attachments bson.A) bson.D {
		return bson.D{
			{Key: "username", Value: username}, {Key: "category", Value: category}, {Key: "message", Value: message},
			{Key: "context", Value: feedbackContext}, {Key: "attachments", Value: attachments}, {Key: "status", Value: "new"},
			{Key: "admin_reply", Value: nil}, {Key: "replied_at", Value: nil}, {Key: "created_at", Value: now}, {Key: "updated_at", Value: now},
		}
	}
	if err := h.store.Insert(ctx, append(bson.D{{Key: "_id", Value: id}}, rest(stored)...)); err != nil {
		storageUnavailable(w)
		return
	}
	writeDoc(w, http.StatusCreated, bson.D{{Key: "feedback", Value: append(bson.D{{Key: "id", Value: id}}, rest(public)...)}})
}

// publicFeedback mirrors _public_feedback for a stored row.
func publicFeedback(row bson.D) bson.D {
	out := bson.D{}
	var id any
	for _, e := range row {
		if e.Key == "_id" {
			id = e.Value
			continue
		}
		out = append(out, e)
	}
	out = append(bson.D{{Key: "id", Value: fmt.Sprint(id)}}, out...)
	attachments := bson.A{}
	raw, _ := pydoc.Get(out, "attachments")
	items, _ := raw.(bson.A)
	for i, item := range items {
		doc, _ := item.(bson.D)
		name, _ := pydoc.Get(doc, "name")
		if s, ok := name.(string); !ok || s == "" {
			name = fmt.Sprintf("captura-%d", i+1)
		}
		mime, _ := pydoc.Get(doc, "mime_type")
		if s, ok := mime.(string); !ok || s == "" {
			mime = "application/octet-stream"
		}
		size := int64(0)
		if rawSize, _ := pydoc.Get(doc, "size"); rawSize != nil {
			switch v := rawSize.(type) {
			case int32:
				size = int64(v)
			case int64:
				size = v
			case float64:
				size = int64(v)
			}
		}
		if size == 0 {
			if data, ok := mustBytes(doc); ok {
				size = int64(len(data))
			}
		}
		attachments = append(attachments, bson.D{{Key: "index", Value: pydoc.Int(int64(i))}, {Key: "name", Value: name}, {Key: "mime_type", Value: mime}, {Key: "size", Value: pydoc.Int(size)}})
	}
	return pydoc.Set(out, "attachments", attachments)
}

func mustBytes(doc bson.D) ([]byte, bool) {
	raw, _ := pydoc.Get(doc, "data")
	switch v := raw.(type) {
	case bson.Binary:
		return v.Data, true
	case []byte:
		return v, true
	}
	return nil, false
}

func (h *FeedbackHandler) listMine(ctx context.Context, w http.ResponseWriter, username string) {
	rows, err := h.store.ListForUser(ctx, username, 20)
	if err != nil {
		storageUnavailable(w)
		return
	}
	list := bson.A{}
	for _, row := range rows {
		list = append(list, publicFeedback(row))
	}
	writeDoc(w, http.StatusOK, bson.D{{Key: "feedback", Value: list}})
}

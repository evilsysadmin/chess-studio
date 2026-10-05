package gamesapi

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

type fakeFeedbackStore struct {
	rows []bson.D
	err  error
}

func (f *fakeFeedbackStore) Insert(_ context.Context, doc bson.D) error {
	if f.err != nil {
		return f.err
	}
	f.rows = append(f.rows, doc)
	return nil
}

func (f *fakeFeedbackStore) ListForUser(_ context.Context, username string, limit int64) ([]bson.D, error) {
	if f.err != nil {
		return nil, f.err
	}
	var out []bson.D
	for i := len(f.rows) - 1; i >= 0 && int64(len(out)) < limit; i-- {
		if u, _ := pydoc.Get(f.rows[i], "username"); u == username {
			out = append(out, f.rows[i])
		}
	}
	return out, nil
}

func (f *fakeFeedbackStore) DeleteForUser(_ context.Context, id, username string) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	for i, row := range f.rows {
		rid, _ := pydoc.Get(row, "_id")
		u, _ := pydoc.Get(row, "username")
		if rid == id && u == username {
			f.rows = append(f.rows[:i], f.rows[i+1:]...)
			return true, nil
		}
	}
	return false, nil
}

func newFeedbackFixture(t *testing.T) (*FeedbackHandler, *fakeFeedbackStore) {
	t.Helper()
	store := &fakeFeedbackStore{}
	h, err := NewFeedback(FeedbackConfig{
		Config:   Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Feedback: store,
	})
	if err != nil {
		t.Fatal(err)
	}
	return h, store
}

func feedbackDo(t *testing.T, h http.Handler, method, path, body, user string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", jsonCT)
	r.RemoteAddr = "198.51.100.7:1234"
	if user != "" {
		r.Header.Set("Authorization", "Bearer "+token(t, user, 0))
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

var tinyPNG = base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\nrest"))

func TestFeedbackRouteMatchesOnlyTheThreeRoutes(t *testing.T) {
	cases := []struct {
		method, path, pattern, id string
	}{
		{http.MethodPost, "/api/feedback", FeedbackPattern, ""},
		{http.MethodGet, "/api/feedback/mine", FeedbackMinePattern, ""},
		{http.MethodDelete, "/api/feedback/abc", FeedbackDeletePattern, "abc"},
		{http.MethodGet, "/api/feedback", "", ""},
		{http.MethodDelete, "/api/feedback/a/b", "", ""},
		{http.MethodPost, "/api/feedback/mine", "", ""},
	}
	for _, c := range cases {
		pattern, id, ok := FeedbackRoute(httptest.NewRequest(c.method, c.path, nil))
		if pattern != c.pattern || id != c.id || ok != (c.pattern != "") {
			t.Errorf("%s %s: got %q %q %v", c.method, c.path, pattern, id, ok)
		}
	}
}

func TestFeedbackSubmitStoresBytesAndAnswersPythonShape(t *testing.T) {
	h, store := newFeedbackFixture(t)
	body := `{"category":" BUG ","message":"  se cuelga  ","context":"  ","attachments":[{"name":"C:\\fotos\\pan talla!.png","mimeType":"image/png","data":"` + tinyPNG + `"}]}`
	w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, body, "alice")
	if w.Code != http.StatusCreated || w.Header().Get("X-Chess-Feedback-Native") != "go" {
		t.Fatalf("submit: %d %s", w.Code, w.Body)
	}
	got := w.Body.String()
	for _, want := range []string{
		`"feedback":{"id":"`,
		`"username":"alice","category":"bug","message":"se cuelga","context":"Home","attachments":[{"index":0,"name":"pan talla.png","mime_type":"image/png","size":12}],"status":"new","admin_reply":null,"replied_at":null,"created_at":"`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %s in %s", want, got)
		}
	}
	if strings.Contains(got, `"data"`) {
		t.Fatalf("response leaks bytes: %s", got)
	}
	if len(store.rows) != 1 {
		t.Fatalf("stored %d rows", len(store.rows))
	}
	id, _ := pydoc.Get(store.rows[0], "_id")
	if s, _ := id.(string); len(s) != 32 || s[12] != '4' {
		t.Fatalf("id is not uuid4().hex: %v", id)
	}
	atts, _ := pydoc.Get(store.rows[0], "attachments")
	data, _ := pydoc.Get(atts.(bson.A)[0].(bson.D), "data")
	if string(data.([]byte)) != "\x89PNG\r\n\x1a\nrest" {
		t.Fatalf("stored data %q", data)
	}
}

func TestFeedbackSubmitValidation(t *testing.T) {
	gif := base64.StdEncoding.EncodeToString([]byte("GIF89a..."))
	cases := []struct {
		name, body string
		status     int
		want       string
	}{
		{"missing message", `{}`, 422, `"loc":["body","message"]`},
		{"too many attachments", `{"message":"hola","attachments":[1,2,3,4]}`, 422, `"msg":"List should have at most 3 items after validation, not 4"`},
		{"attachment alias", `{"message":"hola","attachments":[{"name":"a","mime_type":5,"data":"x"}]}`, 422, `"loc":["body","attachments",0,"mime_type"]`},
		{"attachment missing", `{"message":"hola","attachments":[{"name":"a","data":"x"}]}`, 422, `"loc":["body","attachments",0,"mimeType"]`},
		{"category length", `{"message":"hola","category":"` + strings.Repeat("x", 25) + `"}`, 422, `"msg":"String should have at most 24 characters"`},
		{"bad category", `{"message":"hola","category":"spam"}`, 400, `Categoría de feedback inválida.`},
		{"short message", `{"message":"  ok "}`, 400, `Cuéntanos un poco más`},
		{"bad mime", `{"message":"hola","attachments":[{"name":"a","mimeType":"image/webp","data":"` + tinyPNG + `"}]}`, 400, `Sólo se admiten imágenes PNG, JPG/JPEG o GIF.`},
		{"bad base64", `{"message":"hola","attachments":[{"name":"a","mimeType":"image/png","data":"abc"}]}`, 400, `no es válida`},
		{"empty image", `{"message":"hola","attachments":[{"name":"a","mimeType":"image/png","data":""}]}`, 400, `está vacía`},
		{"mime mismatch", `{"message":"hola","attachments":[{"name":"a","mimeType":"image/png","data":"` + gif + `"}]}`, 400, `no coincide`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h, store := newFeedbackFixture(t)
			w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, c.body, "alice")
			if w.Code != c.status || !strings.Contains(w.Body.String(), c.want) {
				t.Fatalf("%d %s", w.Code, w.Body)
			}
			if len(store.rows) != 0 {
				t.Fatal("invalid feedback was stored")
			}
		})
	}
}

func TestFeedbackJPGAliasAndGIFAreAccepted(t *testing.T) {
	h, _ := newFeedbackFixture(t)
	jpeg := base64.StdEncoding.EncodeToString([]byte("\xff\xd8\xff\xe0"))
	gif := base64.StdEncoding.EncodeToString([]byte("GIF87a"))
	body := `{"message":"hola","attachments":[{"name":"","mimeType":"IMAGE/JPG","data":"` + jpeg + `"},{"name":"../..","mimeType":"image/gif","data":" ` + gif + ` "}]}`
	w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, body, "alice")
	if w.Code != http.StatusCreated {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if !strings.Contains(w.Body.String(), `"name":"captura-1.jpg","mime_type":"image/jpeg"`) || !strings.Contains(w.Body.String(), `"name":"captura-2.gif"`) {
		t.Fatalf("names: %s", w.Body)
	}
}

func TestFeedbackSizeLimits(t *testing.T) {
	big := make([]byte, maxAttachmentBytes+1)
	copy(big, "\x89PNG\r\n\x1a\n")
	if _, problem := validateAttachments([]feedbackAttachment{{MimeType: "image/png", Data: base64.StdEncoding.EncodeToString(big)}}); problem != "Cada imagen de feedback puede ocupar como máximo 3 MiB." {
		t.Fatalf("per-image limit: %q", problem)
	}
	ok := base64.StdEncoding.EncodeToString(big[:maxAttachmentBytes])
	items := []feedbackAttachment{{MimeType: "image/png", Data: ok}, {MimeType: "image/png", Data: ok}, {MimeType: "image/png", Data: tinyPNG}}
	if _, problem := validateAttachments(items); problem != "Los adjuntos de feedback no pueden superar 6 MiB en total." {
		t.Fatalf("total limit: %q", problem)
	}
}

func TestFeedbackSafeNameMatchesPython(t *testing.T) {
	cases := map[string]string{
		"captura.png":                  "captura.png",
		"/tmp/x/../a b(1)[2].png":      "a b(1)[2].png",
		` ..hidden!.png. `:             "hidden.png",
		"ñandú#.gif":                   "ñandú.gif",
		"   ":                          "captura-1.png",
		"$$$":                          "captura-1.png",
		strings.Repeat("a", 130) + ".": strings.Repeat("a", 120),
	}
	for raw, want := range cases {
		if got := safeAttachmentName(raw, 0, "image/png"); got != want {
			t.Errorf("%q: got %q want %q", raw, got, want)
		}
	}
}

func TestFeedbackSubmitLimitIsTenPerHourAfterValidation(t *testing.T) {
	h, _ := newFeedbackFixture(t)
	for i := 0; i < 3; i++ {
		if w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, `{}`, "alice"); w.Code != 422 {
			t.Fatalf("invalid bodies are not limited: %d", w.Code)
		}
	}
	for i := 0; i < 10; i++ {
		if w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, `{"message":"hola"}`, "alice"); w.Code != 201 {
			t.Fatalf("submit %d: %d", i, w.Code)
		}
	}
	w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, `{"message":"hola"}`, "alice")
	if w.Code != 429 || !strings.Contains(w.Body.String(), "10 per 1 hour") {
		t.Fatalf("11th: %d %s", w.Code, w.Body)
	}
	if w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, `{"message":"hola"}`, "bob"); w.Code != 201 {
		t.Fatalf("limit is per user: %d", w.Code)
	}
}

func TestFeedbackNeedsAuthAfterBodyParsing(t *testing.T) {
	h, _ := newFeedbackFixture(t)
	if w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, `{bad`, ""); w.Code != 422 {
		t.Fatalf("malformed json before auth: %d", w.Code)
	}
	if w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, `{"message":"hola"}`, ""); w.Code != 401 {
		t.Fatalf("anonymous submit: %d", w.Code)
	}
	w := feedbackDo(t, h, http.MethodGet, FeedbackMinePattern, "", "")
	if w.Code != 401 || w.Header().Get("X-Chess-Feedback-Native") != "go" {
		t.Fatalf("anonymous mine: %d", w.Code)
	}
}

func TestFeedbackMineListsOwnRowsWithoutBytes(t *testing.T) {
	h, store := newFeedbackFixture(t)
	store.rows = []bson.D{
		{{Key: "_id", Value: "old"}, {Key: "username", Value: "alice"}, {Key: "message", Value: "uno"}, {Key: "attachments", Value: bson.A{
			bson.D{{Key: "name", Value: ""}, {Key: "size", Value: int32(7)}},
		}}},
		{{Key: "_id", Value: "other"}, {Key: "username", Value: "bob"}, {Key: "message", Value: "ajeno"}},
		{{Key: "_id", Value: "new"}, {Key: "username", Value: "alice"}, {Key: "message", Value: "dos"}},
	}
	w := feedbackDo(t, h, http.MethodGet, FeedbackMinePattern, "", "alice")
	want := `{"feedback":[{"id":"new","username":"alice","message":"dos","attachments":[]},{"id":"old","username":"alice","message":"uno","attachments":[{"index":0,"name":"captura-1","mime_type":"application/octet-stream","size":7}]}]}`
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != want {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestFeedbackDeleteOnlyOwnRows(t *testing.T) {
	h, store := newFeedbackFixture(t)
	store.rows = []bson.D{{{Key: "_id", Value: "x1"}, {Key: "username", Value: "bob"}}}
	if w := feedbackDo(t, h, http.MethodDelete, "/api/feedback/x1", "", "alice"); w.Code != 404 || !strings.Contains(w.Body.String(), "Feedback no encontrado.") {
		t.Fatalf("foreign delete: %d %s", w.Code, w.Body)
	}
	if w := feedbackDo(t, h, http.MethodDelete, "/api/feedback/x1", "", "bob"); w.Code != 204 || w.Body.Len() != 0 {
		t.Fatalf("own delete: %d %s", w.Code, w.Body)
	}
	if len(store.rows) != 0 {
		t.Fatal("row survived")
	}
}

func TestFeedbackStorageOutageIs503(t *testing.T) {
	h, store := newFeedbackFixture(t)
	store.err = errors.New("down")
	for _, c := range []struct{ method, path, body string }{
		{http.MethodPost, FeedbackPattern, `{"message":"hola"}`},
		{http.MethodGet, FeedbackMinePattern, ""},
		{http.MethodDelete, "/api/feedback/x", ""},
	} {
		if w := feedbackDo(t, h, c.method, c.path, c.body, "alice"); w.Code != 503 {
			t.Fatalf("%s %s: %d %s", c.method, c.path, w.Code, w.Body)
		}
	}
}

func TestFeedbackBodyLimitIsNineMiB(t *testing.T) {
	h, _ := newFeedbackFixture(t)
	big := `{"message":"` + strings.Repeat("a", feedbackBodyLimit) + `"}`
	if w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, big, "alice"); w.Code != 413 {
		t.Fatalf("oversized: %d", w.Code)
	}
	// 2 MiB is above the default 1 MiB but within the feedback route budget.
	mid := `{"message":"` + strings.Repeat("a", 2<<20) + `"}`
	if w := feedbackDo(t, h, http.MethodPost, FeedbackPattern, mid, "alice"); w.Code != 422 {
		t.Fatalf("2 MiB body must reach validation: %d", w.Code)
	}
}

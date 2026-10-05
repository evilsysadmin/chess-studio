package gamesapi

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/feedbackstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

type adminFeedbackCorpus struct {
	Seeds []json.RawMessage `json:"seeds"`
	Steps []struct {
		Label   string            `json:"label"`
		Method  string            `json:"method"`
		Path    string            `json:"path"`
		User    string            `json:"user"`
		Body    *string           `json:"body"`
		Now     string            `json:"now"`
		Status  int               `json:"status"`
		Headers map[string]string `json:"headers"`
		Resp    *string           `json:"response"`
		Binary  bool              `json:"binary"`
		SHA256  string            `json:"sha256"`
		Length  int               `json:"length"`
	} `json:"steps"`
}

// seedFeedback turns a corpus seed (the Python memory row) into the stored
// Mongo shape: _id first, attachment bytes decoded.
func seedFeedback(t *testing.T, raw json.RawMessage) bson.D {
	t.Helper()
	decoded, err := pydoc.Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	row := decoded.(bson.D)
	id, _ := pydoc.Get(row, "id")
	out := bson.D{{Key: "_id", Value: id}}
	for _, e := range pydoc.Delete(row, "id") {
		if e.Key == "attachments" {
			list := bson.A{}
			for _, item := range e.Value.(bson.A) {
				doc := item.(bson.D)
				encoded, _ := pydoc.Get(doc, "data")
				data, err := base64.StdEncoding.DecodeString(encoded.(string))
				if err != nil {
					t.Fatal(err)
				}
				list = append(list, pydoc.Set(append(bson.D(nil), doc...), "data", data))
			}
			e.Value = list
		}
		out = append(out, e)
	}
	return out
}

func replayAdminFeedbackCorpus(t *testing.T, store interface {
	AdminFeedbackStore
	Insert(context.Context, bson.D) error
}) int {
	t.Helper()
	data, err := os.ReadFile("testdata/python_admin_feedback_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus adminFeedbackCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	for _, seed := range corpus.Seeds {
		if err := store.Insert(context.Background(), seedFeedback(t, seed)); err != nil {
			t.Fatal(err)
		}
	}
	var now time.Time
	h, err := NewAdminFeedback(AdminFeedbackConfig{
		Config:         Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return now }},
		Feedback:       store,
		AdminUsernames: []string{" Root "},
	})
	if err != nil {
		t.Fatal(err)
	}
	for i, step := range corpus.Steps {
		if now, err = time.Parse(time.RFC3339Nano, step.Now); err != nil {
			t.Fatal(err)
		}
		body := ""
		if step.Body != nil {
			body = *step.Body
		}
		r := httptest.NewRequest(step.Method, strings.ReplaceAll(step.Path, " ", "%20"), strings.NewReader(body))
		r.RemoteAddr = "198.51.100.7:1234"
		r.Header.Set("Authorization", "Bearer "+longToken(step.User))
		if step.Body != nil {
			r.Header.Set("Content-Type", jsonCT)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		got := w.Body.Bytes()
		if !step.Binary {
			got = bytes.TrimSuffix(got, []byte("\n"))
		}
		ok := w.Code == step.Status
		switch {
		case step.Resp != nil && strings.Contains(*step.Resp, `"type":"json_invalid"`):
			ok = ok && bytes.Contains(got, []byte(`"type":"json_invalid"`)) // Python's decoder position is not reproduced
		case step.Resp != nil && step.Binary:
			want, _ := base64.StdEncoding.DecodeString(*step.Resp)
			ok = ok && bytes.Equal(got, want)
		case step.Resp != nil:
			ok = ok && string(got) == *step.Resp
		default:
			sum := sha256.Sum256(got)
			ok = ok && hex.EncodeToString(sum[:]) == step.SHA256 && len(got) == step.Length
		}
		for _, name := range []string{"content-disposition", "cache-control"} {
			ok = ok && w.Header().Get(name) == step.Headers[name]
		}
		if want := step.Headers["content-type"]; want != "" {
			ok = ok && w.Header().Get("Content-Type") == want
		}
		if !ok {
			t.Errorf("step %d %s (%s %s):\ngot  %d %v %s\nwant %d %v %v", i, step.Label, step.Method, step.Path, w.Code, w.Header(), got, step.Status, step.Headers, func() string {
				if step.Resp != nil {
					return *step.Resp
				}
				return step.SHA256
			}())
		}
	}
	return len(corpus.Steps)
}

func TestAdminFeedbackMatchesPythonCorpus(t *testing.T) {
	if n := replayAdminFeedbackCorpus(t, feedbackstore.NewMemory()); n < 40 {
		t.Fatalf("corpus too small: %d", n)
	}
}

func TestAdminFeedbackRoute(t *testing.T) {
	for _, c := range []struct{ method, path, pattern string }{
		{"GET", "/api/admin/feedback", AdminFeedbackListPattern},
		{"GET", "/api/admin/feedback/summary", AdminFeedbackSummaryPattern},
		{"GET", "/api/admin/feedback/f1/attachments/0", AdminFeedbackAttachmentPattern},
		{"POST", "/api/admin/feedback/f1/status", AdminFeedbackStatusPattern},
		{"POST", "/api/admin/feedback/f1/reply", AdminFeedbackReplyPattern},
		{"DELETE", "/api/admin/feedback/f1", AdminFeedbackDeletePattern},
		{"DELETE", "/api/admin/feedback/summary", AdminFeedbackDeletePattern},
		{"POST", "/api/admin/feedback", ""},
		{"GET", "/api/admin/feedback/f1", ""},
		{"GET", "/api/admin/feedback/f1/attachments", ""},
		{"GET", "/api/admin/feedback//attachments/0", ""},
		{"POST", "/api/admin/feedback/f1/other", ""},
		{"GET", "/api/admin/users", ""},
	} {
		pattern, ok := AdminFeedbackRoute(httptest.NewRequest(c.method, c.path, nil))
		if ok != (c.pattern != "") || pattern != c.pattern {
			t.Errorf("%s %s: %q %v", c.method, c.path, pattern, ok)
		}
	}
}

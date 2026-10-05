package gamesapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/profilestore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// profileMem is a minimal profilestore.Collection (CAS on write_revision).
type profileMem struct {
	docs map[string]bson.D
	fail bool
}

func (m *profileMem) FindOne(_ context.Context, u string) (bson.D, bool, error) {
	if m.fail {
		return nil, false, errors.New("down")
	}
	d, ok := m.docs[u]
	return pydoc.Copy(d), ok, nil
}
func (m *profileMem) ReplaceUpsert(_ context.Context, u string, d bson.D) error {
	m.docs[u] = d
	return nil
}
func (m *profileMem) Insert(_ context.Context, d bson.D) (bool, error) {
	id, _ := pydoc.Get(d, "_id")
	if _, ok := m.docs[id.(string)]; ok {
		return true, nil
	}
	m.docs[id.(string)] = d
	return false, nil
}
func (m *profileMem) ReplaceIf(_ context.Context, f bson.D, d bson.D) (bool, error) {
	id, _ := pydoc.Get(f, "_id")
	m.docs[id.(string)] = d
	return true, nil
}

type profileFixture struct {
	h   *ProfileHandler
	mem *profileMem
}

func newProfileFixture(t *testing.T) profileFixture {
	t.Helper()
	mem := &profileMem{docs: map[string]bson.D{}}
	h, err := NewProfile(ProfileConfig{
		Config:   Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Profiles: profilestore.New(mem),
	})
	if err != nil {
		t.Fatal(err)
	}
	return profileFixture{h: h, mem: mem}
}

func (f profileFixture) do(t *testing.T, method, body, contentType, user string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, ProfilePattern, strings.NewReader(body))
	if contentType != "" {
		r.Header.Set("Content-Type", contentType)
	}
	if user != "" {
		r.Header.Set("Authorization", "Bearer "+token(t, user, 0))
	}
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	return w
}

const jsonCT = "application/json"

func TestProfileRoundTripKeepsPythonShapes(t *testing.T) {
	f := newProfileFixture(t)
	if w := f.do(t, http.MethodGet, "", "", "alice"); w.Code != http.StatusOK || w.Body.String() != "{}" {
		t.Fatalf("no profile: %d %s", w.Code, w.Body)
	}
	w := f.do(t, http.MethodPut, `{"data":{"rating":1200.0,"army":["p","n"]},"_id":"mallory","revisions":{"x":9},"theme":"oscuro ♞"}`, jsonCT, "alice")
	if w.Code != http.StatusOK || w.Body.String() != `{"data":{"rating":1200.0,"army":["p","n"]},"theme":"oscuro ♞","revisions":{"army":1,"rating":1}}` {
		t.Fatalf("put: %d %s", w.Code, w.Body)
	}
	if _, ok := f.mem.docs["mallory"]; ok {
		t.Fatal("the body chose the owner")
	}
	w = f.do(t, http.MethodPatch, `{"data":{"rating":1210,"army":null},"revisions":{"rating":1,"army":1}}`, jsonCT, "alice")
	if w.Code != http.StatusOK || w.Body.String() != `{"data":{"rating":1210},"theme":"oscuro ♞","revisions":{"army":2,"rating":2}}` {
		t.Fatalf("patch: %d %s", w.Code, w.Body)
	}
	w = f.do(t, http.MethodPatch, `{"data":{"rating":1},"revisions":{"rating":1}}`, jsonCT, "alice")
	if w.Code != http.StatusConflict || w.Body.String() != `{"detail":{"message":"El perfil cambió en otra pestaña; relee y fusiona las claves en conflicto.","conflicts":{"rating":{"expected":1,"actual":2}},"profile":{"data":{"rating":1210},"theme":"oscuro ♞","revisions":{"army":2,"rating":2}},"revisions":{"army":2,"rating":2}}}` {
		t.Fatalf("conflict: %d %s", w.Code, w.Body)
	}
	if w := f.do(t, http.MethodGet, "", "", "alice"); w.Body.String() != `{"data":{"rating":1210},"theme":"oscuro ♞","revisions":{"army":2,"rating":2}}` {
		t.Fatalf("get: %s", w.Body)
	}
}

func TestProfileValidationOrderMatchesFastAPI(t *testing.T) {
	f := newProfileFixture(t)
	// Malformed JSON: 422 before authentication.
	if w := f.do(t, http.MethodPut, `{"data":`, jsonCT, ""); w.Code != http.StatusUnprocessableEntity || !strings.Contains(w.Body.String(), "json_invalid") {
		t.Fatalf("malformed anonymous: %d %s", w.Code, w.Body)
	}
	if w := f.do(t, http.MethodPut, "\xff\xfe", jsonCT, ""); w.Code != http.StatusBadRequest {
		t.Fatalf("not utf-8: %d %s", w.Code, w.Body)
	}
	// Well-formed but wrong shape: authentication first.
	if w := f.do(t, http.MethodPut, `[1]`, jsonCT, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("list anonymous: %d", w.Code)
	}
	for _, tc := range []struct{ body, ct, typ string }{
		{`[1]`, jsonCT, "dict_type"},
		{`{"a":1}`, "text/plain", "dict_type"},
		{`{"a":1}`, "", "dict_type"},
		{``, jsonCT, "missing"},
	} {
		w := f.do(t, http.MethodPut, tc.body, tc.ct, "alice")
		if w.Code != http.StatusUnprocessableEntity || !strings.Contains(w.Body.String(), `"type":"`+tc.typ+`"`) {
			t.Errorf("%q %q: %d %s", tc.body, tc.ct, w.Code, w.Body)
		}
	}
	if w := f.do(t, http.MethodPut, `{"a":1}`, "application/vnd.chess+json; charset=utf-8", "alice"); w.Code != http.StatusOK {
		t.Fatalf("+json content type: %d %s", w.Code, w.Body)
	}
}

func TestProfilePatchRules(t *testing.T) {
	f := newProfileFixture(t)
	keys := make([]string, 129)
	for i := range keys {
		keys[i] = fmt.Sprintf(`"k%d":1`, i)
	}
	for _, tc := range []struct {
		body   string
		status int
		detail string
	}{
		{`{"data":[],"revisions":{}}`, 400, "PATCH de perfil inválido."},
		{`{"data":{}}`, 400, "PATCH de perfil inválido."},
		{`{"data":{` + strings.Join(keys, ",") + `},"revisions":{}}`, 413, "PATCH de perfil demasiado grande."},
		{`{"data":{"` + strings.Repeat("é", 161) + `":1},"revisions":{}}`, 400, "PATCH de perfil contiene una clave inválida."},
	} {
		w := f.do(t, http.MethodPatch, tc.body, jsonCT, "alice")
		if w.Code != tc.status || decode(t, w)["detail"] != tc.detail {
			t.Errorf("%.60s: %d %s", tc.body, w.Code, w.Body)
		}
	}
}

func TestProfileLimitsAndStorageTrouble(t *testing.T) {
	f := newProfileFixture(t)
	for i := 0; i < 20; i++ {
		if w := f.do(t, http.MethodPut, `{}`, jsonCT, "alice"); w.Code != http.StatusOK {
			t.Fatalf("put %d: %d", i, w.Code)
		}
	}
	w := f.do(t, http.MethodPut, `{}`, jsonCT, "alice")
	if w.Code != http.StatusTooManyRequests || decode(t, w)["error"] != "Rate limit exceeded: 20 per 1 minute" {
		t.Fatalf("21st put: %d %s", w.Code, w.Body)
	}
	if w := f.do(t, http.MethodGet, "", "", "alice"); w.Code != http.StatusOK {
		t.Fatalf("get has its own bucket: %d", w.Code)
	}
	f.mem.fail = true
	w = f.do(t, http.MethodGet, "", "", "bob")
	if w.Code != http.StatusServiceUnavailable || decode(t, w)["detail"] != "La base de datos no está disponible temporalmente." {
		t.Fatalf("storage down: %d %s", w.Code, w.Body)
	}
}

func TestProfileRouteClaims(t *testing.T) {
	for method, want := range map[string]bool{http.MethodGet: true, http.MethodPut: true, http.MethodPatch: true, http.MethodPost: false, http.MethodDelete: false} {
		if _, ok := ProfileRoute(httptest.NewRequest(method, ProfilePattern, nil)); ok != want {
			t.Errorf("%s claimed=%v", method, ok)
		}
	}
}

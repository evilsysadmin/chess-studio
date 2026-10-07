package gamesapi

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newChroniclesForTest(t *testing.T) *ChroniclesHandler {
	t.Helper()
	h, err := NewChronicles(Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }})
	if err != nil {
		t.Fatal(err)
	}
	return h
}

// Expected answers recorded from FastAPI with chronicles_api's router.
func TestChroniclesPreviewMatchesPython(t *testing.T) {
	h := newChroniclesForTest(t)
	cases := []struct {
		body   string
		status int
		want   string
	}{
		{"{\"a\":1,\"mapCode\":\"x\",\"b\":[1]}", 422, "{\"detail\":[{\"type\":\"extra_forbidden\",\"loc\":[\"body\",\"a\"],\"msg\":\"Extra inputs are not permitted\",\"input\":1},{\"type\":\"extra_forbidden\",\"loc\":[\"body\",\"b\"],\"msg\":\"Extra inputs are not permitted\",\"input\":[1]}]}"},
		{"{\"map_code\":\"CM1\",\"mapCode\":7}", 422, "{\"detail\":[{\"type\":\"string_type\",\"loc\":[\"body\",\"mapCode\"],\"msg\":\"Input should be a valid string\",\"input\":7},{\"type\":\"extra_forbidden\",\"loc\":[\"body\",\"map_code\"],\"msg\":\"Extra inputs are not permitted\",\"input\":\"CM1\"}]}"},
		{"{\"a\":1}", 422, "{\"detail\":[{\"type\":\"missing\",\"loc\":[\"body\",\"mapCode\"],\"msg\":\"Field required\",\"input\":{\"a\":1}},{\"type\":\"extra_forbidden\",\"loc\":[\"body\",\"a\"],\"msg\":\"Extra inputs are not permitted\",\"input\":1}]}"},
		{"{\"map_code\":\"\"}", 422, "{\"detail\":[{\"type\":\"string_too_short\",\"loc\":[\"body\",\"map_code\"],\"msg\":\"String should have at least 1 character\",\"input\":\"\",\"ctx\":{\"min_length\":1}}]}"},
		{"\"CM1\"", 422, "{\"detail\":[{\"type\":\"model_attributes_type\",\"loc\":[\"body\"],\"msg\":\"Input should be a valid dictionary or object to extract fields from\",\"input\":\"CM1\"}]}"},
		{"{\"mapCode\":\"ñaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}", 400, "{\"detail\":\"MapCode must start with CM1\"}"},
		{"{\"mapCode\":\"CM1|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0\"}", 200, "{\"mapCode\":\"CM1|theme=crypt|size=7x7|verbs=hunt|enemies=2|treasures=0|secrets=0|difficulty=1|seed=0\",\"generatorVersion\":2,\"layoutRevision\":\"237c06a0b60013589c9afd98428f57be20ee80b57c9bd7f3b1f2a65134b13567\",\"grid\":[\"#######\",\"#P....#\",\"####..#\",\"#.....#\",\"#.##.##\",\"#X....#\",\"#######\"],\"partyStart\":{\"x\":1,\"y\":1,\"direction\":1},\"exit\":{\"x\":1,\"y\":5},\"walkableCount\":19}"},
		{"", 422, `{"detail":[{"type":"missing","loc":["body"],"msg":"Field required","input":null}]}`},
	}
	for _, c := range cases {
		w := feedbackDo(t, h, http.MethodPost, "/api/chronicles/map-code/preview", c.body, "alice")
		if w.Code != c.status || strings.TrimSuffix(w.Body.String(), "\n") != c.want || w.Header().Get("X-Chess-Chronicles-Native") != "go" {
			t.Errorf("%s:\ngot  %d %s\nwant %d %s", c.body, w.Code, w.Body, c.status, c.want)
		}
	}
	if w := feedbackDo(t, h, http.MethodPost, "/api/chronicles/map-code/preview", "{", ""); w.Code != 422 {
		t.Errorf("malformed JSON answers before auth: %d", w.Code)
	}
	if w := feedbackDo(t, h, http.MethodPost, "/api/chronicles/map-code/preview", `{"mapCode":"x"}`, ""); w.Code != 401 {
		t.Errorf("anonymous preview: %d", w.Code)
	}
}

func TestChroniclesMapMatchesPython(t *testing.T) {
	h := newChroniclesForTest(t)
	w := feedbackDo(t, h, http.MethodGet, "/api/chronicles/maps/ash-vault?seed=417", "", "alice")
	sum := sha256.Sum256(w.Body.Bytes())
	if w.Code != 200 || hex.EncodeToString(sum[:]) != "6035688a56f672f8ead4e1add6143e035115f8f415983264592c052e5bfb96b1" || w.Body.Len() != 8191 {
		t.Errorf("area envelope differs from FastAPI's: %d %s", w.Code, w.Body)
	}
	for _, c := range []struct {
		path   string
		status int
		want   string
	}{
		{"/api/chronicles/maps/ash-vault?seed=-1", 422, `{"detail":[{"type":"greater_than_equal","loc":["query","seed"],"msg":"Input should be greater than or equal to 0","input":"-1","ctx":{"ge":0}}]}`},
		{"/api/chronicles/maps/nope?seed=2147483648", 422, `"ctx":{"le":2147483647}`},
		{"/api/chronicles/maps/Nope", 404, `{"detail":"Mapa de Chronicles no encontrado."}`},
		{"/api/chronicles/maps/nope", 404, `{"detail":"Mapa de Chronicles no encontrado."}`},
	} {
		w := feedbackDo(t, h, http.MethodGet, c.path, "", "alice")
		if w.Code != c.status || !strings.Contains(w.Body.String(), c.want) {
			t.Errorf("%s: %d %s", c.path, w.Code, w.Body)
		}
	}
	if w := feedbackDo(t, h, http.MethodGet, "/api/chronicles/maps/ash-vault", "", ""); w.Code != 401 {
		t.Errorf("anonymous map: %d", w.Code)
	}
	for _, c := range []struct {
		method, path, pattern string
	}{
		{"GET", "/api/chronicles/maps/x", ChroniclesMapPattern},
		{"POST", "/api/chronicles/map-code/preview", ChroniclesPreviewPattern},
		{"GET", "/api/chronicles/map-code/preview", ""},
		{"POST", "/api/chronicles/maps/x", ""},
		{"GET", "/api/chronicles/maps/", ""},
		{"GET", "/api/chronicles/maps/a/b", ""},
		{"POST", "/api/chronicles/runs", ""},
		{"GET", "/api/chronicles/runs/x", ""},
	} {
		if pattern, _ := ChroniclesRoute(httptest.NewRequest(c.method, c.path, nil)); pattern != c.pattern {
			t.Errorf("%s %s: %q", c.method, c.path, pattern)
		}
	}
}

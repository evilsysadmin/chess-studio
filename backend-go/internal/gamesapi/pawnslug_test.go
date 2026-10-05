package gamesapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPawnSlugStage(t *testing.T) {
	h, err := NewPawnSlug(Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }})
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		path, user string
		status     int
		want       string
	}{
		{"/api/pawn-slug/stages/pawn-slug-v1", "alice", 200, `{"schemaVersion":1,"stageId":"pawn-slug-v1","contentVersion":1,"seed":0,"instanceId":"2fc806b8ead99027e10ae170"`},
		{"/api/pawn-slug/stages/pawn-slug-v1?seed=1&seed=%205.00%20", "alice", 200, `"seed":5,"instanceId":"87801dba25ef7b65d0eea044"`},
		{"/api/pawn-slug/stages/pawn-slug-v1?seed=1_000", "alice", 200, `"seed":1000,`},
		{"/api/pawn-slug/stages/pawn-slug-v1?seed=-5.0", "alice", 422, `{"detail":[{"type":"greater_than_equal","loc":["query","seed"],"msg":"Input should be greater than or equal to 0","input":"-5.0","ctx":{"ge":0}}]}`},
		{"/api/pawn-slug/stages/pawn-slug-v1?seed=99999999999999999999", "alice", 422, `"type":"less_than_equal","loc":["query","seed"],"msg":"Input should be less than or equal to 2147483647","input":"99999999999999999999","ctx":{"le":2147483647}`},
		{"/api/pawn-slug/stages/pawn-slug-v1?seed=3.", "alice", 422, `{"detail":[{"type":"int_parsing","loc":["query","seed"],"msg":"Input should be a valid integer, unable to parse string as an integer","input":"3."}]}`},
		{"/api/pawn-slug/stages/pawn-slug-v1?seed=", "alice", 422, `"input":""`},
		{"/api/pawn-slug/stages/pawn-slug-v1?seed=abc", "", 401, ``},
		{"/api/pawn-slug/stages/Pawn", "alice", 404, `Stage de Pawn Slug no encontrado.`},
		{"/api/pawn-slug/stages/nope", "alice", 404, `Stage de Pawn Slug no encontrado.`},
	}
	for _, c := range cases {
		w := feedbackDo(t, h, http.MethodGet, c.path, "", c.user)
		if w.Code != c.status || !strings.Contains(w.Body.String(), c.want) || w.Header().Get("X-Chess-PawnSlug-Native") != "go" {
			t.Errorf("%s: %d %s", c.path, w.Code, w.Body)
		}
	}
	for _, c := range []struct {
		method, path string
		ok           bool
	}{{"GET", "/api/pawn-slug/stages/x", true}, {"POST", "/api/pawn-slug/stages/x", false}, {"GET", "/api/pawn-slug/stages/", false}, {"GET", "/api/pawn-slug/stages/a/b", false}} {
		if _, ok := PawnSlugRoute(httptest.NewRequest(c.method, c.path, nil)); ok != c.ok {
			t.Errorf("%s %s: %v", c.method, c.path, ok)
		}
	}
}

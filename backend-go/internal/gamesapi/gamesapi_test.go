package gamesapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamestore"
)

const secret = "test-secret"

var fixedNow = time.Unix(1_760_000_000, 0)

type fakeStore struct {
	docs      map[string]bson.M
	summaries []gamestore.Summary
	err       error
	deleted   []string
}

func (f *fakeStore) ListSummariesByOwner(_ context.Context, owner string, limit int) ([]gamestore.Summary, error) {
	if limit != gamestore.DefaultSummaryLimit {
		return nil, errors.New("unexpected limit")
	}
	return f.summaries, f.err
}

func (f *fakeStore) GetDocumentForOwner(_ context.Context, id, owner string) (bson.M, bool, error) {
	if f.err != nil {
		return nil, false, f.err
	}
	doc, ok := f.docs[id]
	if !ok {
		return nil, false, nil
	}
	if o, present := doc["owner"]; present && o != nil && o != owner {
		return nil, false, nil
	}
	return doc, true, nil
}

func (f *fakeStore) DeleteForOwner(_ context.Context, id, owner string) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	doc, ok := f.docs[id]
	if !ok || doc["owner"] != owner {
		return false, nil
	}
	delete(f.docs, id)
	f.deleted = append(f.deleted, id)
	return true, nil
}

type fakeAccounts struct {
	version int64
	missing bool
	err     error
}

func (f fakeAccounts) AuthState(context.Context, string) (bool, int64, error) {
	return !f.missing, f.version, f.err
}

type fakePresence struct{ touched []string }

func (f *fakePresence) Touch(_ *http.Request, username string) {
	f.touched = append(f.touched, username)
}

func token(t *testing.T, subject string, version int64) string {
	t.Helper()
	enc := base64.RawURLEncoding
	header := enc.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claims, _ := json.Marshal(map[string]any{"sub": subject, "sv": version, "exp": fixedNow.Add(time.Hour).Unix()})
	payload := enc.EncodeToString(claims)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(header + "." + payload))
	return header + "." + payload + "." + enc.EncodeToString(mac.Sum(nil))
}

type fixture struct {
	h        *Handler
	store    *fakeStore
	presence *fakePresence
}

func newFixture(t *testing.T, accounts fakeAccounts) fixture {
	t.Helper()
	f := fixture{store: &fakeStore{docs: map[string]bson.M{}}, presence: &fakePresence{}}
	h, err := New(Config{Store: f.store, Accounts: accounts, Presence: f.presence, JWTSecret: secret, Now: func() time.Time { return fixedNow }})
	if err != nil {
		t.Fatal(err)
	}
	f.h = h
	return f
}

func (f fixture) do(t *testing.T, method, path, auth string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, nil)
	if auth != "" {
		r.Header.Set("Authorization", auth)
	}
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	return w
}

func body(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("body %q: %v", w.Body.String(), err)
	}
	return out
}

func TestRouteOnlyClaimsReadsAndDelete(t *testing.T) {
	cases := []struct {
		method, path, preflight string
		pattern, id             string
	}{
		{"GET", "/api/games", "", ListPattern, ""},
		{"GET", "/api/games/abc-123", "", GamePattern, "abc-123"},
		{"DELETE", "/api/games/abc-123", "", GamePattern, "abc-123"},
		{"OPTIONS", "/api/games", "GET", ListPattern, ""},
		{"OPTIONS", "/api/games/x1", "DELETE", GamePattern, "x1"},
		{"POST", "/api/games", "", "", ""},
		{"OPTIONS", "/api/games", "POST", "", ""},
		{"HEAD", "/api/games", "", "", ""},
		{"GET", "/api/games/abc/hint", "", "", ""},
		{"POST", "/api/games/abc/move", "", "", ""},
		{"POST", "/api/games/abc/undo", "", "", ""},
		{"GET", "/api/games/", "", "", ""},
		{"GET", "/api/gamesx", "", "", ""},
	}
	for _, c := range cases {
		r := httptest.NewRequest(c.method, c.path, nil)
		if c.preflight != "" {
			r.Header.Set("Access-Control-Request-Method", c.preflight)
		}
		pattern, id, ok := Route(r)
		if ok != (c.pattern != "") || pattern != c.pattern || id != c.id {
			t.Errorf("%s %s (%s): got %q %q %v", c.method, c.path, c.preflight, pattern, id, ok)
		}
	}
}

func TestListGamesForTheSessionOwner(t *testing.T) {
	f := newFixture(t, fakeAccounts{version: 2})
	f.store.summaries = []gamestore.Summary{{ID: "g1", Ply: 4, Difficulty: int32(50)}}
	w := f.do(t, "GET", "/api/games", "Bearer "+token(t, "alice", 2), nil)
	if w.Code != 200 {
		t.Fatalf("status %d %s", w.Code, w.Body)
	}
	games := body(t, w)["games"].([]any)
	if len(games) != 1 || games[0].(map[string]any)["id"] != "g1" || games[0].(map[string]any)["ply"] != float64(4) {
		t.Fatalf("games %v", games)
	}
	if len(f.presence.touched) != 1 || f.presence.touched[0] != "alice" {
		t.Fatalf("presence %v", f.presence.touched)
	}
	if w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("X-Frame-Options") != "DENY" {
		t.Fatalf("security headers %v", w.Header())
	}

	// No savegames is an empty list, never null.
	f.store.summaries = nil
	w = f.do(t, "GET", "/api/games", "Bearer "+token(t, "alice", 2), nil)
	if strings.TrimSpace(w.Body.String()) != `{"games":[]}` {
		t.Fatalf("empty list %s", w.Body)
	}
}

func TestAuthenticationMirrorsGetCurrentUser(t *testing.T) {
	cases := []struct {
		name     string
		accounts fakeAccounts
		auth     string
		status   int
		detail   string
	}{
		{"missing", fakeAccounts{}, "", 401, "Falta el token de sesión."},
		{"not bearer", fakeAccounts{}, "Basic abc", 401, "Falta el token de sesión."},
		{"bad token", fakeAccounts{}, "Bearer nope", 401, "Sesión inválida o expirada. Inicia sesión de nuevo."},
		{"deleted account", fakeAccounts{missing: true}, "valid", 401, "La cuenta ya no existe."},
		{"revoked session", fakeAccounts{version: 3}, "valid", 401, "La cuenta ya no existe."},
		{"accounts down", fakeAccounts{err: errors.New("down")}, "valid", 503, "No se puede verificar la sesión temporalmente."},
	}
	for _, c := range cases {
		f := newFixture(t, c.accounts)
		auth := c.auth
		if auth == "valid" {
			auth = "Bearer " + token(t, "alice", 0)
		}
		w := f.do(t, "GET", "/api/games", auth, nil)
		if w.Code != c.status || body(t, w)["detail"] != c.detail {
			t.Errorf("%s: %d %s", c.name, w.Code, w.Body)
		}
		if len(f.presence.touched) != 0 {
			t.Errorf("%s: presence touched for an unauthenticated request", c.name)
		}
	}
}

func TestGetGameReturnsThePythonSnapshot(t *testing.T) {
	f := newFixture(t, fakeAccounts{})
	f.store.docs["g1"] = bson.M{
		"_id": "g1", "owner": "alice", "humanColor": "w", "difficulty": int32(50),
		"moves":    bson.A{"e4", "e5", "Nf3"},
		"lastMove": bson.M{"from": "g1", "to": "f3", "by": "human", "captured": false, "piece": "n", "promotion": nil},
	}
	w := f.do(t, "GET", "/api/games/g1", "Bearer "+token(t, "alice", 0), nil)
	if w.Code != 200 {
		t.Fatalf("status %d %s", w.Code, w.Body)
	}
	got := body(t, w)
	if got["id"] != "g1" || got["turn"] != "b" || got["status"] != "playing" || got["difficulty"] != float64(50) {
		t.Fatalf("snapshot %v", got)
	}
	if got["fen"] != "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2" {
		t.Fatalf("fen %v", got["fen"])
	}
	if history := got["history"].([]any); len(history) != 3 || history[2].(map[string]any)["san"] != "Nf3" {
		t.Fatalf("history %v", got["history"])
	}
	if got["lastMove"].(map[string]any)["to"] != "f3" || got["initialFen"] != nil {
		t.Fatalf("echoed fields %v", got)
	}
}

func TestGetGameConflictsAndMisses(t *testing.T) {
	f := newFixture(t, fakeAccounts{})
	f.store.docs["legacy"] = bson.M{"_id": "legacy", "owner": nil, "humanColor": "w", "difficulty": 50, "moves": bson.A{}}
	f.store.docs["damaged"] = bson.M{"_id": "damaged", "owner": "alice", "humanColor": "w", "difficulty": 50, "moves": bson.A{"e4", "Qxh8"}}
	f.store.docs["typed-wrong"] = bson.M{"_id": "typed-wrong", "owner": "alice", "humanColor": "w", "difficulty": 50, "moves": "e4"}
	f.store.docs["other"] = bson.M{"_id": "other", "owner": "bob", "humanColor": "w", "difficulty": 50, "moves": bson.A{}}
	auth := "Bearer " + token(t, "alice", 0)
	cases := map[string]struct {
		status int
		detail string
	}{
		"legacy":      {409, "Partida antigua sin propietario. Inicia una partida nueva."},
		"damaged":     {409, "La partida guardada está dañada y no puede continuar. Inicia una nueva partida."},
		"typed-wrong": {409, "La partida guardada está dañada y no puede continuar. Inicia una nueva partida."},
		"other":       {404, "Partida no encontrada."},
		"missing":     {404, "Partida no encontrada."},
	}
	for id, c := range cases {
		w := f.do(t, "GET", "/api/games/"+id, auth, nil)
		if w.Code != c.status || body(t, w)["detail"] != c.detail {
			t.Errorf("%s: %d %s", id, w.Code, w.Body)
		}
	}
}

func TestDeleteGame(t *testing.T) {
	f := newFixture(t, fakeAccounts{})
	f.store.docs["g1"] = bson.M{"_id": "g1", "owner": "alice"}
	f.store.docs["g2"] = bson.M{"_id": "g2", "owner": "bob"}
	auth := "Bearer " + token(t, "alice", 0)
	if w := f.do(t, "DELETE", "/api/games/g1", auth, nil); w.Code != 204 || w.Body.Len() != 0 {
		t.Fatalf("delete own: %d %q", w.Code, w.Body)
	}
	if w := f.do(t, "DELETE", "/api/games/g2", auth, nil); w.Code != 404 {
		t.Fatalf("delete other's: %d", w.Code)
	}
	if len(f.store.deleted) != 1 {
		t.Fatalf("deleted %v", f.store.deleted)
	}
}

func TestStorageOutageIs503WithRequestID(t *testing.T) {
	f := newFixture(t, fakeAccounts{})
	f.store.err = gamestore.ErrUnavailable
	auth := "Bearer " + token(t, "alice", 0)
	for _, req := range [][2]string{{"GET", "/api/games"}, {"GET", "/api/games/g1"}, {"DELETE", "/api/games/g1"}} {
		r := httptest.NewRequest(req[0], req[1], nil)
		r.Header.Set("Authorization", auth)
		w := httptest.NewRecorder()
		w.Header().Set("X-Request-ID", "req-1") // set by the edge telemetry
		f.h.ServeHTTP(w, r)
		got := body(t, w)
		if w.Code != 503 || got["detail"] != "La base de datos no está disponible temporalmente." || got["requestId"] != "req-1" {
			t.Errorf("%v: %d %v", req, w.Code, got)
		}
	}
}

func TestCORSMirrorsStarlette(t *testing.T) {
	f := newFixture(t, fakeAccounts{})
	origin := "https://staging.chess-studio.shadowops.dpdns.org"
	w := f.do(t, "OPTIONS", "/api/games/g1", "", map[string]string{
		"Origin": origin, "Access-Control-Request-Method": "DELETE",
		"Access-Control-Request-Headers": "authorization, x-presence-session",
	})
	if w.Code != 200 || w.Header().Get("Access-Control-Allow-Origin") != origin || !strings.Contains(w.Header().Get("Access-Control-Allow-Methods"), "DELETE") {
		t.Fatalf("preflight: %d %v", w.Code, w.Header())
	}
	w = f.do(t, "OPTIONS", "/api/games", "", map[string]string{"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
	if w.Code != 400 || w.Body.String() != "Disallowed CORS origin" {
		t.Fatalf("disallowed origin: %d %q", w.Code, w.Body)
	}
	w = f.do(t, "OPTIONS", "/api/games", "", map[string]string{"Origin": origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-evil"})
	if w.Code != 400 || w.Body.String() != "Disallowed CORS headers" {
		t.Fatalf("disallowed header: %d %q", w.Code, w.Body)
	}
	w = f.do(t, "GET", "/api/games", "Bearer "+token(t, "alice", 0), map[string]string{"Origin": origin})
	if w.Header().Get("Access-Control-Allow-Origin") != origin || w.Header().Get("Access-Control-Expose-Headers") != "X-Request-ID" {
		t.Fatalf("simple request CORS: %v", w.Header())
	}
}

func TestDefaultRateLimit(t *testing.T) {
	f := newFixture(t, fakeAccounts{})
	auth := "Bearer " + token(t, "alice", 0)
	for i := 0; i < 120; i++ {
		if w := f.do(t, "GET", "/api/games", auth, nil); w.Code != 200 {
			t.Fatalf("request %d: %d", i, w.Code)
		}
	}
	w := f.do(t, "GET", "/api/games", auth, nil)
	if w.Code != 429 || body(t, w)["error"] != "Rate limit exceeded: 120 per 1 minute" {
		t.Fatalf("121st: %d %s", w.Code, w.Body)
	}
	// Another account has its own bucket.
	if w := f.do(t, "GET", "/api/games", "Bearer "+token(t, "bob", 0), nil); w.Code != 200 {
		t.Fatalf("bob: %d", w.Code)
	}
}

func TestAnonymousRateLimitIsPerCloudflareClient(t *testing.T) {
	f := newFixture(t, fakeAccounts{})
	f.h.trustCF = true
	hit := func(ip string) int {
		r := httptest.NewRequest("GET", "/api/games", nil)
		r.RemoteAddr = "127.0.0.1:4000" // every request arrives from the edge
		r.Header.Set("CF-Connecting-IP", ip)
		w := httptest.NewRecorder()
		f.h.ServeHTTP(w, r)
		return w.Code
	}
	for i := 0; i < 120; i++ {
		if code := hit("81.40.1.2"); code != 401 {
			t.Fatalf("request %d: %d", i, code)
		}
	}
	if code := hit("81.40.1.2"); code != 429 {
		t.Fatalf("121st from one client: %d", code)
	}
	if code := hit("81.40.1.3"); code != 401 {
		t.Fatalf("another client must not share the bucket: %d", code)
	}
}

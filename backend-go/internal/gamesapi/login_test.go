package gamesapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/accountstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/presence"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/telemetry"
)

type fakeLoginAccounts struct {
	byID  map[string]accountstore.LoginAccount
	err   error
	asked []string
}

func (f *fakeLoginAccounts) ForLogin(_ context.Context, identity string) (accountstore.LoginAccount, bool, error) {
	f.asked = append(f.asked, identity)
	if f.err != nil {
		return accountstore.LoginAccount{}, false, f.err
	}
	a, ok := f.byID[identity]
	return a, ok, nil
}

type fakeGuard struct {
	retry, failRetry int
	failures, clears int
	checks           int
	err              error
	ids              []string
}

func (f *fakeGuard) RetryAfter(_ context.Context, id string) (int, error) {
	f.checks++
	f.ids = append(f.ids, id)
	return f.retry, f.err
}
func (f *fakeGuard) RecordFailure(_ context.Context, id string) (int, error) {
	f.failures++
	return f.failRetry, f.err
}
func (f *fakeGuard) Clear(context.Context, string) error {
	f.clears++
	return f.err
}

type fakeFailureLog struct{ failures []telemetry.LoginFailure }

func (f *fakeFailureLog) EmitLoginFailed(_ *http.Request, failure telemetry.LoginFailure) {
	f.failures = append(f.failures, failure)
}

type fakeTouch struct{ users []string }

func (f *fakeTouch) Beat(_ *http.Request, username string, _ presence.Heartbeat) error {
	f.users = append(f.users, username)
	return errors.New("best effort")
}

type loginFixture struct {
	h        *LoginHandler
	accounts *fakeLoginAccounts
	idGuard  *fakeGuard
	ipGuard  *fakeGuard
	failures *fakeFailureLog
	touch    *fakeTouch
}

func newLoginFixture(t *testing.T, env string) loginFixture {
	t.Helper()
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct horse"), bcrypt.MinCost)
	f := loginFixture{
		accounts: &fakeLoginAccounts{byID: map[string]accountstore.LoginAccount{
			"alice":                     {Username: "alice", PasswordHash: string(hash), HasPasswordHash: true, SessionVersion: 3},
			"alice@example.com":         {Username: "Alice", PasswordHash: string(hash), HasPasswordHash: true, SessionVersion: 3},
			"nohash":                    {Username: "nohash"},
			"ci_smoke_0123456789abcdef": {Username: "ci_smoke_0123456789abcdef", PasswordHash: string(hash), HasPasswordHash: true},
		}},
		idGuard: &fakeGuard{}, ipGuard: &fakeGuard{}, failures: &fakeFailureLog{}, touch: &fakeTouch{},
	}
	h, err := NewLogin(LoginConfig{
		Config:          Config{Accounts: fakeAccounts{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		LoginAccounts:   f.accounts,
		IdentityGuard:   f.idGuard,
		IPGuard:         f.ipGuard,
		Touch:           f.touch,
		FailureLog:      f.failures,
		Environment:     env,
		SyntheticSecret: "synthetic-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	f.h = h
	return f
}

func (f loginFixture) post(t *testing.T, body string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, LoginPattern, strings.NewReader(body))
	r.Header.Set("Content-Type", jsonCT)
	r.RemoteAddr = "203.0.113.9:5555"
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	return w
}

func TestLoginIssuesTheAccountsSessionToken(t *testing.T) {
	f := newLoginFixture(t, "staging")
	for _, identity := range []string{" ALICE ", "alice@example.com"} {
		w := f.post(t, `{"username":"`+identity+`","password":"correct horse"}`, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", identity, w.Code, w.Body)
		}
		got := decode(t, w)
		if got["username"] != "alice" {
			t.Fatalf("%s username %v", identity, got)
		}
		subject, version, err := sessionauth.VerifySession(got["token"].(string), []byte(secret), fixedNow)
		if err != nil || subject != "alice" || version != 3 {
			t.Fatalf("%s token %s %d %v", identity, subject, version, err)
		}
	}
	if f.idGuard.clears != 2 || len(f.touch.users) != 2 || f.ipGuard.failures != 0 || f.ipGuard.checks != 2 {
		t.Fatalf("guards %+v %+v touch %v", f.idGuard, f.ipGuard, f.touch.users)
	}
	if f.accounts.asked[1] != "alice@example.com" {
		t.Fatalf("lookup %v", f.accounts.asked)
	}
}

func TestLoginFailuresFeedBothGuardsAndTheForensicsLog(t *testing.T) {
	f := newLoginFixture(t, "staging")
	for _, tc := range []struct{ body, reason string }{
		{`{"username":"alice","password":"wrong"}`, "bad_password"},
		{`{"username":"mallory","password":"x"}`, "unknown_user"},
	} {
		w := f.post(t, tc.body, map[string]string{"User-Agent": "bot/1"})
		if w.Code != http.StatusUnauthorized || decode(t, w)["detail"] != "Usuario o contraseña incorrectos." {
			t.Fatalf("%s: %d %s", tc.body, w.Code, w.Body)
		}
		if w.Header().Get("X-Chess-Auth-Failure") != "" {
			t.Fatal("failure reason leaked to an untrusted client")
		}
		last := f.failures.failures[len(f.failures.failures)-1]
		if last.Reason != tc.reason || last.FingerprintKey != secret || last.SyntheticSource != "" {
			t.Fatalf("log %+v", last)
		}
	}
	if f.idGuard.failures != 2 || f.ipGuard.failures != 2 {
		t.Fatalf("guards id=%d ip=%d", f.idGuard.failures, f.ipGuard.failures)
	}
	// The failure that starts a block answers 429, which the IP guard does
	// not count.
	f.idGuard.failRetry = 300
	w := f.post(t, `{"username":"alice","password":"wrong"}`, nil)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") != "300" || f.ipGuard.failures != 2 {
		t.Fatalf("blocking failure: %d %v ip=%d", w.Code, w.Header(), f.ipGuard.failures)
	}
	// An active identity block answers before looking the account up.
	f.idGuard.retry = 42
	asked := len(f.accounts.asked)
	w = f.post(t, `{"username":"alice","password":"correct horse"}`, nil)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") != "42" || len(f.accounts.asked) != asked {
		t.Fatalf("identity block: %d", w.Code)
	}
}

func TestLoginIPGuardRunsFirst(t *testing.T) {
	f := newLoginFixture(t, "staging")
	f.ipGuard.retry = 900
	w := f.post(t, `{"username":`, nil)
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") != "900" {
		t.Fatalf("ip block: %d %s", w.Code, w.Body)
	}
	// Its storage being down never blocks a login.
	f.ipGuard.retry, f.ipGuard.err = 0, errors.New("down")
	if w := f.post(t, `{"username":"alice","password":"correct horse"}`, nil); w.Code != http.StatusOK {
		t.Fatalf("ip guard down: %d", w.Code)
	}
}

func TestLoginValidationAndLimit(t *testing.T) {
	f := newLoginFixture(t, "staging")
	for _, tc := range []struct {
		body   string
		status int
		typ    string
	}{
		{`{`, 422, "json_invalid"},
		{`[]`, 422, "model_attributes_type"},
		{`{"username":"a"}`, 422, "missing"},
		{`{"username":1,"password":"x"}`, 422, "string_type"},
		{`{"username":"a","password":"` + strings.Repeat("p", 129) + `"}`, 422, "string_too_long"},
		{"\xff", 400, ""},
	} {
		w := f.post(t, tc.body, nil)
		if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.typ) {
			t.Errorf("%q: %d %s", tc.body, w.Code, w.Body)
		}
	}
	if f.ipGuard.failures != 0 {
		t.Fatal("422s counted as auth failures")
	}
	for i := 0; i < 10; i++ {
		f.post(t, `{"username":"alice","password":"wrong"}`, nil)
	}
	if w := f.post(t, `{"username":"alice","password":"correct horse"}`, nil); w.Code != http.StatusTooManyRequests || decode(t, w)["error"] != "Rate limit exceeded: 10 per 1 minute" {
		t.Fatalf("11th: %d %s", w.Code, w.Body)
	}
}

func signSynthetic(source, identity string) string {
	mac := hmac.New(sha256.New, []byte("synthetic-secret"))
	mac.Write([]byte("chess-studio:synthetic:" + source + "\x00" + identity))
	return hex.EncodeToString(mac.Sum(nil))
}

func TestSignedStagingProbesSkipTheGuards(t *testing.T) {
	probe := map[string]string{
		"X-Chess-Synthetic-Source":    "staging-smoke-cleanup",
		"X-Chess-Synthetic-Identity":  "ci_smoke_0123456789abcdef",
		"X-Chess-Synthetic-Signature": signSynthetic("staging-smoke-cleanup", "ci_smoke_0123456789abcdef"),
	}
	f := newLoginFixture(t, "staging")
	w := f.post(t, `{"username":"ci_smoke_0123456789abcdef","password":"nope"}`, probe)
	if w.Code != http.StatusUnauthorized || w.Header().Get("X-Chess-Auth-Failure") != "bad_password" {
		t.Fatalf("probe: %d %v", w.Code, w.Header())
	}
	if f.ipGuard.checks != 0 || f.ipGuard.failures != 0 || f.idGuard.checks != 0 || f.idGuard.failures != 0 {
		t.Fatalf("guards touched: %+v %+v", f.ipGuard, f.idGuard)
	}
	if f.failures.failures[0].SyntheticSource != "staging-smoke-cleanup" {
		t.Fatalf("log %+v", f.failures.failures[0])
	}
	// Production never trusts the marker.
	f = newLoginFixture(t, "production")
	if w := f.post(t, `{"username":"ci_smoke_0123456789abcdef","password":"nope"}`, probe); w.Header().Get("X-Chess-Auth-Failure") != "" || f.ipGuard.checks != 1 {
		t.Fatalf("production trusted a probe: %v", w.Header())
	}
}

func TestLoginStorageTrouble(t *testing.T) {
	f := newLoginFixture(t, "staging")
	if w := f.post(t, `{"username":"nohash","password":"x"}`, nil); w.Code != http.StatusInternalServerError {
		t.Fatalf("missing hash: %d", w.Code)
	}
	f.accounts.err = errors.New("down")
	if w := f.post(t, `{"username":"alice","password":"x"}`, nil); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("accounts down: %d", w.Code)
	}
	f.accounts.err, f.idGuard.err = nil, errors.New("down")
	if w := f.post(t, `{"username":"alice","password":"x"}`, nil); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("identity guard down: %d", w.Code)
	}
}

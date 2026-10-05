package gamesapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/accountstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/userdata"
)

type memAccount struct {
	hash    string
	email   string
	version int64
}

type fakeAccountStore struct {
	users   map[string]*memAccount
	err     error
	created []string
	deleted []string
}

func (f *fakeAccountStore) ByUsername(_ context.Context, u string) (accountstore.LoginAccount, bool, error) {
	if f.err != nil {
		return accountstore.LoginAccount{}, false, f.err
	}
	a, ok := f.users[u]
	if !ok {
		return accountstore.LoginAccount{}, false, nil
	}
	return accountstore.LoginAccount{Username: u, PasswordHash: a.hash, HasPasswordHash: true, SessionVersion: a.version}, true, nil
}
func (f *fakeAccountStore) EmailOwner(_ context.Context, email string) (string, bool, error) {
	for u, a := range f.users {
		if a.email == email {
			return u, true, nil
		}
	}
	return "", false, f.err
}
func (f *fakeAccountStore) Create(_ context.Context, u, hash, email, createdAt string) error {
	if !strings.HasSuffix(createdAt, "+00:00") {
		return errors.New("created_at not Python isoformat")
	}
	f.created = append(f.created, u)
	f.users[u] = &memAccount{hash: hash, email: email}
	return nil
}
func (f *fakeAccountStore) Delete(_ context.Context, u string) (bool, error) {
	f.deleted = append(f.deleted, u)
	_, ok := f.users[u]
	delete(f.users, u)
	return ok, nil
}
func (f *fakeAccountStore) UpdatePassword(_ context.Context, u, hash string) (int64, bool, error) {
	a, ok := f.users[u]
	if !ok {
		return 0, false, nil
	}
	a.hash, a.version = hash, a.version+1
	return a.version, true, nil
}
func (f *fakeAccountStore) UpdateEmail(_ context.Context, u, email string) error {
	f.users[u].email = email
	return nil
}

func quickHash(p string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(p), bcrypt.MinCost)
	return string(h), err
}

type accountFixture struct {
	h        *AccountHandler
	store    *fakeAccountStore
	ipGuard  *fakeGuard
	purges   []string
	purgeErr error
}

func newAccountFixture(t *testing.T, mutate func(*AccountConfig)) *accountFixture {
	t.Helper()
	hash, _ := quickHash("correct horse")
	f := &accountFixture{
		store:   &fakeAccountStore{users: map[string]*memAccount{"alice": {hash: hash, email: "alice@example.com", version: 2}}},
		ipGuard: &fakeGuard{},
	}
	cfg := AccountConfig{
		Config:  Config{Accounts: fakeAccounts{}, Presence: &fakePresence{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Store:   f.store,
		IPGuard: f.ipGuard,
		Touch:   &fakeTouch{},
		Purge: func(_ context.Context, u string) (userdata.Purged, error) {
			f.purges = append(f.purges, u)
			return userdata.Purged{Games: 4}, f.purgeErr
		},
		AllowRegistration: true,
		Hash:              quickHash,
	}
	if mutate != nil {
		mutate(&cfg)
	}
	h, err := NewAccount(cfg)
	if err != nil {
		t.Fatal(err)
	}
	f.h = h
	return f
}

func (f *accountFixture) do(t *testing.T, method, path, body, user string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", jsonCT)
	r.RemoteAddr = "198.51.100.7:1234"
	if user != "" {
		r.Header.Set("Authorization", "Bearer "+token(t, user, 0))
	}
	w := httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	return w
}

func TestRegisterCreatesAVanillaAccount(t *testing.T) {
	f := newAccountFixture(t, nil)
	w := f.do(t, http.MethodPost, RegisterPattern, `{"username":"  Bob  ","password":"12345678"}`, "")
	if w.Code != http.StatusCreated {
		t.Fatalf("register: %d %s", w.Code, w.Body)
	}
	got := decode(t, w)
	subject, version, err := sessionauth.VerifySession(got["token"].(string), []byte(secret), fixedNow)
	if got["username"] != "bob" || subject != "bob" || version != 0 || err != nil {
		t.Fatalf("token %v %s %d %v", got, subject, version, err)
	}
	if len(f.purges) != 1 || f.purges[0] != "bob" {
		t.Fatalf("purge %v", f.purges)
	}
	for _, tc := range []struct {
		body, detail string
		status       int
	}{
		{`{"username":"bob","password":"12345678"}`, "Ese usuario ya existe.", 409},
		{`{"username":"ab","password":"12345678"}`, "El usuario tiene que tener al menos 3 caracteres.", 400},
		{`{"username":"carol","password":"1234567"}`, "La contraseña tiene que tener al menos 8 caracteres.", 400},
	} {
		w := f.do(t, http.MethodPost, RegisterPattern, tc.body, "")
		if w.Code != tc.status || decode(t, w)["detail"] != tc.detail {
			t.Errorf("%s: %d %s", tc.body, w.Code, w.Body)
		}
	}
}

func TestRegisterWithEmailRecoveryAndInvites(t *testing.T) {
	f := newAccountFixture(t, func(c *AccountConfig) { c.EmailRecoveryEnabled, c.InviteCode = true, " s3cret " })
	for _, tc := range []struct {
		body, detail string
		status       int
	}{
		{`{"username":"dave","password":"12345678","email":"d@x.io"}`, "Código de invitación no válido.", 403},
		{`{"username":"dave","password":"12345678","inviteCode":"s3cret"}`, "El email es obligatorio para cuentas nuevas.", 400},
		{`{"username":"dave","password":"12345678","invite_code":"s3cret","email":"no-at"}`, "Introduce un email válido.", 400},
		{`{"username":"dave","password":"12345678","inviteCode":"s3cret","email":" ALICE@example.com "}`, "Ese email ya está asociado a otra cuenta.", 409},
	} {
		w := f.do(t, http.MethodPost, RegisterPattern, tc.body, "")
		if w.Code != tc.status || decode(t, w)["detail"] != tc.detail {
			t.Errorf("%s: %d %s", tc.body, w.Code, w.Body)
		}
	}
	// The 403 counts for the IP guard, the 400s and 409 do not.
	if f.ipGuard.failures != 1 {
		t.Fatalf("ip failures %d", f.ipGuard.failures)
	}
	w := f.do(t, http.MethodPost, RegisterPattern, `{"username":"dave","password":"12345678","inviteCode":"s3cret","email":"Dave@X.io"}`, "")
	if w.Code != http.StatusCreated || f.store.users["dave"].email != "dave@x.io" {
		t.Fatalf("register with email: %d %s", w.Code, w.Body)
	}
	f = newAccountFixture(t, func(c *AccountConfig) { c.AllowRegistration = false })
	if w := f.do(t, http.MethodPost, RegisterPattern, `{"username":"erin","password":"12345678"}`, ""); w.Code != http.StatusForbidden {
		t.Fatalf("closed registration: %d", w.Code)
	}
}

func TestRegisterRollsBackWhenThePurgeFails(t *testing.T) {
	f := newAccountFixture(t, nil)
	f.purgeErr = userdata.ErrUnavailable
	w := f.do(t, http.MethodPost, RegisterPattern, `{"username":"frank","password":"12345678"}`, "")
	if w.Code != http.StatusServiceUnavailable || decode(t, w)["detail"] != "No se pudo inicializar el perfil nuevo. Reintenta en unos segundos." {
		t.Fatalf("purge failure: %d %s", w.Code, w.Body)
	}
	if _, ok := f.store.users["frank"]; ok || len(f.store.deleted) != 1 {
		t.Fatalf("not rolled back: %v", f.store.deleted)
	}
}

func TestRegisterLimitAndIPGuard(t *testing.T) {
	f := newAccountFixture(t, nil)
	for i := 0; i < 5; i++ {
		f.do(t, http.MethodPost, RegisterPattern, `{"username":"x","password":"12345678"}`, "")
	}
	if w := f.do(t, http.MethodPost, RegisterPattern, `{"username":"xyz","password":"12345678"}`, ""); w.Code != http.StatusTooManyRequests || decode(t, w)["error"] != "Rate limit exceeded: 5 per 1 hour" {
		t.Fatalf("6th: %d %s", w.Code, w.Body)
	}
	f = newAccountFixture(t, nil)
	f.ipGuard.retry = 60
	if w := f.do(t, http.MethodPost, RegisterPattern, `{`, ""); w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") != "60" {
		t.Fatalf("ip block: %d", w.Code)
	}
}

func TestPasswordChangeRevokesOlderTokens(t *testing.T) {
	f := newAccountFixture(t, nil)
	if w := f.do(t, http.MethodPut, PasswordPattern, `{"currentPassword":"nope","newPassword":"brand new pass"}`, "alice"); w.Code != http.StatusUnauthorized || decode(t, w)["detail"] != "La contraseña actual no es correcta." {
		t.Fatalf("wrong current: %d %s", w.Code, w.Body)
	}
	if w := f.do(t, http.MethodPut, PasswordPattern, `{"currentPassword":"correct horse","newPassword":"short"}`, "alice"); w.Code != http.StatusBadRequest {
		t.Fatalf("short: %d", w.Code)
	}
	w := f.do(t, http.MethodPut, PasswordPattern, `{"current_password":"correct horse","new_password":"brand new pass"}`, "alice")
	if w.Code != http.StatusOK {
		t.Fatalf("change: %d %s", w.Code, w.Body)
	}
	_, version, err := sessionauth.VerifySession(decode(t, w)["token"].(string), []byte(secret), fixedNow)
	if err != nil || version != 3 {
		t.Fatalf("new token version %d %v", version, err)
	}
	if w := f.do(t, http.MethodPut, PasswordPattern, `{"currentPassword":"x"}`, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", w.Code)
	}
	if w := f.do(t, http.MethodPut, PasswordPattern, `{"currentPassword":"x"}`, "alice"); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("missing field: %d", w.Code)
	}
}

func TestEmailChangeRules(t *testing.T) {
	f := newAccountFixture(t, nil)
	hash, _ := quickHash("bob password")
	f.store.users["bob"] = &memAccount{hash: hash}
	for _, tc := range []struct {
		body, detail string
		status       int
	}{
		{`{"email":"b@x.io","password":"wrong"}`, "La contraseña actual no es correcta.", 401},
		{`{"email":"bad","password":"bob password"}`, "Introduce un email válido.", 400},
		{`{"email":"   ","password":"bob password"}`, "El email de recuperación no puede quedar vacío.", 400},
		{`{"email":"alice@example.com","password":"bob password"}`, "Ese email ya está asociado a otra cuenta.", 409},
	} {
		w := f.do(t, http.MethodPut, EmailPattern, tc.body, "bob")
		if w.Code != tc.status || decode(t, w)["detail"] != tc.detail {
			t.Errorf("%s: %d %s", tc.body, w.Code, w.Body)
		}
	}
	w := f.do(t, http.MethodPut, EmailPattern, `{"email":" Bob@X.io ","password":"bob password"}`, "bob")
	if w.Code != http.StatusOK || w.Body.String() != `{"username":"bob","email":"bob@x.io"}` {
		t.Fatalf("change: %d %q", w.Code, w.Body)
	}
}

func TestDeleteAccountPurgesThenDeletes(t *testing.T) {
	f := newAccountFixture(t, nil)
	if w := f.do(t, http.MethodPost, DeleteAccountPattern, `{"password":"nope"}`, "alice"); w.Code != http.StatusUnauthorized || len(f.purges) != 0 {
		t.Fatalf("wrong password: %d", w.Code)
	}
	w := f.do(t, http.MethodPost, DeleteAccountPattern, `{"password":"correct horse"}`, "alice")
	if w.Code != http.StatusOK || w.Body.String() != `{"deleted":true,"username":"alice","deletedGames":4}` {
		t.Fatalf("delete: %d %s", w.Code, w.Body)
	}
	f = newAccountFixture(t, nil)
	f.purgeErr = userdata.ErrUnavailable
	if w := f.do(t, http.MethodPost, DeleteAccountPattern, `{"password":"correct horse"}`, "alice"); w.Code != http.StatusServiceUnavailable || len(f.store.deleted) != 0 {
		t.Fatalf("purge failure keeps the account: %d %v", w.Code, f.store.deleted)
	}
}

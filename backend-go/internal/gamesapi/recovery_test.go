package gamesapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/accountstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
)

type fakeMailer struct{ sent []string }

func (f *fakeMailer) Send(_ context.Context, email, link string) bool {
	f.sent = append(f.sent, email+" "+link)
	return true
}

type emailAccounts struct{ store *fakeAccountStore }

func (e emailAccounts) ForLogin(ctx context.Context, identity string) (accountstore.LoginAccount, bool, error) {
	owner, found, err := e.store.EmailOwner(ctx, identity)
	if !found || err != nil {
		return accountstore.LoginAccount{}, false, err
	}
	return e.store.ByUsername(ctx, owner)
}

func newRecoveryFixture(t *testing.T, enabled bool) (*RecoveryHandler, *fakeAccountStore, *fakeMailer) {
	t.Helper()
	hash, _ := quickHash("correct horse")
	store := &fakeAccountStore{users: map[string]*memAccount{"alice": {hash: hash, email: "alice@example.com", version: 1}}}
	mailer := &fakeMailer{}
	h, err := NewRecovery(RecoveryConfig{
		Config:               Config{Accounts: fakeAccounts{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		LoginAccounts:        emailAccounts{store},
		Store:                store,
		Mailer:               mailer,
		Touch:                &fakeTouch{},
		EmailRecoveryEnabled: enabled,
		ResetURL:             "https://chess.example/app?x=1",
		Hash:                 quickHash,
	})
	if err != nil {
		t.Fatal(err)
	}
	return h, store, mailer
}

func recoveryPost(t *testing.T, h *RecoveryHandler, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	r.Header.Set("Content-Type", jsonCT)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestForgotPasswordNeverRevealsAccounts(t *testing.T) {
	h, _, mailer := newRecoveryFixture(t, true)
	const generic = `{"ok":true,"message":"Si ese email está registrado, recibirás un enlace de recuperación."}`
	for _, email := range []string{" ALICE@example.com ", "nobody@example.com", ""} {
		w := recoveryPost(t, h, ForgotPasswordPattern, `{"email":"`+email+`"}`)
		if w.Code != http.StatusOK || w.Body.String() != generic {
			t.Fatalf("%q: %d %s", email, w.Code, w.Body)
		}
	}
	if len(mailer.sent) != 1 || !strings.HasPrefix(mailer.sent[0], "alice@example.com https://chess.example/app?x=1&resetToken=") {
		t.Fatalf("sent %v", mailer.sent)
	}
	if w := recoveryPost(t, h, ForgotPasswordPattern, `{"email":"not-an-email"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("invalid email: %d", w.Code)
	}
	off, _, _ := newRecoveryFixture(t, false)
	if w := recoveryPost(t, off, ForgotPasswordPattern, `{"email":"a@x.io"}`); w.Code != http.StatusNotFound || decode(t, w)["detail"] != "Recuperación por email no habilitada." {
		t.Fatalf("disabled: %d %s", w.Code, w.Body)
	}
	if w := recoveryPost(t, off, ForgotPasswordPattern, `{}`); w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("validation before the 404: %d", w.Code)
	}
}

func TestResetPasswordUsesTheLinkOnce(t *testing.T) {
	h, store, mailer := newRecoveryFixture(t, true)
	recoveryPost(t, h, ForgotPasswordPattern, `{"email":"alice@example.com"}`)
	link := mailer.sent[0]
	token := link[strings.Index(link, "resetToken=")+len("resetToken="):]
	if w := recoveryPost(t, h, ResetPasswordPattern, `{"token":"`+token+`","newPassword":"short"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("short: %d", w.Code)
	}
	w := recoveryPost(t, h, ResetPasswordPattern, `{"token":"`+token+`","new_password":"brand new pass"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("reset: %d %s", w.Code, w.Body)
	}
	_, version, err := sessionauth.VerifySession(decode(t, w)["token"].(string), []byte(secret), fixedNow)
	if err != nil || version != 2 || store.users["alice"].version != 2 {
		t.Fatalf("token version %d %v", version, err)
	}
	// The password moved: the same link is dead.
	w = recoveryPost(t, h, ResetPasswordPattern, `{"token":"`+token+`","newPassword":"another pass"}`)
	if w.Code != http.StatusBadRequest || decode(t, w)["detail"] != "El enlace de recuperación no es válido o ha caducado." {
		t.Fatalf("reused link: %d %s", w.Code, w.Body)
	}
	if w := recoveryPost(t, h, ResetPasswordPattern, `{"token":"garbage","newPassword":"another pass"}`); w.Code != http.StatusBadRequest {
		t.Fatalf("garbage: %d", w.Code)
	}
}

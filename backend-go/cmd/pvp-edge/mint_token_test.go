package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
)

type fakeAuthState struct {
	exists  bool
	version int64
	err     error
	asked   string
}

func (f *fakeAuthState) AuthState(_ context.Context, username string) (bool, int64, error) {
	f.asked = username
	return f.exists, f.version, f.err
}

func TestMintOwnerDefaults(t *testing.T) {
	none := func(string) string { return "" }
	if got := mintOwner(nil, none); got != "evilsysadmin" {
		t.Fatalf("default owner = %q", got)
	}
	fromEnv := func(k string) string {
		if k == "CHESS_PVP_SPARRING_OWNER" {
			return "  Stan "
		}
		return ""
	}
	if got := mintOwner(nil, fromEnv); got != "stan" {
		t.Fatalf("env owner = %q", got)
	}
	if got := mintOwner([]string{"Otto"}, fromEnv); got != "otto" {
		t.Fatalf("arg owner = %q", got)
	}
}

func TestMintTokenSignsTheOwnersSessionVersion(t *testing.T) {
	secret := []byte("mint-secret")
	now := time.Unix(1_790_000_000, 0)
	accounts := &fakeAuthState{exists: true, version: 7}
	var out bytes.Buffer
	if err := mintToken(context.Background(), &out, accounts, "evilsysadmin", secret, now); err != nil {
		t.Fatal(err)
	}
	line := strings.TrimSpace(out.String())
	token, ok := strings.CutPrefix(line, "PVP_BROWSER_TOKEN=")
	if !ok {
		t.Fatalf("line = %q", line)
	}
	subject, version, err := sessionauth.VerifySession(token, secret, now)
	if err != nil || subject != "evilsysadmin" || version != 7 {
		t.Fatalf("token = %q %d %v", subject, version, err)
	}
}

func TestMintTokenFailureReasons(t *testing.T) {
	secret := []byte("s")
	cases := map[string]struct {
		accounts *fakeAuthState
		secret   []byte
	}{
		"owner-account-missing":        {&fakeAuthState{}, secret},
		"owner-auth-state-unavailable": {&fakeAuthState{err: errors.New("down")}, secret},
		"jwt-secret-missing":           {&fakeAuthState{exists: true}, nil},
	}
	for want, tc := range cases {
		var out bytes.Buffer
		err := mintToken(context.Background(), &out, tc.accounts, "x", tc.secret, time.Now())
		if err == nil || err.Error() != want || out.Len() != 0 {
			t.Fatalf("%s: err=%v out=%q", want, err, out.String())
		}
	}
}

package main

// `api-edge mint-token [username]` is the deploy's owner-token helper once
// Python is retired: it replaces `python - <<PY ... auth.create_token(owner,
// users_store.get_auth_state(owner).session_version)` in the staging probes.
// The username defaults to CHESS_PVP_SPARRING_OWNER (evilsysadmin), and the
// output line keeps the probes' contract: PVP_BROWSER_TOKEN=<jwt>, or a
// "<prefix>_FAIL reason=..." exit when the owner cannot be resolved.

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/accountstore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/mongoruntime"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
)

type authStateReader interface {
	AuthState(ctx context.Context, username string) (bool, int64, error)
}

func mintOwner(args []string, getenv func(string) string) string {
	owner := ""
	if len(args) > 0 {
		owner = args[0]
	}
	if strings.TrimSpace(owner) == "" {
		owner = getenv("CHESS_PVP_SPARRING_OWNER")
	}
	owner = strings.ToLower(strings.TrimSpace(owner))
	if owner == "" {
		owner = "evilsysadmin"
	}
	return owner
}

// mintToken writes the token line, or returns the failure reason.
func mintToken(ctx context.Context, out io.Writer, accounts authStateReader, owner string, secret []byte, now time.Time) error {
	if len(secret) == 0 {
		return fmt.Errorf("jwt-secret-missing")
	}
	exists, version, err := accounts.AuthState(ctx, owner)
	if err != nil {
		return fmt.Errorf("owner-auth-state-unavailable")
	}
	if !exists {
		return fmt.Errorf("owner-account-missing")
	}
	token, err := sessionauth.Sign(owner, version, secret, now)
	if err != nil {
		return fmt.Errorf("token-sign-failed")
	}
	_, err = fmt.Fprintf(out, "PVP_BROWSER_TOKEN=%s\n", token)
	return err
}

func runMintToken(args []string) int {
	prefix := strings.TrimSpace(os.Getenv("MINT_TOKEN_FAIL_PREFIX"))
	if prefix == "" {
		prefix = "PVP_BROWSER_AUTH"
	}
	fail := func(reason string) int {
		fmt.Fprintf(os.Stderr, "%s_FAIL reason=%s\n", prefix, reason)
		return 1
	}
	mongoURL := strings.TrimSpace(os.Getenv("MONGO_URL"))
	database := strings.TrimSpace(os.Getenv("MONGO_DB_NAME"))
	secret := []byte(strings.TrimSpace(os.Getenv("JWT_SECRET")))
	if mongoURL == "" || database == "" {
		return fail("owner-auth-state-unavailable")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	runtime, err := mongoruntime.New(ctx, mongoruntime.Config{
		URL:             mongoURL,
		Database:        database,
		QueryTimeout:    envDurationMS("PVP_MONGO_TIMEOUT_MS", 2000*time.Millisecond),
		ApplicationName: mongoruntime.DefaultApplicationName,
	})
	if err != nil {
		return fail("owner-auth-state-unavailable")
	}
	defer func() {
		closeCtx, closeCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer closeCancel()
		_ = runtime.Close(closeCtx)
	}()
	accounts := accountstore.New(runtime.Database(), runtime.QueryTimeout())
	if err := mintToken(ctx, os.Stdout, accounts, mintOwner(args, os.Getenv), secret, time.Now()); err != nil {
		return fail(err.Error())
	}
	return 0
}

package identityauth

import (
	"context"
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestOnlyChessAudienceAccepted(t *testing.T) {
	f := setup(t)
	for _, audience := range []string{"chronicles", "cka-simulator", "chess-studio:admin", ""} {
		c := f.claims
		c.Audience = audience
		if _, err := f.verifier.Verify(t.Context(), sign(t, f.private, c, nil), f.now); !errors.Is(err, ErrInvalid) {
			t.Errorf("accepted foreign audience %q: %v", audience, err)
		}
	}
	if f.jwks.Load() != 0 || f.fresh.Load() != 0 {
		t.Fatal("foreign audience caused an authority request")
	}
}

func TestConcurrentRequestsShareKeysButNeverFreshness(t *testing.T) {
	f := setup(t)
	token := sign(t, f.private, f.claims, nil)
	const count = 16
	var workers sync.WaitGroup
	for range count {
		workers.Go(func() {
			if _, err := f.verifier.Verify(t.Context(), token, f.now); err != nil {
				t.Errorf("concurrent verification denied: %v", err)
			}
		})
	}
	workers.Wait()
	if f.jwks.Load() != 1 || f.fresh.Load() != count {
		t.Fatalf("unexpected requests: keys=%d freshness=%d", f.jwks.Load(), f.fresh.Load())
	}
}

func TestUnavailableKeysCannotUseExpiredCache(t *testing.T) {
	f := setup(t)
	if _, err := f.verifier.Verify(t.Context(), sign(t, f.private, f.claims, nil), f.now); err != nil {
		t.Fatal(err)
	}
	f.now = f.now.Add(6 * time.Minute)
	f.claims.Issued = f.now.Unix() - 1
	f.claims.NotBefore = f.claims.Issued
	f.claims.Expires = f.now.Unix() + 100
	f.mode.Store("jwks down")
	token := sign(t, f.private, f.claims, nil)
	for range 2 {
		if c, err := f.verifier.Verify(t.Context(), token, f.now); !errors.Is(err, ErrUnavailable) || c != (Claims{}) {
			t.Fatal("expired public-key cache authenticated during outage", err)
		}
	}
	if f.jwks.Load() != 2 || f.fresh.Load() != 1 {
		t.Fatal("failed key fetch was not bounded or reached freshness")
	}
}

func TestUnknownKeyFetchIsBoundedAndNeverAuthenticates(t *testing.T) {
	f := setup(t)
	for range 10 {
		token := sign(t, f.private, f.claims, map[string]string{"alg": "EdDSA", "typ": "JWT", "kid": "unknown"})
		if _, err := f.verifier.Verify(t.Context(), token, f.now); !errors.Is(err, ErrInvalid) {
			t.Fatal("unknown key accepted", err)
		}
	}
	if f.jwks.Load() != 1 || f.fresh.Load() != 0 {
		t.Fatal("unknown key caused unbounded key fetching or freshness requests")
	}
}

func TestTLSCertificateMustBeTrusted(t *testing.T) {
	f := setup(t)
	transport := f.verifier.client.Transport.(*http.Transport).Clone()
	transport.TLSClientConfig.RootCAs = x509.NewCertPool()
	t.Cleanup(transport.CloseIdleConnections)
	f.verifier.client.Transport = transport
	if c, err := f.verifier.Verify(t.Context(), sign(t, f.private, f.claims, nil), f.now); !errors.Is(err, ErrUnavailable) || c != (Claims{}) {
		t.Fatal("untrusted TLS certificate authenticated", err)
	}
	if f.jwks.Load() != 0 || f.fresh.Load() != 0 {
		t.Fatal("HTTP request reached an untrusted TLS server")
	}
}

func TestConstructorClonesClientAndRemovesCookiesAndRedirects(t *testing.T) {
	f := setup(t)
	jar, _ := cookiejar.New(nil)
	origin, _ := url.Parse(Issuer)
	jar.SetCookies(origin, []*http.Cookie{{Name: "browser-session", Value: "must-stay-private"}})
	redirects := 0
	client := &http.Client{Transport: f.verifier.client.Transport, Jar: jar, Timeout: time.Minute}
	client.CheckRedirect = func(*http.Request, []*http.Request) error {
		redirects++
		return nil
	}
	v, err := NewStagingVerifierWithClient("staging", f.verifier.credential, client)
	if err != nil {
		t.Fatal(err)
	}
	f.mode.Store("redirect")
	if _, err := v.Verify(t.Context(), sign(t, f.private, f.claims, nil), f.now); !errors.Is(err, ErrUnavailable) {
		t.Fatal("redirect treated as freshness evidence", err)
	}
	if redirects != 0 || client.Jar != jar || client.Timeout != time.Minute || v.client.Jar != nil || v.client.Timeout != 2*time.Second {
		t.Fatal("caller client mutated or unsafe client configuration retained")
	}
}

func TestExpiryIsRecheckedAfterAuthorityRequests(t *testing.T) {
	f := setup(t)
	f.claims.Expires = f.now.Unix() + 1
	// Start one nanosecond before expiry. Actual TLS requests cross that bound
	// without relying on a wall-clock sleep or a fake successful authority.
	now := time.Unix(f.claims.Expires, 0).Add(-time.Nanosecond)
	if c, err := f.verifier.Verify(t.Context(), sign(t, f.private, f.claims, nil), now); !errors.Is(err, ErrInvalid) || c != (Claims{}) {
		t.Fatal("token expired during authority round-trip authenticated", err)
	}
	if f.fresh.Load() != 1 {
		t.Fatal("test did not cross an actual freshness round-trip")
	}
}

func TestCanceledContextAndUninitializedVerifierDenyWithoutHTTP(t *testing.T) {
	f := setup(t)
	token := sign(t, f.private, f.claims, nil)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	for _, v := range []*Verifier{nil, {}, f.verifier} {
		if _, err := v.Verify(ctx, token, f.now); !errors.Is(err, ErrInvalid) {
			t.Fatal("uninitialized or canceled verifier accepted a token", err)
		}
	}
	if _, err := f.verifier.Verify(nil, token, f.now); !errors.Is(err, ErrInvalid) {
		t.Fatal("nil context accepted")
	}
	if f.jwks.Load() != 0 || f.fresh.Load() != 0 {
		t.Fatal("canceled verification reached the authority")
	}
}

func TestMalformedHeaderAndClaimShapesNeverReachAuthority(t *testing.T) {
	f := setup(t)
	encode := base64.RawURLEncoding.EncodeToString
	header := `{"alg":"EdDSA","typ":"JWT","kid":"fixture"}`
	payload, _ := json.Marshal(f.claims)
	for _, h := range []string{header + " {}", `{"alg":"EdDSA","typ":"JWT","kid":"fixture","jku":"https://evil.invalid"}`, `{"alg":"EdDSA","kid":"fixture"}`} {
		message := encode([]byte(h)) + "." + encode(payload)
		token := message + "." + encode(ed25519.Sign(f.private, []byte(message)))
		if _, err := f.verifier.Verify(t.Context(), token, f.now); !errors.Is(err, ErrInvalid) {
			t.Fatal("malformed header accepted", err)
		}
	}
	for _, token := range []string{"", "not.a.jwt", strings.Repeat("a", 8193)} {
		if _, err := f.verifier.Verify(t.Context(), token, f.now); !errors.Is(err, ErrInvalid) {
			t.Fatal("malformed token accepted", err)
		}
	}
	if f.jwks.Load() != 0 || f.fresh.Load() != 0 {
		t.Fatal("malformed token reached the authority")
	}
}

func TestRecognizesOnlySelectsCentralIssuerWithoutAuthenticating(t *testing.T) {
	f := setup(t)
	token := sign(t, f.private, f.claims, nil)
	parts := strings.Split(token, ".")
	unsigned := parts[0] + "." + parts[1] + ".invalid"
	if !Recognizes(unsigned) {
		t.Fatal("central issuer was not recognized for verification")
	}
	if _, err := f.verifier.Verify(t.Context(), unsigned, f.now); !errors.Is(err, ErrInvalid) {
		t.Fatal("issuer selection authenticated an unsigned token")
	}
	for _, issuer := range []string{"https://id.shadowops.dpdns.org", "https://api-staging.chess-studio.shadowops.dpdns.org", "https://evil.invalid"} {
		c := f.claims
		c.Issuer = issuer
		if Recognizes(sign(t, f.private, c, nil)) {
			t.Fatal("unrelated issuer selected as central staging")
		}
	}
}

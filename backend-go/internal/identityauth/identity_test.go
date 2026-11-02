package identityauth

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

const testSubject = "11111111-1111-4111-8111-111111111111"

type fixture struct {
	verifier *Verifier
	claims   Claims
	private  ed25519.PrivateKey
	public   ed25519.PublicKey
	now      time.Time
	mode     atomic.Value
	fresh    atomic.Int64
	jwks     atomic.Int64
}

func setup(t *testing.T) *fixture {
	t.Helper()
	public, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	credential := "soc1_" + base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{0x44}, 32))
	v, err := NewStagingVerifier("staging", credential)
	if err != nil {
		t.Fatal(err)
	}
	f := &fixture{verifier: v, private: private, public: public, now: time.Now()}
	f.mode.Store("active")
	f.claims = Claims{Issuer: Issuer, Audience: Audience, Subject: testSubject, Version: 7, JTI: base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{0x55}, 16)), Issued: f.now.Unix() - 2, NotBefore: f.now.Unix() - 2, Expires: f.now.Unix() + 100}
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != "id-staging.shadowops.dpdns.org" || r.TLS == nil || r.TLS.ServerName != "id-staging.shadowops.dpdns.org" {
			t.Error("request escaped the pinned TLS origin")
		}
		if r.Header.Get("User-Agent") != "ShadowOps-Chess-Identity/1" || r.Header.Get("Accept") != "application/json" {
			t.Error("missing declared client headers")
		}
		switch r.URL.Path {
		case "/api/identity/jwks":
			f.jwks.Add(1)
			if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
				t.Error("public key request leaked a credential")
			}
			if f.mode.Load().(string) == "jwks down" {
				http.Error(w, "unavailable", 503)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]string{"kty": "OKP", "crv": "Ed25519", "use": "sig", "alg": "EdDSA", "kid": "fixture", "x": base64.RawURLEncoding.EncodeToString(public)}}})
		case "/api/identity/freshness":
			f.fresh.Add(1)
			if r.Header.Get("Authorization") != "Bearer "+credential || r.Header.Get("Origin") != "" || r.Header.Get("Cookie") != "" {
				t.Error("freshness did not use independent service authentication")
				http.Error(w, "denied", 401)
				return
			}
			var body struct {
				Subject string `json:"subject"`
				Version int64  `json:"session_version"`
				JTI     string `json:"token_jti"`
			}
			d := json.NewDecoder(r.Body)
			d.DisallowUnknownFields()
			if d.Decode(&body) != nil || body.Subject != f.claims.Subject || body.Version != f.claims.Version || body.JTI != f.claims.JTI {
				t.Error("freshness request did not match verified claims")
				http.Error(w, "denied", 401)
				return
			}
			e := map[string]any{"issuer": f.claims.Issuer, "audience": Audience, "subject": body.Subject, "session_version": body.Version, "token_jti": body.JTI, "checked_at": f.now.Unix(), "account_active": true, "session_active": true, "token_active": true}
			switch f.mode.Load().(string) {
			case "revoked":
				http.Error(w, "denied", 401)
				return
			case "down":
				http.Error(w, "unavailable", 503)
				return
			case "redirect":
				http.Redirect(w, r, "https://evil.example", 302)
				return
			case "old":
				e["checked_at"] = f.now.Unix() - 3
			case "future":
				e["checked_at"] = f.now.Unix() + 5
			case "minint":
				e["checked_at"] = int64(math.MinInt64)
			case "wrong audience":
				e["audience"] = "chronicles"
			case "wrong subject":
				e["subject"] = "22222222-2222-4222-8222-222222222222"
			case "wrong issuer":
				e["issuer"] = "https://id.shadowops.dpdns.org"
			case "wrong version":
				e["session_version"] = 8
			case "wrong jti":
				e["token_jti"] = "another-jti"
			case "account inactive":
				e["account_active"] = false
			case "session inactive":
				e["session_active"] = false
			case "token inactive":
				e["token_active"] = false
			case "missing time":
				delete(e, "checked_at")
			case "extra":
				e["admin"] = true
			}
			_ = json.NewEncoder(w).Encode(e)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	// Real TLS, pinned Host/SNI and a synthetic certificate for the actual IdP
	// name. Only dialing is redirected to loopback; verification is never disabled.
	template := &x509.Certificate{SerialNumber: big.NewInt(1), DNSNames: []string{"id-staging.shadowops.dpdns.org"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, template, template, public, private)
	if err != nil {
		t.Fatal(err)
	}
	certificate, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	roots := x509.NewCertPool()
	roots.AddCert(certificate)
	server.TLS = &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: private}}, MinVersion: tls.VersionTLS12}
	server.StartTLS()
	transport := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		if address != "id-staging.shadowops.dpdns.org:443" {
			return nil, errors.New("unapproved authority")
		}
		return (&net.Dialer{}).DialContext(ctx, network, server.Listener.Addr().String())
	}
	t.Cleanup(transport.CloseIdleConnections)
	v, err = NewStagingVerifierWithClient("staging", credential, &http.Client{Transport: transport})
	if err != nil {
		t.Fatal(err)
	}
	f.verifier = v
	return f
}

func sign(t *testing.T, private ed25519.PrivateKey, c Claims, header map[string]string) string {
	t.Helper()
	if header == nil {
		header = map[string]string{"alg": "EdDSA", "typ": "JWT", "kid": "fixture"}
	}
	h, _ := json.Marshal(header)
	p, _ := json.Marshal(c)
	message := base64.RawURLEncoding.EncodeToString(h) + "." + base64.RawURLEncoding.EncodeToString(p)
	return message + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(private, []byte(message)))
}

func TestVerifyChecksLiveFreshnessEveryTimeEvenWithValidSignatureAndCachedKey(t *testing.T) {
	f := setup(t)
	token := sign(t, f.private, f.claims, nil)
	for range 2 {
		c, err := f.verifier.Verify(context.Background(), token, f.now)
		if err != nil || c.Subject != testSubject {
			t.Fatal("valid central account denied", err)
		}
	}
	if f.jwks.Load() != 1 || f.fresh.Load() != 2 {
		t.Fatal("keys not cached or freshness evidence cached")
	}
	f.mode.Store("revoked")
	if c, err := f.verifier.Verify(context.Background(), token, f.now); !errors.Is(err, ErrInvalid) || c != (Claims{}) {
		t.Fatal("revoked token authenticated", err)
	}
	if f.fresh.Load() != 3 {
		t.Fatal("did not consult authority after revocation")
	}
}

func TestFreshnessRejectsMismatchStaleEvidenceAndServiceFailure(t *testing.T) {
	f := setup(t)
	token := sign(t, f.private, f.claims, nil)
	for _, mode := range []string{"revoked", "old", "future", "minint", "wrong audience", "wrong subject", "wrong issuer", "wrong version", "wrong jti", "account inactive", "session inactive", "token inactive", "missing time", "extra", "down", "redirect"} {
		t.Run(mode, func(t *testing.T) {
			f.mode.Store(mode)
			if c, err := f.verifier.Verify(context.Background(), token, f.now); err == nil || c != (Claims{}) {
				t.Fatal("bad authority response authenticated")
			}
		})
	}
	f.mode.Store("active")
	if _, err := f.verifier.Verify(context.Background(), token, f.now); err != nil {
		t.Fatal("recovered authority still denied", err)
	}
}

func TestInvalidJWTNeverReachesFreshnessAuthority(t *testing.T) {
	f := setup(t)
	for name, change := range map[string]func(*Claims){
		"other environment":    func(c *Claims) { c.Issuer = "https://id.shadowops.dpdns.org" },
		"other audience":       func(c *Claims) { c.Audience = "cka-simulator" },
		"legacy subject":       func(c *Claims) { c.Subject = "alice" },
		"noncanonical subject": func(c *Claims) { c.Subject = "11111111-1111-4111-8111-11111111111A" },
		"zero version":         func(c *Claims) { c.Version = 0 },
		"missing jti":          func(c *Claims) { c.JTI = "" },
		"future":               func(c *Claims) { c.Issued = f.now.Unix() + 1; c.NotBefore = c.Issued },
		"not before":           func(c *Claims) { c.NotBefore = f.now.Unix() + 1 },
		"expired":              func(c *Claims) { c.Expires = f.now.Unix() },
		"long lifetime":        func(c *Claims) { c.Expires = c.Issued + 121 },
	} {
		t.Run(name, func(t *testing.T) {
			c := f.claims
			change(&c)
			if _, err := f.verifier.Verify(t.Context(), sign(t, f.private, c, nil), f.now); !errors.Is(err, ErrInvalid) {
				t.Fatal("invalid JWT accepted", err)
			}
		})
	}
	_, forger, _ := ed25519.GenerateKey(nil)
	if _, err := f.verifier.Verify(t.Context(), sign(t, forger, f.claims, nil), f.now); !errors.Is(err, ErrInvalid) {
		t.Fatal("forged signature accepted", err)
	}
	for _, alg := range []string{"none", "HS256"} {
		if _, err := f.verifier.Verify(t.Context(), sign(t, f.private, f.claims, map[string]string{"alg": alg, "typ": "JWT", "kid": "fixture"}), f.now); !errors.Is(err, ErrInvalid) {
			t.Fatal("wrong algorithm accepted", err)
		}
	}
	if f.fresh.Load() != 0 {
		t.Fatal("unverified JWT reached freshness authority")
	}
}

func TestConstructorCannotEnableCentralStagingInOtherEnvironments(t *testing.T) {
	key := "soc1_" + base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{0x44}, 32))
	for _, environment := range []string{"", "production", "development", "Staging"} {
		if _, err := NewStagingVerifier(environment, key); err == nil {
			t.Fatal("cross-environment configuration accepted")
		}
	}
	for _, credential := range []string{"", "user-password", "so1_opaque-session", "eyJhbGciOiJFZERTQSJ9.e30.signature"} {
		if _, err := NewStagingVerifier("staging", credential); err == nil {
			t.Fatal("user proof used as service credential")
		}
	}
}

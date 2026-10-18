package ssoauth

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestKeyIsStableAndBoundToTheSecret(t *testing.T) {
	a, kidA, _ := Key([]byte("secret-one"))
	b, kidB, _ := Key([]byte("secret-one"))
	c, kidC, _ := Key([]byte("secret-two"))
	if !a.Equal(b) || kidA != kidB {
		t.Fatal("same secret must give the same key")
	}
	if a.Equal(c) || kidA == kidC {
		t.Fatal("another secret must give another key")
	}
	if _, _, err := Key(nil); err == nil {
		t.Fatal("an empty secret must be refused")
	}
}

func TestSignAndVerify(t *testing.T) {
	key, kid, _ := Key([]byte("secret"))
	now := time.Unix(1_800_000_000, 0)
	claims := Claims{Issuer: Issuer("staging"), Audience: "chronicles", Subject: "evilsysadmin", SessionVersion: 3, IssuedAt: now.Unix(), ExpiresAt: now.Add(TokenLifetime).Unix()}
	token, err := Sign(key, kid, claims)
	if err != nil {
		t.Fatal(err)
	}
	keys := map[string]ed25519.PublicKey{kid: key.Public().(ed25519.PublicKey)}
	got, err := Verify(token, keys, Issuer("staging"), "chronicles", now)
	if err != nil || got != claims {
		t.Fatalf("verify: %+v %v", got, err)
	}
	for name, check := range map[string]func() error{
		"other audience": func() error { _, err := Verify(token, keys, Issuer("staging"), "chess", now); return err },
		"other issuer":   func() error { _, err := Verify(token, keys, Issuer("production"), "chronicles", now); return err },
		"expired":        func() error { _, err := Verify(token, keys, Issuer("staging"), "chronicles", now.Add(2*TokenLifetime)); return err },
		"tampered": func() error {
			parts := strings.Split(token, ".")
			forged, _ := json.Marshal(Claims{Issuer: claims.Issuer, Audience: "chronicles", Subject: "admin", ExpiresAt: claims.ExpiresAt})
			_, err := Verify(parts[0]+"."+b64(forged)+"."+parts[2], keys, Issuer("staging"), "chronicles", now)
			return err
		},
		"unknown key": func() error {
			other, _, _ := Key([]byte("other"))
			_, err := Verify(token, map[string]ed25519.PublicKey{kid: other.Public().(ed25519.PublicKey)}, Issuer("staging"), "chronicles", now)
			return err
		},
	} {
		if check() == nil {
			t.Fatalf("%s: must be rejected", name)
		}
	}
}

func TestJWKSPublishesTheKeyUnderItsKid(t *testing.T) {
	key, kid, _ := Key([]byte("secret"))
	var set struct {
		Keys []map[string]string `json:"keys"`
	}
	if err := json.Unmarshal(JWKS(key.Public().(ed25519.PublicKey)), &set); err != nil || len(set.Keys) != 1 {
		t.Fatalf("jwks: %v %+v", err, set)
	}
	if set.Keys[0]["kid"] != kid || set.Keys[0]["crv"] != "Ed25519" || set.Keys[0]["alg"] != "EdDSA" {
		t.Fatalf("jwks key: %+v", set.Keys[0])
	}
}

func TestGameOriginsArePinnedPerEnvironment(t *testing.T) {
	if Audience("staging", "https://staging.chronicles.shadowops.dpdns.org") != "chronicles" {
		t.Fatal("staging Chronicles must be a game origin")
	}
	if Audience("production", "https://staging.chronicles.shadowops.dpdns.org") != "" {
		t.Fatal("production must not vouch for staging origins")
	}
	if Audience("staging", "https://evil.example") != "" || Audience("staging", "http://localhost:4173") != "" {
		t.Fatal("unknown and local origins are not games in staging")
	}
	if Audience("ci", "http://localhost:4173") != "chronicles" {
		t.Fatal("local development accepts the local game")
	}
}

func b64(raw []byte) string { return base64.RawURLEncoding.EncodeToString(raw) }

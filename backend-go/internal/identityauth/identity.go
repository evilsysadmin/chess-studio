// Package identityauth accepts the independent staging ShadowOps Identity.
// It verifies short JWTs and checks live server-side freshness on EVERY call.
// It is independent of the Identity runtime and legacy Chess IdP verifier.
package identityauth

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

const Issuer = "https://id-staging.shadowops.dpdns.org"
const Audience = "chess-studio"

var ErrInvalid = errors.New("invalid central Identity session")
var ErrUnavailable = errors.New("central Identity unavailable")

type Claims struct {
	Issuer    string `json:"iss"`
	Audience  string `json:"aud"`
	Subject   string `json:"sub"`
	Version   int64  `json:"sv"`
	JTI       string `json:"jti"`
	Issued    int64  `json:"iat"`
	NotBefore int64  `json:"nbf"`
	Expires   int64  `json:"exp"`
}

type Verifier struct {
	credential  string
	client      *http.Client
	mu          sync.Mutex
	keys        map[string]ed25519.PublicKey
	lastFetch   time.Time
	fetched     time.Time
	fetchFailed bool
}

func NewStagingVerifier(environment, credential string) (*Verifier, error) {
	return NewStagingVerifierWithClient(environment, credential, &http.Client{})
}

// NewStagingVerifierWithClient supports an explicitly trusted transport (for
// instrumentation or isolated TLS tests). It still pins endpoints, disables
// redirects/cookie jars and bounds requests; no URL comes from user input.
func NewStagingVerifierWithClient(environment, credential string, client *http.Client) (*Verifier, error) {
	if environment != "staging" || !canonical(credential, "soc1_", 32) || client == nil {
		return nil, ErrInvalid
	}
	configured := *client
	configured.Timeout = 2 * time.Second
	configured.Jar = nil
	configured.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Verifier{credential: credential, keys: make(map[string]ed25519.PublicKey),
		client: &configured}, nil
}

func canonical(value, prefix string, size int) bool {
	if !strings.HasPrefix(value, prefix) || len(value) > 128 {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(value[len(prefix):])
	return err == nil && len(raw) == size && base64.RawURLEncoding.EncodeToString(raw) == value[len(prefix):]
}

func subjectValid(subject string) bool {
	if len(subject) != 36 || strings.ToLower(subject) != subject ||
		subject[8] != '-' || subject[13] != '-' || subject[18] != '-' || subject[23] != '-' ||
		subject[14] != '4' || !strings.ContainsRune("89ab", rune(subject[19])) {
		return false
	}
	raw, err := hex.DecodeString(strings.ReplaceAll(subject, "-", ""))
	return err == nil && len(raw) == 16
}

// Recognizes selects a verification path only; it never authenticates claims.
func Recognizes(raw string) bool {
	if len(raw) > 8192 {
		return false
	}
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return false
	}
	data, err := base64.RawURLEncoding.DecodeString(parts[1])
	var c struct {
		Issuer string `json:"iss"`
	}
	return err == nil && json.Unmarshal(data, &c) == nil && c.Issuer == Issuer
}

func (v *Verifier) Verify(ctx context.Context, raw string, now time.Time) (Claims, error) {
	if v == nil || v.client == nil || ctx == nil || ctx.Err() != nil || len(raw) > 8192 {
		return Claims{}, ErrInvalid
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return Claims{}, ErrInvalid
	}
	head, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || base64.RawURLEncoding.EncodeToString(head) != parts[0] {
		return Claims{}, ErrInvalid
	}
	var header struct {
		Alg  string `json:"alg"`
		Type string `json:"typ"`
		Kid  string `json:"kid"`
	}
	if decodeBounded(bytes.NewReader(head), &header) != nil || header.Alg != "EdDSA" || header.Type != "JWT" || header.Kid == "" || len(header.Kid) > 128 {
		return Claims{}, ErrInvalid
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || base64.RawURLEncoding.EncodeToString(payload) != parts[1] {
		return Claims{}, ErrInvalid
	}
	var c Claims
	if decodeBounded(bytes.NewReader(payload), &c) != nil || c.Issuer != Issuer || c.Audience != Audience || !subjectValid(c.Subject) || c.Version < 1 || !canonical(c.JTI, "", 16) || c.Issued <= 0 || c.Issued > now.Unix() || c.NotBefore != c.Issued || c.Expires <= now.Unix() || c.Expires <= c.Issued || c.Expires-c.Issued > 120 {
		return Claims{}, ErrInvalid
	}
	key, err := v.key(ctx, header.Kid, now)
	if err != nil {
		return Claims{}, err
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || base64.RawURLEncoding.EncodeToString(signature) != parts[2] || !ed25519.Verify(key, []byte(parts[0]+"."+parts[1]), signature) {
		return Claims{}, ErrInvalid
	}
	if err := v.fresh(ctx, c, now, start); err != nil {
		return Claims{}, err
	}
	return c, nil
}

func (v *Verifier) key(ctx context.Context, kid string, now time.Time) (ed25519.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if key := v.keys[kid]; key != nil && now.Sub(v.fetched) < 5*time.Minute {
		return key, nil
	}
	if now.Sub(v.lastFetch) < time.Minute {
		if v.fetchFailed {
			return nil, ErrUnavailable
		}
		return nil, ErrInvalid
	}
	v.lastFetch = now
	v.fetchFailed = true
	req, err := http.NewRequestWithContext(ctx, "GET", Issuer+"/api/identity/jwks", nil)
	if err != nil {
		return nil, ErrUnavailable
	}
	clientHeaders(req)
	response, err := v.client.Do(req)
	if err != nil {
		return nil, ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, ErrUnavailable
	}
	var set struct {
		Keys []struct {
			Kty string `json:"kty"`
			Crv string `json:"crv"`
			Use string `json:"use"`
			Alg string `json:"alg"`
			Kid string `json:"kid"`
			X   string `json:"x"`
		} `json:"keys"`
	}
	if decodeBounded(response.Body, &set) != nil || len(set.Keys) == 0 || len(set.Keys) > 8 {
		return nil, ErrUnavailable
	}
	keys := make(map[string]ed25519.PublicKey)
	for _, k := range set.Keys {
		if k.Kty != "OKP" || k.Crv != "Ed25519" || k.Use != "sig" || k.Alg != "EdDSA" || k.Kid == "" || len(k.Kid) > 128 || !canonical(k.X, "", 32) || keys[k.Kid] != nil {
			return nil, ErrUnavailable
		}
		keys[k.Kid], _ = base64.RawURLEncoding.DecodeString(k.X)
	}
	v.keys, v.fetched, v.fetchFailed = keys, now, false
	if key := keys[kid]; key != nil {
		return key, nil
	}
	return nil, ErrInvalid
}

func decodeBounded(body io.Reader, target any) error {
	data, err := io.ReadAll(io.LimitReader(body, 16385))
	if err != nil || len(data) > 16384 {
		return ErrUnavailable
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if err := d.Decode(target); err != nil {
		return err
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return ErrUnavailable
	}
	return nil
}

func (v *Verifier) fresh(ctx context.Context, c Claims, now, start time.Time) error {
	body, _ := json.Marshal(struct {
		Subject string `json:"subject"`
		Version int64  `json:"session_version"`
		JTI     string `json:"token_jti"`
	}{c.Subject, c.Version, c.JTI})
	req, err := http.NewRequestWithContext(ctx, "POST", Issuer+"/api/identity/freshness", bytes.NewReader(body))
	if err != nil {
		return ErrUnavailable
	}
	clientHeaders(req)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+v.credential)
	response, err := v.client.Do(req)
	if err != nil {
		return ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode == 401 {
		return ErrInvalid
	}
	if response.StatusCode != 200 {
		return ErrUnavailable
	}
	var evidence struct {
		Issuer    string `json:"issuer"`
		Audience  string `json:"audience"`
		Subject   string `json:"subject"`
		Version   int64  `json:"session_version"`
		JTI       string `json:"token_jti"`
		CheckedAt int64  `json:"checked_at"`
		Account   bool   `json:"account_active"`
		Session   bool   `json:"session_active"`
		Token     bool   `json:"token_active"`
	}
	if decodeBounded(response.Body, &evidence) != nil {
		return ErrUnavailable
	}
	now = now.Add(time.Since(start))
	if ctx.Err() != nil {
		return ErrUnavailable
	}
	if now.Unix() >= c.Expires {
		return ErrInvalid
	}
	if evidence.Issuer != c.Issuer || evidence.Audience != c.Audience || evidence.Subject != c.Subject || evidence.Version != c.Version || evidence.JTI != c.JTI || !evidence.Account || !evidence.Session || !evidence.Token || evidence.CheckedAt > now.Unix() || evidence.CheckedAt < now.Unix()-2 {
		return ErrInvalid
	}
	return nil
}

func clientHeaders(req *http.Request) {
	req.Header.Set("User-Agent", "ShadowOps-Chess-Identity/1")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cache-Control", "no-cache")
}

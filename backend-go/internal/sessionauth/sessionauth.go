// Package sessionauth owns the cross-domain Go session JWT contract while
// Python and Go coexist. Domain packages must not depend on PvP merely to
// validate the shared browser session token.
package sessionauth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyjson"
)

type tokenHeader struct {
	Algorithm string `json:"alg"`
}

// Claims mirrors the session fields consumed by native Go API domains.
type Claims struct {
	Subject        string `json:"sub"`
	Purpose        string `json:"purpose"`
	SessionVersion *int64 `json:"sv"`
	ExpiresAt      int64  `json:"exp"`
}

// Verify checks signature, purpose, expiry and the basic session claim shape.
func Verify(raw string, secret []byte, now time.Time) (Claims, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return Claims{}, errors.New("invalid JWT")
	}
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return Claims{}, err
	}
	var header tokenHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil || header.Algorithm != "HS256" {
		return Claims{}, errors.New("invalid JWT algorithm")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return Claims{}, err
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return Claims{}, errors.New("invalid JWT signature")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Claims{}, err
	}
	var claims Claims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return Claims{}, err
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return Claims{}, errors.New("missing subject")
	}
	if claims.Purpose != "" && claims.Purpose != "session" {
		return Claims{}, errors.New("wrong token purpose")
	}
	if claims.SessionVersion != nil && *claims.SessionVersion < 0 {
		return Claims{}, errors.New("invalid session version")
	}
	if claims.ExpiresAt > 0 && !now.Before(time.Unix(claims.ExpiresAt, 0)) {
		return Claims{}, errors.New("expired token")
	}
	return claims, nil
}

// VerifySession returns the identity fields needed by API authorization.
func VerifySession(raw string, secret []byte, now time.Time) (string, int64, error) {
	claims, err := Verify(raw, secret, now)
	if err != nil {
		return "", 0, err
	}
	version := int64(0)
	if claims.SessionVersion != nil {
		version = *claims.SessionVersion
	}
	return claims.Subject, version, nil
}

// VerifiedSubject is intentionally authorization-free. It is used only to
// attribute access telemetry after signature/expiry validation.
func VerifiedSubject(authorization string, secret []byte, now time.Time) string {
	header := strings.TrimSpace(authorization)
	if !strings.HasPrefix(header, "Bearer ") || len(secret) == 0 {
		return ""
	}
	claims, err := Verify(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")), secret, now)
	if err != nil {
		return ""
	}
	return claims.Subject
}

// TokenLifetime mirrors auth.TOKEN_EXPIRY_DAYS.
const TokenLifetime = 30 * 24 * time.Hour

// Sign mirrors auth.create_token as PyJWT encodes it: header
// {"alg":"HS256","typ":"JWT"}, payload {"sub","purpose":"session","sv","exp"}
// in that order, compact, ASCII-escaped, exp in whole seconds.
func Sign(username string, sessionVersion int64, secret []byte, now time.Time) (string, error) {
	if sessionVersion < 0 {
		sessionVersion = 0
	}
	subject, err := pyjson.Dumps(username)
	if err != nil {
		return "", err
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(
		`{"sub":` + subject + `,"purpose":"session","sv":` + strconv.FormatInt(sessionVersion, 10) +
			`,"exp":` + strconv.FormatInt(now.Add(TokenLifetime).Unix(), 10) + `}`))
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(header + "." + payload))
	return header + "." + payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

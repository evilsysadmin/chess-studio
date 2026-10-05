package sessionauth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyjson"
)

// ResetLifetime mirrors auth.PASSWORD_RESET_MINUTES.
const ResetLifetime = 30 * time.Minute

// passwordFingerprint mirrors auth._password_fingerprint: the link dies as
// soon as the password it was issued for changes.
func passwordFingerprint(passwordHash string) string {
	sum := sha256.Sum256([]byte(passwordHash))
	return hex.EncodeToString(sum[:])[:24]
}

// SignPasswordReset mirrors auth.create_password_reset_token.
func SignPasswordReset(username, passwordHash string, secret []byte, now time.Time) (string, error) {
	subject, err := pyjson.Dumps(username)
	if err != nil {
		return "", err
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(
		`{"sub":` + subject + `,"purpose":"password_reset","pwd":"` + passwordFingerprint(passwordHash) +
			`","exp":` + strconv.FormatInt(now.Add(ResetLifetime).Unix(), 10) + `}`))
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(header + "." + payload))
	return header + "." + payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func decodePart(part string, into any) error {
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(part, "="))
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, into)
}

// UnverifiedSubject mirrors jwt.decode(token, verify_signature=False)["sub"]
// as reset_password reads it: str(sub).strip().lower(), "" on any error.
func UnverifiedSubject(token string) string {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return ""
	}
	var header map[string]any
	if decodePart(parts[0], &header) != nil {
		return ""
	}
	var payload map[string]any
	if decodePart(parts[1], &payload) != nil {
		return ""
	}
	sub, ok := payload["sub"].(string)
	if !ok {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(sub))
}

// VerifyPasswordReset mirrors auth.verify_password_reset_token: a valid,
// unexpired HS256 token for that password, and its subject.
func VerifyPasswordReset(token, passwordHash string, secret []byte, now time.Time) (string, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", false
	}
	var header map[string]any
	if decodePart(parts[0], &header) != nil || header["alg"] != "HS256" {
		return "", false
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "", false
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return "", false
	}
	var payload map[string]any
	if decodePart(parts[1], &payload) != nil {
		return "", false
	}
	if err := checkTimes(payload, now); err != nil {
		return "", false
	}
	if payload["purpose"] != "password_reset" || payload["pwd"] != passwordFingerprint(passwordHash) {
		return "", false
	}
	sub, ok := payload["sub"].(string)
	return sub, ok
}

// checkTimes mirrors PyJWT's exp/nbf validation (no leeway).
func checkTimes(payload map[string]any, now time.Time) error {
	if raw, present := payload["exp"]; present {
		exp, ok := raw.(float64)
		if !ok || math.IsNaN(exp) {
			return errors.New("invalid exp")
		}
		if float64(now.Unix()) >= exp {
			return errors.New("expired")
		}
	}
	if raw, present := payload["nbf"]; present {
		nbf, ok := raw.(float64)
		if !ok || float64(now.Unix()) < nbf {
			return errors.New("not yet valid")
		}
	}
	return nil
}

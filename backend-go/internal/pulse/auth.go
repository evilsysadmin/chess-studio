package pulse

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

var canonicalBrowserOrigins = [...]string{
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"https://evilsysadmin.github.io",
	"https://chess-studio.shadowops.dpdns.org",
	"https://staging.chess-studio.shadowops.dpdns.org",
}

type tokenHeader struct {
	Algorithm string `json:"alg"`
}

type tokenClaims struct {
	Subject        string `json:"sub"`
	Purpose        string `json:"purpose"`
	SessionVersion *int64 `json:"sv"`
	ExpiresAt      int64  `json:"exp"`
}

func (h *Handler) authenticate(r *http.Request) (tokenClaims, error) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(header, "Bearer ") {
		return tokenClaims{}, errors.New("missing bearer token")
	}
	return verifySessionToken(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")), h.secret, h.now())
}

func verifySessionToken(raw string, secret []byte, now time.Time) (tokenClaims, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return tokenClaims{}, errors.New("invalid JWT")
	}
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return tokenClaims{}, err
	}
	var header tokenHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil || header.Algorithm != "HS256" {
		return tokenClaims{}, errors.New("invalid JWT algorithm")
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return tokenClaims{}, err
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal(signature, mac.Sum(nil)) {
		return tokenClaims{}, errors.New("invalid JWT signature")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return tokenClaims{}, err
	}
	var claims tokenClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return tokenClaims{}, err
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return tokenClaims{}, errors.New("missing subject")
	}
	if claims.Purpose != "" && claims.Purpose != "session" {
		return tokenClaims{}, errors.New("wrong token purpose")
	}
	if claims.SessionVersion != nil && *claims.SessionVersion < 0 {
		return tokenClaims{}, errors.New("invalid session version")
	}
	if claims.ExpiresAt > 0 && !now.Before(time.Unix(claims.ExpiresAt, 0)) {
		return tokenClaims{}, errors.New("expired token")
	}
	return claims, nil
}

func (h *Handler) decorateResponse(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Chess-Pvp-Native", nativeHeaderValue)
	w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID, X-Chess-Pvp-Native, X-Chess-Pvp-Edge")
	w.Header().Add("Vary", "Origin")
	if requestID := cleanRequestID(r.Header.Get("X-Request-ID")); requestID != "" {
		w.Header().Set("X-Request-ID", requestID)
	}
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if h.originAllowed(origin) && origin != "" {
		if h.allowAnyOrigin {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
	}
}

func (h *Handler) originAllowed(origin string) bool {
	origin = strings.TrimSpace(origin)
	if origin == "" {
		return true
	}
	if h.allowAnyOrigin {
		return true
	}
	_, ok := h.allowedOrigins[origin]
	return ok
}

func cleanRequestID(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 128 {
		value = value[:128]
	}
	for _, r := range value {
		if r < 0x20 || r == 0x7f {
			return ""
		}
	}
	return value
}

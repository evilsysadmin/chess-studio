package pulse

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/corspolicy"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/sessionauth"
)

type tokenClaims = sessionauth.Claims

func (h *Handler) authenticate(r *http.Request) (tokenClaims, error) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(header, "Bearer ") {
		return tokenClaims{}, errors.New("missing bearer token")
	}
	return sessionauth.Verify(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")), h.secret, h.now())
}

// Deprecated: cross-domain consumers should use sessionauth.VerifiedSubject.
// Kept temporarily for PvP-local compatibility while the migration proceeds.
func VerifiedSubject(authorization string, secret []byte, now time.Time) string {
	return sessionauth.VerifiedSubject(authorization, secret, now)
}

// Deprecated: cross-domain consumers should use sessionauth.VerifySession.
func VerifySession(raw string, secret []byte, now time.Time) (string, int64, error) {
	return sessionauth.VerifySession(raw, secret, now)
}

// Deprecated: cross-domain consumers should use corspolicy.CanonicalBrowserOrigins.
func CanonicalBrowserOrigins() []string {
	return corspolicy.CanonicalBrowserOrigins()
}

func (h *Handler) decorateResponse(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Chess-Pvp-Native", nativeHeaderValue)
	w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID, X-Chess-Pvp-Native, X-Chess-Pvp-Edge")
	w.Header().Add("Vary", "Origin")
	// The edge's request telemetry already answered with the id it logs
	// (Python's rules); keep the two equal.
	if w.Header().Get("X-Request-ID") == "" {
		if requestID := cleanRequestID(r.Header.Get("X-Request-ID")); requestID != "" {
			w.Header().Set("X-Request-ID", requestID)
		}
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

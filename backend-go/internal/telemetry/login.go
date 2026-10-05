package telemetry

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"unicode"
	"unicode/utf8"

	"go.opentelemetry.io/otel/attribute"
	otellog "go.opentelemetry.io/otel/log"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyjson"
)

// LoginFailure is one rejected login, as main.login reports it.
type LoginFailure struct {
	RequestID         string
	AttemptedUsername string
	Password          string
	FingerprintKey    string
	AccountExists     bool
	// Reason is "unknown_user" or "bad_password".
	Reason string
	// SyntheticSource is set only for a trusted staging smoke identity.
	SyntheticSource string
}

// passwordShape mirrors structured_logging._password_shape.
func passwordShape(password string) []string {
	var lower, upper, digit, space, symbol bool
	for _, r := range password {
		switch {
		case unicode.IsLower(r):
			lower = true
		case unicode.IsUpper(r):
			upper = true
		}
		if unicode.IsDigit(r) {
			digit = true
		}
		if unicode.IsSpace(r) {
			space = true
		}
		if !(unicode.IsLetter(r) || unicode.IsNumber(r)) && !unicode.IsSpace(r) {
			symbol = true
		}
	}
	classes := []string{}
	for _, c := range []struct {
		on   bool
		name string
	}{{lower, "lower"}, {upper, "upper"}, {digit, "digit"}, {space, "space"}, {symbol, "symbol"}} {
		if c.on {
			classes = append(classes, c.name)
		}
	}
	return classes
}

// passwordFingerprint mirrors structured_logging._password_fingerprint: a
// keyed HMAC, so a guess cannot be recovered from the logs.
func passwordFingerprint(password, key string) string {
	if key == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte("chess-studio:auth-login-failed\x00"))
	mac.Write([]byte(password))
	return hex.EncodeToString(mac.Sum(nil))[:20]
}

// EmitLoginFailed mirrors structured_logging.emit_auth_login_failed: the
// bot-forensics event of a 401 login, never the credentials themselves.
// Synthetic staging probes log at INFO, everything else at WARNING.
func (r *Recorder) EmitLoginFailed(req *http.Request, failure LoginFailure) {
	if r == nil {
		return
	}
	reason := failure.Reason
	if reason != "unknown_user" && reason != "bad_password" {
		reason = "invalid_credentials"
	}
	shape := passwordShape(failure.Password)
	payload := map[string]any{
		"event":              "auth_login_failed",
		"status":             pyjson.Int(401),
		"request_id":         truncateRunes(failure.RequestID, 80),
		"username_attempted": cleanLogText(failure.AttemptedUsername, 64),
		"account_exists":     failure.AccountExists,
		"failure_reason":     reason,
		"password_length":    pyjson.Int(utf8.RuneCountInString(failure.Password)),
		"password_classes":   shape,
	}
	if fingerprint := passwordFingerprint(failure.Password, failure.FingerprintKey); fingerprint != "" {
		payload["password_fingerprint"] = fingerprint
	}
	if release := clientRelease(req); release != "" {
		payload["client_release"] = release
	}
	synthetic := cleanLogText(failure.SyntheticSource, 64)
	if synthetic != "" {
		payload["synthetic_source"] = synthetic
	}
	network := requestNetwork(req, r.cfg.TrustCloudflare)
	if network.ClientIP != "" {
		payload["client_ip"] = network.ClientIP
	}
	if network.PeerIP != "" {
		payload["peer_ip"] = network.PeerIP
	}
	if len(network.ForwardedFor) > 0 {
		payload["x_forwarded_for"] = network.ForwardedFor
	}
	if country := sanitizeCountry(network.ClientCountry); country != "" {
		payload["client_country"] = country
	}
	if ua := cleanLogText(req.Header.Get("User-Agent"), 240); ua != "" {
		payload["user_agent"] = ua
	}
	message, err := pyjson.Dumps(payload)
	if err != nil {
		return
	}
	r.outMu.Lock()
	_, _ = r.out.Write([]byte(message + "\n"))
	r.outMu.Unlock()
	if r.logger != nil {
		var record otellog.Record
		record.SetTimestamp(r.now())
		record.SetObservedTimestamp(r.now())
		if synthetic != "" {
			record.SetSeverity(otellog.SeverityInfo)
			record.SetSeverityText("INFO")
		} else {
			record.SetSeverity(otellog.SeverityWarn)
			record.SetSeverityText("WARNING")
		}
		record.SetBody(attribute.StringValue(message))
		r.logger.Emit(context.Background(), record)
	}
}

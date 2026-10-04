package gamesapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/telemetry"
)

// BillingPattern is system_api.ingest_billing_costs: the machine-only ingest
// of the current-cycle OCI and Cloudflare costs, exempt from rate limits.
const BillingPattern = "/api/internal/billing-costs"

// billingMaxSkew mirrors _BILLING_SIGNATURE_MAX_SKEW_SECONDS.
const billingMaxSkew = 300

// BillingMetrics exports the billing gauge (telemetry.Recorder).
type BillingMetrics interface {
	RecordBillingCosts(ctx context.Context, costs []telemetry.BillingCost) bool
}

// billingSignatureValid mirrors _billing_signature_valid: a sha256 HMAC of
// "<timestamp>.<body>" no more than five minutes from now.
func billingSignatureValid(secret, timestamp, signature string, body []byte, now time.Time) bool {
	if secret == "" || timestamp == "" || signature == "" {
		return false
	}
	stamp, err := strconv.ParseInt(strings.TrimSpace(timestamp), 10, 64)
	if err != nil {
		return false
	}
	skew := now.Unix() - stamp
	if skew < 0 {
		skew = -skew
	}
	if skew > billingMaxSkew {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(signature), []byte(expected))
}

var errBillingPayload = errors.New("invalid billing payload")

// parseBillingCosts mirrors _parse_billing_costs.
func parseBillingCosts(body []byte) ([]telemetry.BillingCost, error) {
	if !utf8.Valid(body) {
		return nil, errBillingPayload
	}
	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, errBillingPayload
	}
	object, _ := payload.(map[string]any)
	rows, ok := object["costs"].([]any)
	if object == nil || !ok || len(rows) < 1 || len(rows) > 2 {
		return nil, errBillingPayload
	}
	seen := map[string]bool{}
	costs := make([]telemetry.BillingCost, 0, len(rows))
	for _, raw := range rows {
		row, ok := raw.(map[string]any)
		if !ok {
			return nil, errBillingPayload
		}
		provider := strings.ToLower(strings.TrimSpace(pyStr(row["provider"])))
		currency := strings.ToUpper(strings.TrimSpace(pyStr(row["currency"])))
		amount, ok := pyFloat(row["amount"])
		if !ok || (provider != "oci" && provider != "cloudflare") || seen[provider] {
			return nil, errBillingPayload
		}
		if math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 0 {
			return nil, errBillingPayload
		}
		if utf8.RuneCountInString(currency) != 3 || strings.IndexFunc(currency, func(r rune) bool { return !unicode.IsLetter(r) }) >= 0 {
			return nil, errBillingPayload
		}
		seen[provider] = true
		costs = append(costs, telemetry.BillingCost{Provider: provider, Amount: amount, Currency: currency})
	}
	return costs, nil
}

// pyStr is str(value or ""): falsy values are "", the rest their text.
func pyStr(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case bool:
		if v {
			return "True"
		}
		return ""
	case float64:
		if v == 0 {
			return ""
		}
		return strconv.FormatFloat(v, 'g', -1, 64)
	}
	return "?"
}

// pyFloat is float(value) for JSON values.
func pyFloat(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case bool:
		if v {
			return 1, true
		}
		return 0, true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		return f, err == nil
	}
	return 0, false
}

// billing mirrors ingest_billing_costs behind billing_auth_dependency.
func (h *SystemHandler) billing(w http.ResponseWriter, r *http.Request) {
	if r.ContentLength > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBodyBytes+1))
	if err != nil || len(body) > MaxRequestBodyBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"detail": "Petición demasiado grande."})
		return
	}
	if h.billingSecret == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "Billing telemetry auth is not configured."})
		return
	}
	if !billingSignatureValid(h.billingSecret, r.Header.Get("X-Chess-Timestamp"), r.Header.Get("X-Chess-Signature"), body, h.base.now()) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "Invalid billing telemetry signature."})
		return
	}
	costs, err := parseBillingCosts(body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "Invalid billing telemetry payload."})
		return
	}
	if h.billingMetrics == nil || !h.billingMetrics.RecordBillingCosts(context.WithoutCancel(r.Context()), costs) {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"detail": "Metrics export is not configured."})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

package gamesapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/telemetry"
)

type fakeBilling struct {
	ok    bool
	costs [][]telemetry.BillingCost
}

func (f *fakeBilling) RecordBillingCosts(_ context.Context, costs []telemetry.BillingCost) bool {
	f.costs = append(f.costs, costs)
	return f.ok
}

func sign(secret string, stamp int64, body string) (string, string) {
	ts := strconv.FormatInt(stamp, 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + "." + body))
	return ts, "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func billingFixture(t *testing.T, secretValue string, metrics *fakeBilling) *SystemHandler {
	t.Helper()
	cfg := SystemConfig{
		Config:        Config{Accounts: fakeAccounts{}, JWTSecret: secret, Now: func() time.Time { return fixedNow }},
		Counter:       &fakeCounter{},
		BillingSecret: secretValue,
	}
	if metrics != nil {
		cfg.BillingMetrics = metrics
	}
	h, err := NewSystem(cfg)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func postBilling(h *SystemHandler, body, ts, sig string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, BillingPattern, strings.NewReader(body))
	if ts != "" {
		r.Header.Set("X-Chess-Timestamp", ts)
	}
	if sig != "" {
		r.Header.Set("X-Chess-Signature", sig)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestBillingIngestAuthenticatesWithAShortLivedHMAC(t *testing.T) {
	metrics := &fakeBilling{ok: true}
	h := billingFixture(t, " shared ", metrics)
	body := `{"costs":[{"provider":" OCI ","amount":"12.5","currency":"eur"},{"provider":"cloudflare","amount":0,"currency":"USD"}]}`

	ts, sig := sign("shared", fixedNow.Unix()-300, body)
	if w := postBilling(h, body, ts, sig); w.Code != http.StatusNoContent || w.Body.Len() != 0 {
		t.Fatalf("valid at the skew edge: %d %s", w.Code, w.Body)
	}
	got := metrics.costs[0]
	if len(got) != 2 || got[0] != (telemetry.BillingCost{Provider: "oci", Amount: 12.5, Currency: "EUR"}) || got[1].Provider != "cloudflare" {
		t.Fatalf("costs %+v", got)
	}

	ts, sig = sign("shared", fixedNow.Unix()+301, body)
	if w := postBilling(h, body, ts, sig); w.Code != http.StatusUnauthorized || decode(t, w)["detail"] != "Invalid billing telemetry signature." {
		t.Fatalf("future stamp: %d %s", w.Code, w.Body)
	}
	ts, sig = sign("other", fixedNow.Unix(), body)
	if w := postBilling(h, body, ts, sig); w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong secret: %d", w.Code)
	}
	if w := postBilling(h, body, "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("unsigned: %d", w.Code)
	}
	if w := postBilling(billingFixture(t, "", metrics), body, ts, sig); w.Code != http.StatusServiceUnavailable || decode(t, w)["detail"] != "Billing telemetry auth is not configured." {
		t.Fatalf("no secret: %d %s", w.Code, w.Body)
	}
}

func TestBillingIngestRejectsBadPayloads(t *testing.T) {
	metrics := &fakeBilling{ok: true}
	h := billingFixture(t, "shared", metrics)
	for _, body := range []string{
		`not json`,
		`[]`,
		`{"costs":[]}`,
		`{"costs":[{},{},{}]}`,
		`{"costs":["oci"]}`,
		`{"costs":[{"provider":"aws","amount":1,"currency":"USD"}]}`,
		`{"costs":[{"provider":"oci","amount":1,"currency":"USD"},{"provider":"OCI","amount":2,"currency":"USD"}]}`,
		`{"costs":[{"provider":"oci","amount":-1,"currency":"USD"}]}`,
		`{"costs":[{"provider":"oci","amount":"inf","currency":"USD"}]}`,
		`{"costs":[{"provider":"oci","amount":null,"currency":"USD"}]}`,
		`{"costs":[{"provider":"oci","amount":1,"currency":"US"}]}`,
		`{"costs":[{"provider":"oci","amount":1,"currency":"U5D"}]}`,
	} {
		ts, sig := sign("shared", fixedNow.Unix(), body)
		if w := postBilling(h, body, ts, sig); w.Code != http.StatusBadRequest || decode(t, w)["detail"] != "Invalid billing telemetry payload." {
			t.Errorf("%s: %d %s", body, w.Code, w.Body)
		}
	}
	if len(metrics.costs) != 0 {
		t.Fatalf("recorded invalid costs: %v", metrics.costs)
	}
}

func TestBillingIngestNeedsMetricsExport(t *testing.T) {
	body := `{"costs":[{"provider":"oci","amount":true,"currency":"EUR"}]}`
	ts, sig := sign("shared", fixedNow.Unix(), body)
	for _, metrics := range []*fakeBilling{nil, {ok: false}} {
		w := postBilling(billingFixture(t, "shared", metrics), body, ts, sig)
		if w.Code != http.StatusServiceUnavailable || decode(t, w)["detail"] != "Metrics export is not configured." {
			t.Fatalf("no export: %d %s", w.Code, w.Body)
		}
	}
}

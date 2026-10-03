package telemetry

import (
	"net/http/httptest"
	"reflect"
	"testing"
)

// Expected values come from backend-python/structured_logging.py and
// ipaddress (python 3.13), which the Python access log uses.
func TestSanitizersMatchPython(t *testing.T) {
	for raw, want := range map[string]struct {
		ip     string
		global bool
	}{
		"1.2.3.4":        {"1.2.3.4", true},
		" 10.0.0.1 ":     {"10.0.0.1", false},
		"::ffff:8.8.8.8": {"::ffff:8.8.8.8", true},
		"2001:db8::1":    {"2001:db8::1", false},
		"2606:4700::1":   {"2606:4700::1", true},
		"100.64.1.1":     {"100.64.1.1", false},
		"192.0.0.9":      {"192.0.0.9", true},
		"fe80::1%eth0":   {"fe80::1%eth0", false},
		"300.1.1.1":      {"", false},
		"":               {"", false},
		"172.31.255.255": {"172.31.255.255", false},
		"FE80::ABCD":     {"fe80::abcd", false},
		// Edges of the special-purpose tables (python 3.13.15 is_global).
		"192.0.0.5":        {"192.0.0.5", false},
		"192.0.0.200":      {"192.0.0.200", false},
		"192.0.0.170":      {"192.0.0.170", false},
		"::ffff:10.0.0.1":  {"::ffff:10.0.0.1", false},
		"2001:20::1":       {"2001:20::1", true},
		"2001:2::1":        {"2001:2::1", false},
		"64:ff9b::8.8.8.8": {"64:ff9b::808:808", true},
		"64:ff9b:1::1":     {"64:ff9b:1::1", false},
	} {
		got := sanitizeIP(raw)
		if got != want.ip {
			t.Errorf("sanitize %q = %q want %q", raw, got, want.ip)
		}
		if got != "" && isGlobal(got) != want.global {
			t.Errorf("is_global %q = %v", got, !want.global)
		}
	}
	for raw, want := range map[string]string{"es": "ES", "XX": "", "T1": "", "E": "", "ESP": "ES", " fr\n": "FR", "1A": ""} {
		if got := sanitizeCountry(raw); got != want {
			t.Errorf("country %q = %q want %q", raw, got, want)
		}
	}
	xff := sanitizeForwardedFor("1.1.1.1, bad, 10.0.0.1,2.2.2.2,3.3.3.3,4.4.4.4,5.5.5.5,6.6.6.6,7.7.7.7,8.8.8.8")
	if want := []string{"1.1.1.1", "10.0.0.1", "2.2.2.2", "3.3.3.3", "4.4.4.4", "5.5.5.5", "6.6.6.6", "7.7.7.7"}; !reflect.DeepEqual(xff, want) {
		t.Errorf("xff = %v", xff)
	}
}

func TestRequestNetworkFollowsTheCloudflareBoundary(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/pvp/lobby", nil)
	req.RemoteAddr = "172.18.0.5:41234"
	req.Header.Set("CF-Connecting-IP", "203.0.113.9")
	req.Header.Set("CF-IPCountry", "es")
	req.Header.Set("X-Forwarded-For", "10.0.0.2, 81.40.1.2")

	// Outside the boundary the Cloudflare headers are spoofable: ignored.
	got := requestNetwork(req, false)
	if got.ClientIP != "172.18.0.5" || got.ClientCountry != "" || got.PeerIP != "172.18.0.5" {
		t.Fatalf("untrusted: %+v", got)
	}
	// Trusted: CF-Connecting-IP is not global (documentation range), so the
	// first global X-Forwarded-For entry is used for logs.
	got = requestNetwork(req, true)
	if got.ClientIP != "81.40.1.2" || got.ClientCountry != "ES" || !reflect.DeepEqual(got.ForwardedFor, []string{"10.0.0.2", "81.40.1.2"}) {
		t.Fatalf("trusted: %+v", got)
	}
	req.Header.Set("CF-Connecting-IP", "81.40.9.9")
	if got := requestNetwork(req, true); got.ClientIP != "81.40.9.9" {
		t.Fatalf("public CF-Connecting-IP wins: %+v", got)
	}
	// A CF-Ray proves the request crossed Cloudflare even without the env flag.
	req.Header.Set("CF-Ray", "8c1-MAD")
	if got := requestNetwork(req, false); got.ClientIP != "81.40.9.9" || got.ClientCountry != "ES" {
		t.Fatalf("cf-ray: %+v", got)
	}
}

func TestRequestIDAndReleaseMatchPython(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	for incoming, keep := range map[string]bool{"abc-12_3.x": true, "short": false, "has space x": false, "ñandú-123": true, "": false} {
		req.Header.Set("X-Request-ID", incoming)
		got := requestID(req)
		if keep && got != incoming {
			t.Errorf("%q should be kept, got %q", incoming, got)
		}
		if !keep && (got == incoming || len(got) != 12) {
			t.Errorf("%q should be replaced by 12 hex, got %q", incoming, got)
		}
	}
	for raw, want := range map[string]string{"v2026.10.03-abc": "v2026.10.03-abc", "abc1234": "abc1234", "-bad": "", "v": "v", "x y": ""} {
		req.Header.Set("X-Client-Release", raw)
		if got := clientRelease(req); got != want {
			t.Errorf("release %q = %q", raw, got)
		}
	}
}

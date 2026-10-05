package telemetry

import (
	"net/http/httptest"
	"strings"
	"testing"
)

// Expected lines are structured_logging.emit_auth_login_failed's output for
// the same request.
func TestLoginFailedEventIsPythons(t *testing.T) {
	f := newFixture(t)
	r := httptest.NewRequest("POST", "/api/auth/login", nil)
	r.RemoteAddr = "10.0.0.2:4444"
	r.Header.Set("CF-Ray", "8f00")
	r.Header.Set("CF-Connecting-IP", "203.0.113.9")
	r.Header.Set("CF-IPCountry", "es")
	r.Header.Set("X-Forwarded-For", "203.0.113.9, 10.0.0.1")
	r.Header.Set("User-Agent", "bot/1\x00x")
	r.Header.Set("X-Client-Release", "v16.6dm46j")
	f.rec.EmitLoginFailed(r, LoginFailure{
		RequestID: "abc123def456", AttemptedUsername: "Ali\nce", Password: "Pässw0rd !",
		FingerprintKey: strings.Repeat("k", 32), AccountExists: true, Reason: "bad_password",
	})
	want := `{"account_exists":true,"client_country":"ES","client_ip":"203.0.113.9","client_release":"v16.6dm46j","event":"auth_login_failed","failure_reason":"bad_password","password_classes":["lower","upper","digit","space","symbol"],"password_fingerprint":"86ff0dac633a64fc3f70","password_length":10,"peer_ip":"10.0.0.2","request_id":"abc123def456","status":401,"user_agent":"bot/1 x","username_attempted":"Ali ce","x_forwarded_for":["203.0.113.9","10.0.0.1"]}`
	if got := strings.TrimSpace(f.out.String()); got != want {
		t.Fatalf("event\n got %s\nwant %s", got, want)
	}
	if len(f.logs.records) != 1 || f.logs.records[0].SeverityText() != "WARNING" {
		t.Fatalf("otel %v", f.logs.records)
	}

	f = newFixture(t)
	bare := httptest.NewRequest("POST", "/api/auth/login", nil)
	bare.RemoteAddr = "bad"
	f.rec.EmitLoginFailed(bare, LoginFailure{RequestID: "r", AttemptedUsername: "u", FingerprintKey: strings.Repeat("k", 32), Reason: "unknown_user", SyntheticSource: "staging-smoke-cleanup"})
	want = `{"account_exists":false,"event":"auth_login_failed","failure_reason":"unknown_user","password_classes":[],"password_fingerprint":"2987fde4b7c9d9ed9c9a","password_length":0,"request_id":"r","status":401,"synthetic_source":"staging-smoke-cleanup","username_attempted":"u"}`
	if got := strings.TrimSpace(f.out.String()); got != want {
		t.Fatalf("synthetic\n got %s\nwant %s", got, want)
	}
	if f.logs.records[0].SeverityText() != "INFO" {
		t.Fatal("synthetic probes log at INFO")
	}
}

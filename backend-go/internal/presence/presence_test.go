package presence

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type recorder struct {
	updates []bson.M
	err     error
}

func (r *recorder) UpdateOne(_ context.Context, filter any, update any, _ ...any) error {
	if filter.(bson.M)["_id"] != "alice" {
		panic("wrong filter")
	}
	r.updates = append(r.updates, update.(bson.M)["$set"].(bson.M))
	return r.err
}

func TestTouchCoalescesAndWritesPythonFields(t *testing.T) {
	now := time.Date(2026, 10, 3, 20, 30, 0, 123456000, time.UTC)
	rec := &recorder{}
	toucher := newToucher(rec, true, time.Second, func() time.Time { return now })

	r := httptest.NewRequest("GET", "/api/games", nil)
	r.Header.Set("Authorization", "Bearer x")
	r.Header.Set("X-Presence-Session", "tab_ABCDEF12")
	r.Header.Set("CF-Connecting-IP", "81.40.1.2")
	r.Header.Set("CF-IPCountry", "es")
	toucher.Touch(r, "alice")
	toucher.Touch(r, "alice") // within 30s: coalesced
	if len(rec.updates) != 1 {
		t.Fatalf("writes %d", len(rec.updates))
	}
	set := rec.updates[0]
	want := bson.M{
		"last_activity":       "2026-10-03T20:30:00.123456+00:00",
		"presence_online":     true,
		"last_client_ip":      "81.40.1.2",
		"last_client_country": "ES",
		"presence_sessions.tab_ABCDEF12.last_activity": "2026-10-03T20:30:00.123456+00:00",
	}
	for k, v := range want {
		if set[k] != v {
			t.Errorf("%s = %v, want %v", k, set[k], v)
		}
	}
	if len(set) != len(want) {
		t.Errorf("fields %v", set)
	}

	now = now.Add(WriteInterval)
	toucher.Touch(r, "alice")
	if len(rec.updates) != 2 {
		t.Fatalf("after interval: writes %d", len(rec.updates))
	}
}

func TestTouchWithoutCloudflareUsesPeerAndLegacySession(t *testing.T) {
	rec := &recorder{}
	toucher := newToucher(rec, false, time.Second, time.Now)
	r := httptest.NewRequest("GET", "/api/games", nil)
	r.RemoteAddr = "172.18.0.5:5000"
	r.Header.Set("Authorization", "Bearer x")
	r.Header.Set("CF-Connecting-IP", "81.40.1.2") // ignored: no CF-Ray, not trusted
	r.Header.Set("X-Presence-Session", "bad id")
	toucher.Touch(r, "alice")
	set := rec.updates[0]
	if set["last_client_ip"] != "172.18.0.5" || set["last_client_country"] != nil {
		t.Fatalf("network %v", set)
	}
	if _, ok := set["presence_sessions.legacy_client.last_activity"]; !ok {
		t.Fatalf("legacy session missing: %v", set)
	}
}

func TestTouchFailureRetriesNextRequest(t *testing.T) {
	rec := &recorder{err: errors.New("down")}
	toucher := newToucher(rec, false, time.Second, time.Now)
	r := httptest.NewRequest("GET", "/api/games", nil)
	toucher.Touch(r, "alice")
	toucher.Touch(r, "alice")
	if len(rec.updates) != 2 {
		t.Fatalf("a failed write must not hold the slot: %d", len(rec.updates))
	}
	var nilToucher *Toucher
	nilToucher.Touch(r, "alice")
}

func TestPyUTCISOFormat(t *testing.T) {
	if got := PyUTCISOFormat(time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)); got != "2026-01-02T03:04:05+00:00" {
		t.Fatal(got)
	}
	if got := PyUTCISOFormat(time.Date(2026, 1, 2, 3, 4, 5, 7000, time.FixedZone("x", 3600))); got != "2026-01-02T02:04:05.000007+00:00" {
		t.Fatal(got)
	}
}

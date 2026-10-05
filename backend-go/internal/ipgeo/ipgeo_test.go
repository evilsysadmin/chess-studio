package ipgeo

import (
	"context"
	"testing"
	"time"
)

// Expected answers recorded from ip_geolocation.network_location_status
// (CPython 3.13's ipaddress).
func TestStatusMatchesPython(t *testing.T) {
	for _, c := range []struct {
		raw  any
		want string
	}{
		{"8.8.8.8", "public"},
		{"10.1.2.3", "private"},
		{"100.64.1.1", "private"},
		{"100.127.255.255", "private"},
		{"127.0.0.1", "private"},
		{"192.0.0.9", "public"},
		{"192.0.0.10", "public"},
		{"192.0.0.11", "private"},
		{"192.168.1.1", "private"},
		{"172.31.0.1", "private"},
		{"172.32.0.1", "public"},
		{"198.18.0.1", "private"},
		{"203.0.113.5", "private"},
		{"255.255.255.255", "private"},
		{"240.1.1.1", "private"},
		{"224.0.0.1", "public"},
		{"0.1.2.3", "private"},
		{"169.254.1.1", "private"},
		{"2001:4860:4860::8888", "public"},
		{"::1", "private"},
		{"::", "private"},
		{"fe80::1%eth0", "private"},
		{"fc00::1", "private"},
		{"2001:db8::1", "private"},
		{"2002::1", "private"},
		{"2001:3::1", "public"},
		{"2001:20::1", "public"},
		{"2001::1", "private"},
		{"::ffff:8.8.8.8", "public"},
		{"::ffff:10.0.0.1", "private"},
		{"64:ff9b:1::1", "private"},
		{"64:ff9b::1.2.3.4", "public"},
		{"3fff::1", "private"},
		{"ff02::1", "public"},
		{"", "missing"},
		{"abc", "invalid"},
		{"1.2.3", "invalid"},
		{"01.2.3.4", "invalid"},
		{" 8.8.8.8", "invalid"},
		{"8.8.8.8 ", "invalid"},
		{"1.2.3.4.5", "invalid"},
		{"2001:4860::8888:", "invalid"},
		{"::ffff:1.2.3.4%x", "public"},
		{nil, "missing"},
		{int64(0), "missing"},
		{int64(134744072), "public"},
		{int64(167772161), "private"},
	} {
		if got := Status(c.raw); got != c.want {
			t.Errorf("Status(%#v)=%s want %s", c.raw, got, c.want)
		}
	}
}

func TestResolverCachesAndSchedulesOnce(t *testing.T) {
	calls := make(chan string, 4)
	r := New(func(_ context.Context, ip string) string {
		calls <- ip
		if ip == "8.8.8.8" {
			return "US"
		}
		return ""
	})
	if r.Cached("8.8.8.8") != "" || !r.Schedule("8.8.8.8") || r.Schedule("8.8.8.8") || r.Schedule("10.0.0.1") {
		t.Fatal("first schedule")
	}
	<-calls
	deadline := time.Now().Add(time.Second)
	for r.Cached("8.8.8.8") != "US" {
		if time.Now().After(deadline) {
			t.Fatal("country never cached")
		}
		time.Sleep(time.Millisecond)
	}
	if r.Schedule("8.8.8.8") {
		t.Fatal("rescheduled a fresh entry")
	}
	r.now = func() time.Time { return time.Now().Add(25 * time.Hour) }
	if r.Cached("8.8.8.8") != "" {
		t.Fatal("expired entry served")
	}
}

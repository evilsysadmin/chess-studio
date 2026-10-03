// Package presence mirrors users_store.touch_last_activity for requests Go
// authenticates natively: every authenticated request marks the account as
// active (the admin panel's green dot) with at most one write per account
// every 30 seconds per process. It is best-effort: a Mongo error never turns
// a valid request into a failure.
package presence

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"regexp"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

// WriteInterval is users_store._ACTIVITY_WRITE_INTERVAL_S.
const WriteInterval = 30 * time.Second

var (
	sessionPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
	countryPattern = regexp.MustCompile(`^[A-Z]{2}$`)
)

// Updater writes one $set on a user document.
type Updater interface {
	UpdateOne(ctx context.Context, filter any, update any, opts ...any) error
}

type mongoUsers struct{ col *mongo.Collection }

func (m mongoUsers) UpdateOne(ctx context.Context, filter any, update any, _ ...any) error {
	_, err := m.col.UpdateOne(ctx, filter, update)
	return err
}

// Toucher records activity for authenticated native requests.
type Toucher struct {
	users           Updater
	trustCloudflare bool
	timeout         time.Duration
	now             func() time.Time
	mu              sync.Mutex
	lastWrite       map[string]time.Time
}

// New builds a Toucher over the users collection. trustCloudflare mirrors
// _trust_cloudflare_client_ip.
func New(db *mongo.Database, trustCloudflare bool, timeout time.Duration) *Toucher {
	return newToucher(mongoUsers{col: db.Collection("users")}, trustCloudflare, timeout, time.Now)
}

func newToucher(users Updater, trustCloudflare bool, timeout time.Duration, now func() time.Time) *Toucher {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	return &Toucher{users: users, trustCloudflare: trustCloudflare, timeout: timeout, now: now, lastWrite: map[string]time.Time{}}
}

// Touch mirrors main._touch_activity_best_effort for one request. A nil
// Toucher does nothing.
func (t *Toucher) Touch(r *http.Request, username string) {
	if t == nil || username == "" {
		return
	}
	now := t.now()
	t.mu.Lock()
	if previous, ok := t.lastWrite[username]; ok && now.Sub(previous) < WriteInterval {
		t.mu.Unlock()
		return
	}
	// Claim the slot before writing so concurrent requests do not all write.
	t.lastWrite[username] = now
	t.mu.Unlock()

	value := PyUTCISOFormat(now)
	fields := bson.M{"last_activity": value, "presence_online": true}
	ip, country := t.clientNetwork(r)
	if ip != "" {
		fields["last_client_ip"] = truncate(ip, 64)
	}
	if country != "" {
		fields["last_client_country"] = country
	}
	if session := sessionID(r); session != "" {
		fields["presence_sessions."+session+".last_activity"] = value
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), t.timeout)
	defer cancel()
	if err := t.users.UpdateOne(ctx, bson.M{"_id": username}, bson.M{"$set": fields}); err != nil {
		// Python logs and moves on; let the next request retry the write.
		t.mu.Lock()
		if t.lastWrite[username].Equal(now) {
			delete(t.lastWrite, username)
		}
		t.mu.Unlock()
	}
}

// sessionID mirrors main._presence_session_id.
func sessionID(r *http.Request) string {
	raw := strings.TrimSpace(r.Header.Get("X-Presence-Session"))
	if raw != "" && sessionPattern.MatchString(raw) {
		return raw
	}
	if strings.HasPrefix(strings.TrimSpace(r.Header.Get("Authorization")), "Bearer ") {
		return "legacy_client"
	}
	return ""
}

// clientNetwork mirrors main._client_network: Cloudflare headers only behind
// the Cloudflare boundary, else the peer address.
func (t *Toucher) clientNetwork(r *http.Request) (string, string) {
	cloudflare := strings.TrimSpace(r.Header.Get("CF-Ray")) != "" || t.trustCloudflare
	raw := ""
	if cloudflare {
		raw = strings.TrimSpace(r.Header.Get("CF-Connecting-IP"))
	}
	if raw == "" {
		raw = r.RemoteAddr
		if host, _, err := net.SplitHostPort(raw); err == nil {
			raw = host
		}
	}
	ip := ""
	if addr, err := netip.ParseAddr(strings.TrimSpace(raw)); err == nil {
		ip = addr.String()
	}
	country := ""
	if cloudflare {
		c := strings.ToUpper(strings.TrimSpace(r.Header.Get("CF-IPCountry")))
		if countryPattern.MatchString(c) && c != "XX" && c != "T1" {
			country = c
		}
	}
	return ip, country
}

// PyUTCISOFormat is datetime.now(timezone.utc).isoformat(): microseconds only
// when non-zero, "+00:00" offset.
func PyUTCISOFormat(t time.Time) string {
	t = t.UTC()
	base := t.Format("2006-01-02T15:04:05")
	if micro := t.Nanosecond() / 1000; micro != 0 {
		base += fmt.Sprintf(".%06d", micro)
	}
	return base + "+00:00"
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

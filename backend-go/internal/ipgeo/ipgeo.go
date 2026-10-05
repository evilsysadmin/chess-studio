// Package ipgeo is backend-python/ip_geolocation.py: the minimal IP→country
// fallback Admin's user list uses when Cloudflare gave no country. Public
// addresses only, a per-process cache (24 h for a country, 10 min for a
// miss) and background lookups that never add request latency.
package ipgeo

import (
	"context"
	"encoding/json"
	"math/big"
	"net/http"
	"net/netip"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	successTTL = 24 * time.Hour
	failureTTL = 10 * time.Minute
)

func prefixes(raw ...string) []netip.Prefix {
	out := make([]netip.Prefix, len(raw))
	for i, p := range raw {
		out[i] = netip.MustParsePrefix(p)
	}
	return out
}

// CPython 3.13's ipaddress tables (is_private / is_global).
var (
	v4Private = prefixes("0.0.0.0/8", "10.0.0.0/8", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24",
		"192.0.0.170/31", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24",
		"240.0.0.0/4", "255.255.255.255/32")
	v4Exceptions = prefixes("192.0.0.9/32", "192.0.0.10/32")
	v4Shared     = netip.MustParsePrefix("100.64.0.0/10")
	v6Private    = prefixes("::1/128", "::/128", "::ffff:0:0/96", "64:ff9b:1::/48", "100::/64", "2001::/23",
		"2001:db8::/32", "2002::/16", "3fff::/20", "fc00::/7", "fe80::/10")
	v6Exceptions = prefixes("2001:1::1/128", "2001:1::2/128", "2001:3::/32", "2001:4:112::/48", "2001:20::/28", "2001:30::/28")
	countryRE    = regexp.MustCompile(`^[A-Z]{2}$`)
)

func within(addr netip.Addr, nets []netip.Prefix) bool {
	for _, n := range nets {
		if n.Contains(addr) {
			return true
		}
	}
	return false
}

func private(addr netip.Addr, nets, exceptions []netip.Prefix) bool {
	return within(addr, nets) && !within(addr, exceptions)
}

// isGlobal is ipaddress.ip_address(...).is_global.
func isGlobal(addr netip.Addr) bool {
	addr = addr.WithZone("")
	if addr.Is4In6() {
		addr = addr.Unmap()
	}
	if addr.Is4() {
		return !v4Shared.Contains(addr) && !private(addr, v4Private, v4Exceptions)
	}
	return !private(addr, v6Private, v6Exceptions)
}

// parse is ipaddress.ip_address over a stored value (strings and ints).
func parse(raw any) (netip.Addr, bool) {
	switch v := raw.(type) {
	case string:
		addr, err := netip.ParseAddr(v)
		return addr, err == nil
	case int32:
		return parse(int64(v))
	case int64:
		if v < 0 {
			return netip.Addr{}, false
		}
		n := big.NewInt(v)
		if v < 1<<32 {
			return netip.AddrFrom4([4]byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)}), true
		}
		var b [16]byte
		n.FillBytes(b[:])
		return netip.AddrFrom16(b), true
	}
	return netip.Addr{}, false
}

func falsy(raw any) bool {
	switch v := raw.(type) {
	case nil:
		return true
	case string:
		return v == ""
	case int32:
		return v == 0
	case int64:
		return v == 0
	case bool:
		return !v
	}
	return false
}

// Status is network_location_status: missing, invalid, private or public.
func Status(raw any) string {
	if falsy(raw) {
		return "missing"
	}
	addr, ok := parse(raw)
	if !ok {
		return "invalid"
	}
	if isGlobal(addr) {
		return "public"
	}
	return "private"
}

func publicIP(raw any) (string, bool) {
	if Status(raw) != "public" {
		return "", false
	}
	addr, _ := parse(raw)
	return addr.String(), true
}

type entry struct {
	expires time.Time
	country string
}

// Resolver is the process-wide cache plus its background lookups.
type Resolver struct {
	mu      sync.Mutex
	cache   map[string]entry
	pending map[string]bool
	lookup  func(ctx context.Context, ip string) string
	now     func() time.Time
}

// New uses ipwho.is like resolve_country_code; lookup may be replaced in tests.
func New(lookup func(ctx context.Context, ip string) string) *Resolver {
	if lookup == nil {
		lookup = IPWhoIs(&http.Client{Timeout: 2 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }})
	}
	return &Resolver{cache: map[string]entry{}, pending: map[string]bool{}, lookup: lookup, now: time.Now}
}

// Cached is cached_country_code: "" when unknown or expired.
func (r *Resolver) Cached(raw any) string {
	ip, ok := publicIP(raw)
	if !ok {
		return ""
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	hit, found := r.cache[ip]
	if !found {
		return ""
	}
	if !hit.expires.After(r.now()) {
		delete(r.cache, ip)
		return ""
	}
	return hit.country
}

// Schedule is schedule_country_resolution: one background lookup per IP.
func (r *Resolver) Schedule(raw any) bool {
	ip, ok := publicIP(raw)
	if !ok {
		return false
	}
	r.mu.Lock()
	if hit, found := r.cache[ip]; (found && hit.expires.After(r.now())) || r.pending[ip] {
		r.mu.Unlock()
		return false
	}
	r.pending[ip] = true
	r.mu.Unlock()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		country := r.lookup(ctx, ip)
		ttl := failureTTL
		if country != "" {
			ttl = successTTL
		}
		r.mu.Lock()
		r.cache[ip] = entry{expires: r.now().Add(ttl), country: country}
		delete(r.pending, ip)
		r.mu.Unlock()
	}()
	return true
}

// IPWhoIs is resolve_country_code's request: only a two-letter country_code
// (never XX or T1) is kept.
func IPWhoIs(client *http.Client) func(ctx context.Context, ip string) string {
	return func(ctx context.Context, ip string) string {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://ipwho.is/"+ip, nil)
		if err != nil {
			return ""
		}
		resp, err := client.Do(req)
		if err != nil {
			return ""
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return ""
		}
		var payload map[string]any
		if json.NewDecoder(resp.Body).Decode(&payload) != nil || payload["success"] == false {
			return ""
		}
		code, _ := payload["country_code"].(string)
		code = strings.ToUpper(strings.TrimSpace(code))
		if !countryRE.MatchString(code) || code == "XX" || code == "T1" {
			return ""
		}
		return code
	}
}

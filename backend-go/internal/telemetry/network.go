package telemetry

import (
	"crypto/rand"
	"encoding/hex"
	"net"
	"net/http"
	"net/netip"
	"regexp"
	"strings"
)

// sanitizeIP mirrors structured_logging.sanitize_ip (ipaddress.ip_address).
func sanitizeIP(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	addr, err := netip.ParseAddr(raw)
	if err != nil {
		return ""
	}
	return addr.String()
}

var countryPattern = regexp.MustCompile(`^[A-Z]{2}$`)

// sanitizeCountry mirrors structured_logging.sanitize_country.
func sanitizeCountry(value string) string {
	country := strings.ToUpper(cleanLogText(value, 2))
	if !countryPattern.MatchString(country) || country == "XX" || country == "T1" {
		return ""
	}
	return country
}

// sanitizeForwardedFor mirrors structured_logging.sanitize_forwarded_for.
func sanitizeForwardedFor(value string) []string {
	var out []string
	for _, part := range strings.Split(value, ",") {
		if clean := sanitizeIP(part); clean != "" {
			out = append(out, clean)
		}
		if len(out) >= 8 {
			break
		}
	}
	return out
}

var controlRun = regexp.MustCompile(`[\x00-\x1f\x7f]+`)

// cleanLogText mirrors structured_logging._clean_log_text (lengths in code
// points, as Python slices strings).
func cleanLogText(value string, maxLength int) string {
	text := strings.TrimSpace(controlRun.ReplaceAllString(value, " "))
	return truncateRunes(text, max(1, maxLength))
}

func truncateRunes(s string, n int) string {
	if len(s) <= n {
		return s
	}
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n])
}

var clientReleasePattern = regexp.MustCompile(`^v?[0-9A-Za-z][0-9A-Za-z._-]{0,39}$`)

// clientRelease mirrors observability.sanitize_client_release.
func clientRelease(r *http.Request) string {
	raw := truncateRunes(strings.TrimSpace(r.Header.Get("X-Client-Release")), 40)
	if raw == "" || !clientReleasePattern.MatchString(raw) {
		return ""
	}
	return raw
}

// requestID mirrors main._request_id: a safe incoming X-Request-ID, or a new
// 12-hex id.
func requestID(r *http.Request) string {
	incoming := strings.TrimSpace(r.Header.Get("X-Request-ID"))
	if n := len([]rune(incoming)); n >= 6 && n <= 80 && safeRequestID(incoming) {
		return incoming
	}
	buf := make([]byte, 6)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func safeRequestID(s string) bool {
	for _, r := range s {
		// str.isalnum() is Unicode-aware in Python.
		if !(isUnicodeAlnum(r) || r == '-' || r == '_' || r == '.') {
			return false
		}
	}
	return true
}

type networkFields struct {
	ClientIP      string
	ClientCountry string
	PeerIP        string
	ForwardedFor  []string
}

// requestNetwork mirrors main._request_network_log_fields: observability
// only, never an identity for auth or rate limits.
func requestNetwork(r *http.Request, trustCloudflare bool) networkFields {
	cloudflare := strings.TrimSpace(r.Header.Get("CF-Ray")) != "" || trustCloudflare
	peer := remoteHost(r.RemoteAddr)
	var fields networkFields
	raw := ""
	if cloudflare {
		raw = strings.TrimSpace(r.Header.Get("CF-Connecting-IP"))
	}
	if raw == "" {
		raw = peer
	}
	fields.ClientIP = sanitizeIP(raw)
	if cloudflare {
		country := strings.ToUpper(strings.TrimSpace(r.Header.Get("CF-IPCountry")))
		if countryPattern.MatchString(country) && country != "XX" && country != "T1" {
			fields.ClientCountry = country
		}
	}
	fields.PeerIP = sanitizeIP(peer)
	fields.ForwardedFor = sanitizeForwardedFor(r.Header.Get("X-Forwarded-For"))
	if trustCloudflare && !isGlobal(fields.ClientIP) {
		for _, candidate := range fields.ForwardedFor {
			if isGlobal(candidate) {
				fields.ClientIP = candidate
				break
			}
		}
	}
	return fields
}

func remoteHost(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}

// Python's ipaddress is_global: outside the IANA special-purpose registries
// (python 3.13 Lib/ipaddress.py _private_networks and its exceptions, plus
// 100.64.0.0/10 for IPv4; an IPv4-mapped address takes its IPv4 answer).
var (
	nonGlobalV4 = prefixes("0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
		"172.16.0.0/12", "192.0.0.0/24", "192.0.0.170/31", "192.0.2.0/24", "192.168.0.0/16",
		"198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "255.255.255.255/32")
	globalV4Exceptions = prefixes("192.0.0.9/32", "192.0.0.10/32")
	nonGlobalV6        = prefixes("::1/128", "::/128", "64:ff9b:1::/48", "100::/64", "2001::/23",
		"2001:db8::/32", "2002::/16", "3fff::/20", "fc00::/7", "fe80::/10")
	globalV6Exceptions = prefixes("2001:1::1/128", "2001:1::2/128", "2001:3::/32", "2001:4:112::/48",
		"2001:20::/28", "2001:30::/28")
)

func prefixes(values ...string) []netip.Prefix {
	out := make([]netip.Prefix, len(values))
	for i, v := range values {
		out[i] = netip.MustParsePrefix(v)
	}
	return out
}

func contains(list []netip.Prefix, addr netip.Addr) bool {
	for _, p := range list {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}

func isGlobal(ip string) bool {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return false
	}
	addr = addr.WithZone("")
	if addr.Is4In6() {
		addr = addr.Unmap()
	}
	if addr.Is4() {
		return contains(globalV4Exceptions, addr) || !contains(nonGlobalV4, addr)
	}
	return contains(globalV6Exceptions, addr) || !contains(nonGlobalV6, addr)
}

// Package corspolicy owns browser-origin defaults shared by native Go API
// domains. It mirrors the canonical Python CORS defaults during migration.
package corspolicy

var canonicalBrowserOrigins = [...]string{
	"http://localhost:5173",
	"http://127.0.0.1:5173",
	"https://evilsysadmin.github.io",
	"https://chess-studio.shadowops.dpdns.org",
	"https://staging.chess-studio.shadowops.dpdns.org",
}

// CanonicalBrowserOrigins returns a copy so domain handlers cannot mutate the
// process-wide policy accidentally.
func CanonicalBrowserOrigins() []string {
	return append([]string(nil), canonicalBrowserOrigins[:]...)
}

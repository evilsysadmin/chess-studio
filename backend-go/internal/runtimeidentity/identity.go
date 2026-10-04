// Package runtimeidentity owns the process-level service names shared by
// native Go API domains. Domain packages must not invent their own runtime
// identity merely because they migrated first.
package runtimeidentity

const (
	// DefaultBaseServiceName is the Python/backend service base used when
	// OTEL_SERVICE_NAME is absent.
	DefaultBaseServiceName = "chess-studio-backend"

	// GoServiceSuffix keeps Go telemetry distinct from Python while both
	// runtimes coexist.
	GoServiceSuffix = "-go"

	// CanonicalServiceName is the neutral default identity of the Go API front.
	CanonicalServiceName = DefaultBaseServiceName + GoServiceSuffix

	// LegacyPvPServiceName remains in readiness payloads until staging and
	// production probes have migrated away from the original PvP wedge name.
	LegacyPvPServiceName = "chess-studio-pvp-go"
)

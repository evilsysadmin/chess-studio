// Package pvpclock is the single Go source of the PvP time contract shared
// with backend-python/pvp_api.py (PVP_INITIAL_MS, PVP_INCREMENT_MS,
// PVP_READY_TIMEOUT_SECONDS, PVP_DISCONNECT_GRACE_SECONDS).
//
// Every Go path that creates, reads, moves, times out or forfeits a duel must
// use these values, including the fallback for legacy documents that predate a
// field. They used to be redeclared per package and drifted: the move path
// fell back to a 10 minute clock while every other path used 30.
package pvpclock

import "time"

const (
	// InitialMS is each side's starting clock and the fallback for a match
	// document without white_clock_ms/black_clock_ms.
	InitialMS int64 = 30 * 60 * 1000
	// IncrementMS is added to the mover's clock after each move.
	IncrementMS int64 = 0
	// ReadyTimeout bounds the handoff before both players confirm.
	ReadyTimeout = 30 * time.Second
	// DisconnectGrace is how long an absent player keeps the duel.
	DisconnectGrace = 60 * time.Second
)

// ClockMS returns a stored clock value, or InitialMS when the field is absent.
func ClockMS(value *int64) int64 {
	if value == nil {
		return InitialMS
	}
	return *value
}

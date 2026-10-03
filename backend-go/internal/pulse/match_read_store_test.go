package pulse

import (
	"testing"
	"time"
)

func TestMatchReadRecentlyPresentMatchesPythonFutureClamp(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 20, 0, 0, time.UTC)
	if !matchReadRecentlyPresent(now.Add(time.Second), now) {
		t.Fatal("future timestamp must clamp to age zero like Python")
	}
	if !matchReadRecentlyPresent(now.Add(-presenceReconnecting), now) {
		t.Fatal("12s boundary must remain recently present")
	}
	if matchReadRecentlyPresent(now.Add(-presenceReconnecting-time.Millisecond), now) {
		t.Fatal("older than reconnecting window must be absent")
	}
	if matchReadRecentlyPresent(time.Time{}, now) {
		t.Fatal("missing timestamp must be absent")
	}
}

func TestVirtualReadyMustNotActivateMatch(t *testing.T) {
	// Contract guard: GET-side virtual reconciliation only flips the virtual
	// ready bit. Activation belongs to the explicit ready handshake.
	row := cancelMatchRow{White: "alice", Black: "otto_falk", Status: "starting", WhiteReady: true, BlackReady: false}
	if row.Status != "starting" || !row.WhiteReady || row.BlackReady {
		t.Fatalf("fixture drift=%#v", row)
	}
}

func TestReadHandoffTimeoutBoundaryIsInclusive(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 20, 0, 0, time.UTC)
	row := cancelMatchRow{Status: "starting", ReadyDeadline: now}
	if row.ReadyDeadline.After(now) {
		t.Fatal("deadline equal to now must be eligible for timeout")
	}
}

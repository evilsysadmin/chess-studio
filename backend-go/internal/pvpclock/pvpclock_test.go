package pvpclock

import (
	"os"
	"regexp"
	"strconv"
	"testing"
	"time"
)

// The Python authority is still the rollback path, so the two runtimes must
// agree on every timing constant. Read them from pvp_api.py instead of
// restating them here.
func TestTimingContractMatchesPythonAuthority(t *testing.T) {
	source, err := os.ReadFile("../../../backend-python/pvp_api.py")
	if err != nil {
		t.Fatalf("read Python PvP authority: %v", err)
	}
	read := func(name string) int64 {
		match := regexp.MustCompile(`(?m)^` + name + `\s*=\s*(.+)$`).FindSubmatch(source)
		if match == nil {
			t.Fatalf("%s not found in pvp_api.py", name)
		}
		total := int64(1)
		for _, part := range regexp.MustCompile(`\d+`).FindAll(match[1], -1) {
			value, _ := strconv.ParseInt(string(part), 10, 64)
			total *= value
		}
		return total
	}
	if got := read("PVP_INITIAL_MS"); got != InitialMS {
		t.Fatalf("InitialMS=%d, Python PVP_INITIAL_MS=%d", InitialMS, got)
	}
	if got := read("PVP_INCREMENT_MS"); got != IncrementMS {
		t.Fatalf("IncrementMS=%d, Python PVP_INCREMENT_MS=%d", IncrementMS, got)
	}
	if got := read("PVP_READY_TIMEOUT_SECONDS"); time.Duration(got)*time.Second != ReadyTimeout {
		t.Fatalf("ReadyTimeout=%s, Python=%ds", ReadyTimeout, got)
	}
	if got := read("PVP_DISCONNECT_GRACE_SECONDS"); time.Duration(got)*time.Second != DisconnectGrace {
		t.Fatalf("DisconnectGrace=%s, Python=%ds", DisconnectGrace, got)
	}
}

func TestClockMSFallsBackForLegacyDocuments(t *testing.T) {
	if got := ClockMS(nil); got != InitialMS {
		t.Fatalf("ClockMS(nil)=%d want %d", got, InitialMS)
	}
	stored := int64(1234)
	if got := ClockMS(&stored); got != 1234 {
		t.Fatalf("ClockMS(1234)=%d", got)
	}
}

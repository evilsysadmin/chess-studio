package pulse

import (
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchresign"
)

func TestResignDomainMatchPreservesTransitionState(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	result := "0-1"
	endReason := "resignation"
	whiteClock := int64(598500)
	blackClock := int64(600000)
	row := cancelMatchRow{
		ID: "m-1", White: "alice", Black: "bob", Turn: "w", Status: "finished",
		Result: &result, EndReason: &endReason, Revision: 8,
		WhiteClockMS: &whiteClock, BlackClockMS: &blackClock, UpdatedAt: now,
	}
	got := resignDomainMatch(row)
	if got.ID != "m-1" || got.White != "alice" || got.Black != "bob" || got.Status != "finished" {
		t.Fatalf("identity/state drift: %#v", got)
	}
	if got.Result != "0-1" || got.EndReason != "resignation" || got.Revision != 8 {
		t.Fatalf("terminal drift: %#v", got)
	}
	if got.WhiteClockMS != 598500 || got.BlackClockMS != 600000 || !got.UpdatedAt.Equal(now) {
		t.Fatalf("clock/timestamp drift: %#v", got)
	}
}

func TestResignDomainMatchDefaultsMissingClocksLikePython(t *testing.T) {
	got := resignDomainMatch(cancelMatchRow{ID: "m", White: "a", Black: "b", Status: "active"})
	if got.WhiteClockMS != pvpInitialClockMS || got.BlackClockMS != pvpInitialClockMS {
		t.Fatalf("clocks=%d/%d", got.WhiteClockMS, got.BlackClockMS)
	}
}

func TestResignStoreImplementsDomainContract(t *testing.T) {
	var _ matchresign.Store = (*ResignStore)(nil)
}

func TestMaxRatingClockClampsNegativeValues(t *testing.T) {
	if got := maxRatingClock(-1); got != 0 {
		t.Fatalf("got=%d", got)
	}
	if got := maxRatingClock(42); got != 42 {
		t.Fatalf("got=%d", got)
	}
}

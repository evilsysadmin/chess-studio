package pulse

import (
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchtimeout"
)

func TestTimeoutDomainMatchPreservesLifecycleState(t *testing.T) {
	now:=time.Date(2026,10,2,13,0,0,0,time.UTC)
	result:="0-1"
	endReason:="timeout"
	whiteClock:=int64(0)
	blackClock:=int64(12345)
	row:=cancelMatchRow{
		ID:"m-1",White:"alice",Black:"bob",Turn:"w",Status:"finished",
		Result:&result,EndReason:&endReason,Revision:5,
		WhiteClockMS:&whiteClock,BlackClockMS:&blackClock,UpdatedAt:now,
	}
	got:=timeoutDomainMatch(row)
	if got.ID!="m-1" || got.Status!="finished" || got.Result!="0-1" || got.EndReason!="timeout" {
		t.Fatalf("state drift: %#v",got)
	}
	if got.Revision!=5 || got.WhiteClockMS!=0 || got.BlackClockMS!=12345 || !got.UpdatedAt.Equal(now) {
		t.Fatalf("clock/revision drift: %#v",got)
	}
}

func TestTimeoutDomainMatchDefaultsMissingClocks(t *testing.T) {
	got:=timeoutDomainMatch(cancelMatchRow{ID:"m",Status:"active"})
	if got.WhiteClockMS!=pvpInitialClockMS || got.BlackClockMS!=pvpInitialClockMS {
		t.Fatalf("clocks=%d/%d",got.WhiteClockMS,got.BlackClockMS)
	}
}

func TestTimeoutStoreImplementsDomainContract(t *testing.T) {
	var _ matchtimeout.Store = (*TimeoutStore)(nil)
}

func TestClampTimeoutClock(t *testing.T) {
	if got:=clampTimeoutClock(-5); got!=0 { t.Fatalf("got=%d",got) }
	if got:=clampTimeoutClock(5); got!=5 { t.Fatalf("got=%d",got) }
}

package pulse

import (
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchdisconnect"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestDisconnectGraceFieldMatchesPythonSchema(t *testing.T) {
	if got := disconnectGraceField(matchdisconnect.White); got != "white_disconnect_grace_started_at" {
		t.Fatalf("white field=%q", got)
	}
	if got := disconnectGraceField(matchdisconnect.Black); got != "black_disconnect_grace_started_at" {
		t.Fatalf("black field=%q", got)
	}
	if got := disconnectGraceField(matchdisconnect.Color("x")); got != "" {
		t.Fatalf("invalid field=%q", got)
	}
}

func TestDisconnectGraceUpdateUsesMinUnlessRestarting(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 15, 0, 0, time.UTC)
	field := "black_disconnect_grace_started_at"
	stable := disconnectGraceUpdate(field, now, false)
	min, ok := stable["$min"].(bson.M)
	if !ok || !min[field].(time.Time).Equal(now) {
		t.Fatalf("stable=%#v", stable)
	}
	restart := disconnectGraceUpdate(field, now, true)
	set, ok := restart["$set"].(bson.M)
	if !ok || !set[field].(time.Time).Equal(now) {
		t.Fatalf("restart=%#v", restart)
	}
}

func TestDisconnectDomainMatchPreservesPresenceAndGrace(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 15, 0, 0, time.UTC)
	whiteSeen := now.Add(-time.Second)
	blackSeen := now.Add(-20 * time.Second)
	blackGrace := now.Add(-30 * time.Second)
	whiteClock := int64(599000)
	blackClock := int64(600000)
	row := cancelMatchRow{
		ID: "m-1", White: "alice", Black: "bob", Turn: "w", Status: "active", Revision: 9,
		WhiteClockMS: &whiteClock, BlackClockMS: &blackClock,
		WhiteSeenAt: whiteSeen, BlackSeenAt: blackSeen,
		BlackDisconnectGraceStarted: blackGrace, TurnStartedAt: now.Add(-time.Second), UpdatedAt: now,
	}
	got := disconnectDomainMatch(row)
	if got.ID != "m-1" || got.Revision != 9 || got.WhiteClockMS != 599000 || got.BlackClockMS != 600000 {
		t.Fatalf("core drift=%#v", got)
	}
	if !got.WhiteSeenAt.Equal(whiteSeen) || !got.BlackSeenAt.Equal(blackSeen) || !got.BlackGraceAt.Equal(blackGrace) {
		t.Fatalf("presence drift=%#v", got)
	}
}

func TestDisconnectDomainMatchDefaultsMissingClocks(t *testing.T) {
	got := disconnectDomainMatch(cancelMatchRow{ID: "m", Status: "active"})
	if got.WhiteClockMS != pvpInitialClockMS || got.BlackClockMS != pvpInitialClockMS {
		t.Fatalf("clocks=%d/%d", got.WhiteClockMS, got.BlackClockMS)
	}
}

func TestDisconnectStoreImplementsDomainContract(t *testing.T) {
	var _ matchdisconnect.Store = (*DisconnectStore)(nil)
}

func TestClampDisconnectClock(t *testing.T) {
	if got := clampDisconnectClock(-1); got != 0 {
		t.Fatalf("got=%d", got)
	}
	if got := clampDisconnectClock(9); got != 9 {
		t.Fatalf("got=%d", got)
	}
}

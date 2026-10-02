package pulse

import (
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/matchmove"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestMoveDomainMatchMapsAuthoritativeSnapshot(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 15, 0, 0, time.UTC)
	result := "1-0"
	reason := "legacy"
	whiteClock := int64(1234)
	blackClock := int64(5678)
	row := cancelMatchRow{
		ID: "m-1", White: "alice", Black: "bob",
		FEN: "fen", Turn: "b", Status: "finished",
		Result: &result, EndReason: &reason, Revision: 9,
		WhiteClockMS: &whiteClock, BlackClockMS: &blackClock,
		StartAt: now.Add(-time.Minute), TurnStartedAt: time.Time{},
		History: []bson.M{{
			"ply": int32(3), "uci": "e2e4", "san": "e4",
			"by": "alice", "at": bson.NewDateTimeFromTime(now),
		}},
	}

	got := moveDomainMatch(row)
	if got.ID != "m-1" || got.White != "alice" || got.Black != "bob" ||
		got.FEN != "fen" || got.Turn != "b" || got.Status != "finished" || got.Revision != 9 {
		t.Fatalf("core drift: %#v", got)
	}
	if got.Result == nil || *got.Result != "1-0" || got.EndReason == nil || *got.EndReason != "legacy" {
		t.Fatalf("terminal drift: result=%v reason=%v", got.Result, got.EndReason)
	}
	if got.WhiteClockMS != 1234 || got.BlackClockMS != 5678 {
		t.Fatalf("clocks=%d/%d", got.WhiteClockMS, got.BlackClockMS)
	}
	if len(got.History) != 1 {
		t.Fatalf("history=%#v", got.History)
	}
	entry := got.History[0]
	if entry.Ply != 3 || entry.UCI != "e2e4" || entry.SAN != "e4" || entry.By != "alice" || !entry.At.Equal(now) {
		t.Fatalf("entry=%#v", entry)
	}
}

func TestMoveDomainMatchDefaultsOnlyMissingClocks(t *testing.T) {
	zero := int64(0)
	got := moveDomainMatch(cancelMatchRow{ID: "m", WhiteClockMS: &zero})
	if got.WhiteClockMS != 0 {
		t.Fatalf("explicit zero white clock=%d", got.WhiteClockMS)
	}
	if got.BlackClockMS != matchmove.InitialClockMS {
		t.Fatalf("missing black clock=%d", got.BlackClockMS)
	}
}

func TestMoveCommitFilterLocksRevisionAndExcludesStaged(t *testing.T) {
	filter := moveCommitFilter("m-1", 12)
	if filter["_id"] != "m-1" || filter["revision"] != int64(12) {
		t.Fatalf("filter=%#v", filter)
	}
	acceptance, ok := filter["acceptance_state"].(bson.M)
	if !ok || acceptance["$ne"] != "staged" {
		t.Fatalf("acceptance=%#v", filter["acceptance_state"])
	}
}

func TestMoveUpdateDocumentMatchesPythonCASPayload(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 15, 0, 0, time.UTC)
	result := "0-1"
	update := matchmove.Update{
		ExpectedRevision: 7,
		FEN: "next-fen",
		Turn: "w",
		Status: "finished",
		Result: &result,
		EndReason: nil,
		History: []matchmove.HistoryEntry{{
			Ply: 4, UCI: "d8h4", SAN: "Qh4#", By: "bob", At: now,
		}},
		WhiteClockMS: 599000,
		BlackClockMS: 598500,
		TurnStartedAt: time.Time{},
		UpdatedAt: now,
	}

	doc := moveUpdateDocument(update)
	set, ok := doc["$set"].(bson.M)
	if !ok {
		t.Fatalf("set=%#v", doc["$set"])
	}
	if set["fen"] != "next-fen" || set["turn"] != "w" || set["status"] != "finished" ||
		set["result"] != "0-1" || set["end_reason"] != nil {
		t.Fatalf("set core=%#v", set)
	}
	if set["white_clock_ms"] != int64(599000) || set["black_clock_ms"] != int64(598500) {
		t.Fatalf("clocks=%#v/%#v", set["white_clock_ms"], set["black_clock_ms"])
	}
	if set["turn_started_at"] != nil || set["updated_at"] != now {
		t.Fatalf("timestamps started=%#v updated=%#v", set["turn_started_at"], set["updated_at"])
	}
	history, ok := set["history"].([]bson.M)
	if !ok || len(history) != 1 {
		t.Fatalf("history=%#v", set["history"])
	}
	if history[0]["ply"] != 4 || history[0]["uci"] != "d8h4" || history[0]["san"] != "Qh4#" ||
		history[0]["by"] != "bob" || history[0]["at"] != now {
		t.Fatalf("history row=%#v", history[0])
	}
	inc, ok := doc["$inc"].(bson.M)
	if !ok || inc["revision"] != 1 {
		t.Fatalf("inc=%#v", doc["$inc"])
	}
}

func TestMoveUpdateDocumentKeepsRunningClockForActiveMove(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 15, 0, 0, time.UTC)
	update := matchmove.Update{
		FEN: "fen", Turn: "b", Status: "active",
		WhiteClockMS: 598500, BlackClockMS: 600000,
		TurnStartedAt: now, UpdatedAt: now,
	}
	set := moveUpdateDocument(update)["$set"].(bson.M)
	if stamp, ok := set["turn_started_at"].(time.Time); !ok || !stamp.Equal(now) {
		t.Fatalf("turn_started_at=%#v", set["turn_started_at"])
	}
	if set["result"] != nil {
		t.Fatalf("result=%#v", set["result"])
	}
}

func TestMoveHistoryBSONRoundTrip(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 15, 0, 0, time.UTC)
	input := []matchmove.HistoryEntry{{Ply: 1, UCI: "e2e4", SAN: "e4", By: "alice", At: now}}
	roundTrip := moveDomainHistory(moveHistoryBSON(input))
	if len(roundTrip) != 1 || roundTrip[0] != input[0] {
		t.Fatalf("round trip=%#v want=%#v", roundTrip, input)
	}
}

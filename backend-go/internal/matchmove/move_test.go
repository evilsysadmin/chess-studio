package matchmove

import (
	"errors"
	"testing"
	"time"
)

func startMatch(now time.Time) Match {
	return Match{
		ID:            "m-1",
		White:         "alice",
		Black:         "bob",
		FEN:           "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		Turn:          "w",
		Status:        "active",
		WhiteClockMS:  600000,
		BlackClockMS:  600000,
		TurnStartedAt: now.Add(-1500 * time.Millisecond),
		Revision:      7,
	}
}

func TestPrepareBuildsPythonCompatibleMoveSnapshot(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 0, 0, 0, time.UTC)
	match := startMatch(now)
	match.History = []HistoryEntry{{Ply: 1, UCI: "a2a3", SAN: "a3", By: "alice", At: now.Add(-time.Minute)}}

	got, err := Prepare(match, " Alice ", Request{From: "e2", To: "e4"}, now)
	if err != nil {
		t.Fatal(err)
	}
	if got.ExpectedRevision != 7 || got.UCI != "e2e4" || got.SAN != "e4" {
		t.Fatalf("identity=%#v", got)
	}
	if got.FEN != "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" ||
		got.Turn != "b" || got.Status != "active" || got.Result != nil {
		t.Fatalf("board snapshot=%#v", got)
	}
	if got.WhiteClockMS != 598500 || got.BlackClockMS != 600000 {
		t.Fatalf("clocks=%d/%d", got.WhiteClockMS, got.BlackClockMS)
	}
	if !got.TurnStartedAt.Equal(now) || !got.UpdatedAt.Equal(now) {
		t.Fatalf("timestamps turn=%v updated=%v", got.TurnStartedAt, got.UpdatedAt)
	}
	if len(got.History) != 2 {
		t.Fatalf("history=%#v", got.History)
	}
	last := got.History[1]
	if last.Ply != 2 || last.UCI != "e2e4" || last.SAN != "e4" || last.By != "alice" || !last.At.Equal(now) {
		t.Fatalf("last history=%#v", last)
	}
	if len(match.History) != 1 {
		t.Fatalf("Prepare mutated input history: %#v", match.History)
	}
}

func TestPrepareMateStopsClockAndClearsBoardTerminalReason(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 0, 0, 0, time.UTC)
	legacyReason := "something-old"
	match := Match{
		ID:            "m-2",
		White:         "alice",
		Black:         "bob",
		FEN:           "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
		Turn:          "b",
		Status:        "active",
		EndReason:     &legacyReason,
		WhiteClockMS:  600000,
		BlackClockMS:  600000,
		TurnStartedAt: now.Add(-500 * time.Millisecond),
		Revision:      11,
	}

	got, err := Prepare(match, "bob", Request{From: "d8", To: "h4"}, now)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "finished" || got.Result == nil || *got.Result != "0-1" {
		t.Fatalf("terminal=%#v", got)
	}
	if got.EndReason != nil {
		t.Fatalf("end reason=%#v want nil", got.EndReason)
	}
	if !got.TurnStartedAt.IsZero() {
		t.Fatalf("turn_started_at=%v want zero", got.TurnStartedAt)
	}
	if got.WhiteClockMS != 600000 || got.BlackClockMS != 599500 {
		t.Fatalf("clocks=%d/%d", got.WhiteClockMS, got.BlackClockMS)
	}
	if got.SAN != "Qh4#" {
		t.Fatalf("san=%q", got.SAN)
	}
}

func TestPrepareGuardsParticipantStateTurnCountdownAndClock(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 0, 0, 0, time.UTC)

	tests := []struct {
		name   string
		mutate func(*Match)
		user   string
		want   error
	}{
		{"outsider", func(*Match) {}, "mallory", ErrNotParticipant},
		{"terminal", func(m *Match) { m.Status = "finished" }, "alice", ErrWrongState},
		{"wrong turn", func(m *Match) { m.Turn = "b" }, "alice", ErrWrongTurn},
		{"countdown", func(m *Match) { m.StartAt = now.Add(time.Second) }, "alice", ErrCountdown},
		{"expired clock", func(m *Match) {
			m.WhiteClockMS = 500
			m.TurnStartedAt = now.Add(-time.Second)
		}, "alice", ErrClockExpired},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			match := startMatch(now)
			tc.mutate(&match)
			_, err := Prepare(match, tc.user, Request{From: "e2", To: "e4"}, now)
			if !errors.Is(err, tc.want) {
				t.Fatalf("err=%v want=%v", err, tc.want)
			}
		})
	}
}

func TestPrepareSeparatesInvalidIllegalAndCorruptPosition(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 0, 0, 0, time.UTC)
	match := startMatch(now)

	if _, err := Prepare(match, "alice", Request{From: "e2", To: "e9"}, now); !errors.Is(err, ErrInvalidMove) {
		t.Fatalf("invalid err=%v", err)
	}
	if _, err := Prepare(match, "alice", Request{From: "e2", To: "e5"}, now); !errors.Is(err, ErrIllegalMove) {
		t.Fatalf("illegal err=%v", err)
	}

	match.FEN = "corrupt persisted fen"
	if _, err := Prepare(match, "alice", Request{From: "e2", To: "e4"}, now); !errors.Is(err, ErrInvalidPosition) {
		t.Fatalf("position err=%v", err)
	}
}

func TestClockSnapshotPreservesZeroAndFutureCountdown(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 0, 0, 0, time.UTC)
	match := startMatch(now)
	match.WhiteClockMS = 0
	match.TurnStartedAt = now.Add(time.Second)

	white, black := ClockSnapshot(match, now)
	if white != 0 || black != 600000 {
		t.Fatalf("future clocks=%d/%d", white, black)
	}

	match.TurnStartedAt = now.Add(-time.Second)
	white, black = ClockSnapshot(match, now)
	if white != 0 || black != 600000 {
		t.Fatalf("expired clocks=%d/%d", white, black)
	}
}

func TestPrepareNormalizesPromotionThroughRulesAdapter(t *testing.T) {
	now := time.Date(2026, 10, 2, 14, 0, 0, 0, time.UTC)
	match := Match{
		ID:            "m-p",
		White:         "alice",
		Black:         "bob",
		FEN:           "7k/P7/8/8/8/8/8/7K w - - 0 1",
		Turn:          "w",
		Status:        "active",
		WhiteClockMS:  600000,
		BlackClockMS:  600000,
		TurnStartedAt: now,
	}
	got, err := Prepare(match, "alice", Request{From: "a7", To: "a8", Promotion: "Q"}, now)
	if err != nil {
		t.Fatal(err)
	}
	if got.UCI != "a7a8q" || got.SAN != "a8=Q+" {
		t.Fatalf("promotion=%#v", got)
	}
}

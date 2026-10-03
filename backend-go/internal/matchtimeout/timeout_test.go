package matchtimeout

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeStore struct {
	match       Match
	found       bool
	err         error
	finishOK    bool
	finishErr   error
	finishCalls int
	revision    int64
	result      string
	whiteClock  int64
	blackClock  int64
	stamp       time.Time
}

func (f *fakeStore) GetMatch(context.Context, string) (Match, bool, error) {
	return f.match, f.found, f.err
}
func (f *fakeStore) FinishTimeout(_ context.Context, _ string, revision int64, result string, whiteClock, blackClock int64, stamp time.Time) (Match, bool, error) {
	f.finishCalls++
	f.revision = revision
	f.result = result
	f.whiteClock = whiteClock
	f.blackClock = blackClock
	f.stamp = stamp
	if f.finishErr != nil {
		return Match{}, false, f.finishErr
	}
	if !f.finishOK {
		return Match{}, false, nil
	}
	updated := f.match
	updated.Status = "finished"
	updated.Result = result
	updated.EndReason = "timeout"
	updated.WhiteClockMS = whiteClock
	updated.BlackClockMS = blackClock
	updated.TurnStartedAt = time.Time{}
	updated.Revision++
	updated.UpdatedAt = stamp
	return updated, true, nil
}

func active(now time.Time) Match {
	return Match{
		ID: "m-1", White: "alice", Black: "bob", Turn: "w", Status: "active", Revision: 4,
		WhiteClockMS: 1000, BlackClockMS: 5000, TurnStartedAt: now.Add(-1500 * time.Millisecond),
	}
}

func TestFinishIfExpiredFlagsSideToMoveOnly(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 0, 0, 0, time.UTC)
	store := &fakeStore{match: active(now), found: true, finishOK: true}
	service, _ := New(Config{Store: store, Now: func() time.Time { return now }})
	match, outcome, err := service.FinishIfExpired(context.Background(), "m-1")
	if err != nil {
		t.Fatal(err)
	}
	if outcome != OutcomeFinished || match.Status != "finished" || match.Result != "0-1" || match.EndReason != "timeout" {
		t.Fatalf("outcome=%q match=%#v", outcome, match)
	}
	if store.revision != 4 || store.whiteClock != 0 || store.blackClock != 5000 {
		t.Fatalf("finish rev=%d clocks=%d/%d", store.revision, store.whiteClock, store.blackClock)
	}
}

func TestFinishIfExpiredBlackFlagProducesWhiteWin(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 0, 0, 0, time.UTC)
	match := active(now)
	match.Turn = "b"
	match.WhiteClockMS = 5000
	match.BlackClockMS = 1000
	store := &fakeStore{match: match, found: true, finishOK: true}
	service, _ := New(Config{Store: store, Now: func() time.Time { return now }})
	_, outcome, err := service.FinishIfExpired(context.Background(), "m-1")
	if err != nil {
		t.Fatal(err)
	}
	if outcome != OutcomeFinished || store.result != "1-0" || store.whiteClock != 5000 || store.blackClock != 0 {
		t.Fatalf("outcome=%q result=%q clocks=%d/%d", outcome, store.result, store.whiteClock, store.blackClock)
	}
}

func TestFinishIfExpiredNoopsBeforeDeadlineAndForTerminalMatch(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 0, 0, 0, time.UTC)
	future := active(now)
	future.TurnStartedAt = now.Add(5 * time.Second)
	terminal := active(now)
	terminal.Status = "finished"
	for _, match := range []Match{future, terminal} {
		store := &fakeStore{match: match, found: true}
		service, _ := New(Config{Store: store, Now: func() time.Time { return now }})
		got, outcome, err := service.FinishIfExpired(context.Background(), "m-1")
		if err != nil {
			t.Fatal(err)
		}
		if outcome != OutcomeNoop || got.ID != "m-1" || store.finishCalls != 0 {
			t.Fatalf("outcome=%q got=%#v calls=%d", outcome, got, store.finishCalls)
		}
	}
}

func TestClockSnapshotOnlyChargesCurrentTurn(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 0, 0, 0, time.UTC)
	match := active(now)
	white, black := ClockSnapshot(match, now)
	if white != 0 || black != 5000 {
		t.Fatalf("clocks=%d/%d", white, black)
	}
	match.Turn = "b"
	match.WhiteClockMS = 5000
	match.BlackClockMS = 4000
	white, black = ClockSnapshot(match, now)
	if white != 5000 || black != 2500 {
		t.Fatalf("black-turn clocks=%d/%d", white, black)
	}
}

func TestFinishIfExpiredRetriesCAS(t *testing.T) {
	now := time.Date(2026, 10, 2, 13, 0, 0, 0, time.UTC)
	store := &fakeStore{match: active(now), found: true, finishOK: false}
	service, _ := New(Config{Store: store, Now: func() time.Time { return now }})
	_, outcome, err := service.FinishIfExpired(context.Background(), "m-1")
	if err != nil {
		t.Fatal(err)
	}
	if outcome != OutcomeRevisionConflict || store.finishCalls != 3 {
		t.Fatalf("outcome=%q calls=%d", outcome, store.finishCalls)
	}
}

func TestFinishIfExpiredHandlesMissingAndStorageFailure(t *testing.T) {
	service, _ := New(Config{Store: &fakeStore{found: false}})
	_, outcome, err := service.FinishIfExpired(context.Background(), "missing")
	if err != nil || outcome != OutcomeNotFound {
		t.Fatalf("outcome=%q err=%v", outcome, err)
	}

	boom := errors.New("mongo down")
	service, _ = New(Config{Store: &fakeStore{err: boom}})
	_, _, err = service.FinishIfExpired(context.Background(), "m")
	if !errors.Is(err, boom) {
		t.Fatalf("err=%v", err)
	}
}

package presence

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type sessionCall struct {
	filter, update bson.D
}

type fakeSessions struct {
	calls    []sessionCall
	sessions bson.D
	matched  bool
	err      error
}

func (f *fakeSessions) Update(_ context.Context, filter, update bson.D) (bool, error) {
	f.calls = append(f.calls, sessionCall{filter, update})
	return f.matched, f.err
}

func (f *fakeSessions) PresenceSessions(context.Context, string) (bson.D, bool, error) {
	return f.sessions, true, f.err
}

var beatNow = time.Date(2026, 10, 5, 12, 0, 0, 0, time.UTC)

func newTestSessions(store *fakeSessions) (*Sessions, *Toucher) {
	toucher := newToucher(nil, false, time.Second, func() time.Time { return beatNow })
	s := NewSessions(store, toucher, time.Second)
	s.now = func() time.Time { return beatNow }
	return s, toucher
}

func set(update bson.D) bson.D { return lookup(update, "$set").(bson.D) }

func TestBeatWritesTheForcedTouchAndPrunesStaleTabs(t *testing.T) {
	store := &fakeSessions{matched: true, sessions: bson.D{
		{Key: "fresh", Value: bson.D{{Key: "last_activity", Value: "2026-10-05T11:59:00+00:00"}}},
		{Key: "edge", Value: bson.D{{Key: "last_activity", Value: "2026-10-05T11:45:00+00:00"}}},
		{Key: "old", Value: bson.D{{Key: "last_activity", Value: "2026-10-05T11:44:59.5Z"}}},
		{Key: "junk", Value: "x"},
		{Key: "nostamp", Value: bson.D{}},
	}}
	s, toucher := newTestSessions(store)
	foreground := true
	r := httptest.NewRequest("POST", "/api/auth/activity", nil)
	r.Header.Set("X-Presence-Session", "tab_12345678")
	r.RemoteAddr = "203.0.113.9:4321"
	if err := s.Beat(r, "alice", Heartbeat{Activity: "Partida", Foreground: &foreground, Release: "v16.6"}); err != nil {
		t.Fatal(err)
	}
	fields := set(store.calls[0].update)
	for key, want := range map[string]any{
		"last_activity": "2026-10-05T12:00:00+00:00", "presence_online": true, "current_activity": "Partida",
		"is_foreground": true, "foreground_updated_at": "2026-10-05T12:00:00+00:00", "client_release": "v16.6",
		"last_client_ip": "203.0.113.9", "last_login": "2026-10-05T12:00:00+00:00",
		"presence_sessions.tab_12345678.last_activity": "2026-10-05T12:00:00+00:00",
		"presence_sessions.tab_12345678.activity":      "Partida",
		"presence_sessions.tab_12345678.foreground":    true,
		"presence_sessions.tab_12345678.release":       "v16.6",
	} {
		if got := lookup(fields, key); got != want {
			t.Errorf("%s = %v, want %v", key, got, want)
		}
	}
	// Stale: older than 15 minutes, not a document, or without a timestamp.
	var pruned []string
	for _, call := range store.calls[1:] {
		unset := lookup(call.update, "$unset").(bson.D)
		pruned = append(pruned, unset[0].Key)
		guard := call.filter[1]
		switch unset[0].Key {
		case "presence_sessions.old":
			if guard.Value != "2026-10-05T11:44:59.5Z" {
				t.Errorf("old guard %v", guard)
			}
		default:
			if lookup(guard.Value.(bson.D), "$exists") != false {
				t.Errorf("%s guard %v", unset[0].Key, guard)
			}
		}
	}
	if len(pruned) != 3 || pruned[0] != "presence_sessions.old" || pruned[1] != "presence_sessions.junk" || pruned[2] != "presence_sessions.nostamp" {
		t.Fatalf("pruned %v", pruned)
	}
	// Ten minutes between prunes per account; the write counts for coalescing.
	store.calls = nil
	_ = s.Beat(r, "alice", Heartbeat{})
	if len(store.calls) != 1 {
		t.Fatalf("pruned again: %d calls", len(store.calls))
	}
	if _, ok := toucher.lastWrite["alice"]; !ok {
		t.Fatal("forced write not shared with the toucher")
	}
}

func TestBeatOnADeletedAccountChangesNothingElse(t *testing.T) {
	store := &fakeSessions{matched: false}
	s, toucher := newTestSessions(store)
	r := httptest.NewRequest("POST", "/", nil)
	r.Header.Set("Authorization", "Bearer x")
	if err := s.Beat(r, "ghost", Heartbeat{}); err != nil || len(store.calls) != 1 {
		t.Fatalf("%v %d", err, len(store.calls))
	}
	if _, ok := toucher.lastWrite["ghost"]; ok {
		t.Fatal("unmatched write recorded")
	}
	store.err = errors.New("down")
	if err := s.Beat(r, "ghost", Heartbeat{}); !errors.Is(err, ErrUnavailable) {
		t.Fatal(err)
	}
}

func TestLogoutKeepsAnotherLiveTabOnline(t *testing.T) {
	store := &fakeSessions{matched: true, sessions: bson.D{
		{Key: "a_tab_0001", Value: bson.D{{Key: "last_activity", Value: "2026-10-05T11:59:00.250000+00:00"}, {Key: "foreground", Value: int32(1)}, {Key: "activity", Value: "Puzzle"}}},
		{Key: "b_tab_0002", Value: bson.D{{Key: "last_activity", Value: "2026-10-05T11:58:00+00:00"}, {Key: "release", Value: "v1"}}},
		{Key: "c_tab_0003", Value: bson.D{{Key: "last_activity", Value: "2026-10-05T11:50:00+00:00"}}},
	}}
	s, _ := newTestSessions(store)
	r := httptest.NewRequest("POST", "/", nil)
	r.Header.Set("X-Presence-Session", "z_tab_0009")
	if err := s.Logout(r, "alice"); err != nil {
		t.Fatal(err)
	}
	if lookup(lookup(store.calls[0].update, "$unset").(bson.D), "presence_sessions.z_tab_0009") != "" {
		t.Fatalf("unset %v", store.calls[0].update)
	}
	fields := set(store.calls[1].update)
	want := bson.D{
		{Key: "presence_online", Value: true},
		{Key: "last_activity", Value: "2026-10-05T11:59:00.250000+00:00"},
		{Key: "is_foreground", Value: true},
		{Key: "foreground_updated_at", Value: "2026-10-05T11:59:00.250000+00:00"},
		{Key: "current_activity", Value: "Puzzle"},
	}
	if len(fields) != len(want) {
		t.Fatalf("fields %v", fields)
	}
	for i := range want {
		if fields[i] != want[i] {
			t.Fatalf("fields %v", fields)
		}
	}
	// Nobody left: offline.
	store.calls, store.sessions = nil, bson.D{}
	_ = s.Logout(r, "alice")
	if lookup(set(store.calls[1].update), "presence_online") != false {
		t.Fatalf("offline %v", store.calls[1].update)
	}
}

package challengecreate

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

type fakeStore struct {
	players    map[string]Player
	active     map[string]bool
	cooldown   time.Time
	hasCooldown bool
	created    Challenge
	createResult Challenge
	createNow bool
	err        error
	calls      []string
}

func (f *fakeStore) RosterMember(_ context.Context, username string, _ time.Time) (Player, bool, error) {
	f.calls = append(f.calls, "roster:"+username)
	if f.err != nil { return Player{}, false, f.err }
	p, ok := f.players[username]
	return p, ok, nil
}
func (f *fakeStore) HasActiveMatch(_ context.Context, username string) (bool, error) {
	f.calls = append(f.calls, "active:"+username)
	if f.err != nil { return false, f.err }
	return f.active[username], nil
}
func (f *fakeStore) CooldownUntil(_ context.Context, a, b string, _ time.Time) (time.Time, bool, error) {
	f.calls = append(f.calls, "cooldown:"+a+":"+b)
	if f.err != nil { return time.Time{}, false, f.err }
	return f.cooldown, f.hasCooldown, nil
}
func (f *fakeStore) CreateChallenge(_ context.Context, draft Challenge, _ time.Time) (Challenge, bool, error) {
	f.calls = append(f.calls, "create")
	f.created = draft
	if f.err != nil { return Challenge{}, false, f.err }
	if f.createResult.ID == "" { f.createResult = draft }
	return f.createResult, f.createNow, nil
}

func baseStore() *fakeStore {
	return &fakeStore{
		players: map[string]Player{
			"alice": {Username: "alice", Rating: 1200},
			"bob": {Username: "bob", Rating: 1350},
		},
		active: map[string]bool{},
		createNow: true,
	}
}

func TestCreateBuildsPendingChallengeFromAuthoritativeRosterRatings(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 0, 0, 0, time.UTC)
	store := baseStore()
	service, err := New(Config{
		Store: store,
		Now: func() time.Time { return now },
		NewID: func() (string, error) { return "ABCDEF0123456789ABCDEF0123456789", nil },
	})
	if err != nil { t.Fatal(err) }

	result, err := service.Create(context.Background(), " Alice ", " BOB ")
	if err != nil { t.Fatal(err) }
	if !result.CreatedNow {
		t.Fatal("expected fresh challenge")
	}
	got := store.created
	if got.ID != "abcdef0123456789abcdef0123456789" || got.Challenger != "alice" || got.Opponent != "bob" {
		t.Fatalf("identity drift: %#v", got)
	}
	if got.ChallengerRating != 1200 || got.OpponentRating != 1350 || got.Status != "pending" || !got.CreatedAt.Equal(now) {
		t.Fatalf("draft drift: %#v", got)
	}
}

func TestCreatePreservesPythonPreconditionOrder(t *testing.T) {
	tests := []struct {
		name string
		mutate func(*fakeStore)
		want error
		wantCalls []string
	}{
		{"self missing roster", func(f *fakeStore){ delete(f.players,"alice") }, ErrSelfUnavailable, []string{"roster:alice"}},
		{"opponent missing roster", func(f *fakeStore){ delete(f.players,"bob") }, ErrOpponentUnavailable, []string{"roster:alice","roster:bob"}},
		{"self busy", func(f *fakeStore){ f.active["alice"]=true }, ErrSelfBusy, []string{"roster:alice","roster:bob","active:alice"}},
		{"opponent busy", func(f *fakeStore){ f.active["bob"]=true }, ErrOpponentBusy, []string{"roster:alice","roster:bob","active:alice","active:bob"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := baseStore()
			tc.mutate(store)
			service, _ := New(Config{Store: store, NewID: func()(string,error){ return "id",nil }})
			_, err := service.Create(context.Background(), "alice", "bob")
			if !errors.Is(err, tc.want) { t.Fatalf("err=%v want=%v", err, tc.want) }
			if len(store.calls) != len(tc.wantCalls) {
				t.Fatalf("calls=%#v want=%#v", store.calls, tc.wantCalls)
			}
			for i := range tc.wantCalls {
				if store.calls[i] != tc.wantCalls[i] { t.Fatalf("calls=%#v want=%#v", store.calls, tc.wantCalls) }
			}
		})
	}
}

func TestCreateBlankNormalizedOpponentMatchesPythonAvailabilityError(t *testing.T) {
	store := baseStore()
	service, _ := New(Config{Store: store, NewID: func()(string,error){ return "id",nil }})
	_, err := service.Create(context.Background(), "alice", "   ")
	if !errors.Is(err, ErrOpponentUnavailable) {
		t.Fatalf("err=%v want=%v", err, ErrOpponentUnavailable)
	}
	want := []string{"roster:alice", "roster:"}
	if len(store.calls) != len(want) {
		t.Fatalf("calls=%#v want=%#v", store.calls, want)
	}
	for i := range want {
		if store.calls[i] != want[i] {
			t.Fatalf("calls=%#v want=%#v", store.calls, want)
		}
	}
}

func TestCreateRejectsSelfBeforeStorage(t *testing.T) {
	store := baseStore()
	service, _ := New(Config{Store: store})
	if _, err := service.Create(context.Background(), "Alice", " alice "); !errors.Is(err, ErrSelfChallenge) {
		t.Fatalf("err=%v", err)
	}
	if len(store.calls) != 0 { t.Fatalf("storage touched: %#v", store.calls) }
}

func TestCreateReturnsPythonStyleCooldownCeiling(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 0, 0, 0, time.UTC)
	store := baseStore()
	store.hasCooldown = true
	store.cooldown = now.Add(1900 * time.Millisecond)
	service, _ := New(Config{
		Store: store,
		Now: func() time.Time { return now },
		NewID: func()(string,error){ return "unused",nil },
	})
	_, err := service.Create(context.Background(), "alice", "bob")
	var cooldown CooldownError
	if !errors.As(err, &cooldown) { t.Fatalf("err=%v", err) }
	if cooldown.RetryAfter != 2 { t.Fatalf("retry=%d want=2", cooldown.RetryAfter) }
	if store.created.ID != "" { t.Fatalf("challenge created during cooldown: %#v", store.created) }
}

func TestCreateReusesPendingPairWinnerWithoutSecondNarration(t *testing.T) {
	now := time.Date(2026, 10, 2, 11, 0, 0, 0, time.UTC)
	store := baseStore()
	store.createNow = false
	store.createResult = Challenge{
		ID:"winner", Challenger:"bob", Opponent:"alice", ChallengerRating:1350,
		OpponentRating:1200, Status:"pending", CreatedAt:now.Add(-time.Second),
	}
	service, _ := New(Config{
		Store: store, Now: func() time.Time { return now },
		NewID: func()(string,error){ return "loser",nil },
	})
	result, err := service.Create(context.Background(), "alice", "bob")
	if err != nil { t.Fatal(err) }
	if result.CreatedNow || result.Challenge.ID != "winner" {
		t.Fatalf("unexpected idempotent result: %#v", result)
	}
}

func TestRandomIDIsUUIDHexShape(t *testing.T) {
	id, err := randomID()
	if err != nil { t.Fatal(err) }
	if len(id) != 32 { t.Fatalf("len=%d id=%q", len(id), id) }
	if id[12] != '4' { t.Fatalf("version nibble=%q id=%q", id[12], id) }
	if !strings.ContainsRune("89ab", rune(id[16])) { t.Fatalf("variant nibble=%q id=%q", id[16], id) }
	for _, r := range id {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f')) {
			t.Fatalf("non-hex rune %q in %q", r, id)
		}
	}
}

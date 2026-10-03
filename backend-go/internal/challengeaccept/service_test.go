package challengeaccept

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeStore struct {
	challenge      Challenge
	challengeFound bool
	match          Match
	matchFound     bool
	active         map[string]bool
	roster         map[string]bool
	commitMatch    Match
	commitOK       bool
	err            error
	commitCalls    int
	committedDraft Match
}

func (f *fakeStore) GetChallenge(context.Context, string) (Challenge, bool, error) {
	return f.challenge, f.challengeFound, f.err
}

func (f *fakeStore) GetMatch(context.Context, string) (Match, bool, error) {
	return f.match, f.matchFound, f.err
}

func (f *fakeStore) HasActiveMatch(_ context.Context, username string) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	return f.active[username], nil
}

func (f *fakeStore) IsRosterMember(_ context.Context, username string, _ time.Time) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	return f.roster[username], nil
}

func (f *fakeStore) CommitAcceptance(_ context.Context, _ string, _ string, draft Match, _ time.Time) (Match, bool, error) {
	f.commitCalls++
	f.committedDraft = draft
	if f.err != nil {
		return Match{}, false, f.err
	}
	if f.commitMatch.ID == "" {
		f.commitMatch = draft
	}
	return f.commitMatch, f.commitOK, nil
}

func pendingChallenge() Challenge {
	return Challenge{
		ID:               "challenge-1",
		Challenger:       "alice",
		Opponent:         "bob",
		ChallengerRating: 1200,
		OpponentRating:   1350,
		Status:           "pending",
		CreatedAt:        time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC),
	}
}

func TestAcceptBuildsAuthoritativeStartingMatch(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	store := &fakeStore{
		challenge:      pendingChallenge(),
		challengeFound: true,
		active:         map[string]bool{},
		roster:         map[string]bool{"alice": true, "bob": true},
		commitOK:       true,
	}
	service, err := New(Config{
		Store: store,
		Now:   func() time.Time { return now },
		Coin:  func() (bool, error) { return true, nil },
	})
	if err != nil {
		t.Fatal(err)
	}

	result, err := service.Accept(context.Background(), "challenge-1", "bob", false)
	if err != nil {
		t.Fatal(err)
	}
	if !result.AcceptedNow || result.Challenger != "alice" {
		t.Fatalf("unexpected result: %#v", result)
	}
	got := store.committedDraft
	if got.ID != "challenge-1" || got.White != "alice" || got.Black != "bob" {
		t.Fatalf("unexpected pairing: %#v", got)
	}
	if got.WhiteRating != 1200 || got.BlackRating != 1350 {
		t.Fatalf("unexpected ratings: %#v", got)
	}
	if got.FEN != StartingFEN || got.Turn != "w" || got.Status != "starting" || got.Revision != 0 {
		t.Fatalf("unexpected initial state: %#v", got)
	}
	if !got.Rated || got.WhiteClockMS != InitialClockMS || got.BlackClockMS != InitialClockMS {
		t.Fatalf("unexpected clock/rated state: %#v", got)
	}
	if !got.ReadyDeadline.Equal(now.Add(ReadyTimeout)) || !got.CreatedAt.Equal(now) || !got.UpdatedAt.Equal(now) {
		t.Fatalf("unexpected timestamps: %#v", got)
	}
}

func TestAcceptSyntheticPairPinsChallengerWhiteAndUnrated(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	store := &fakeStore{
		challenge:      pendingChallenge(),
		challengeFound: true,
		active:         map[string]bool{},
		roster:         map[string]bool{"alice": true, "bob": true},
		commitOK:       true,
	}
	coinCalled := false
	service, _ := New(Config{
		Store: store,
		Now:   func() time.Time { return now },
		Coin: func() (bool, error) {
			coinCalled = true
			return false, nil
		},
	})
	if _, err := service.Accept(context.Background(), "challenge-1", "bob", true); err != nil {
		t.Fatal(err)
	}
	if coinCalled {
		t.Fatal("synthetic acceptance must not use random colour")
	}
	if store.committedDraft.White != "alice" || store.committedDraft.Rated {
		t.Fatalf("unexpected synthetic draft: %#v", store.committedDraft)
	}
}

func TestAcceptRetryReturnsExistingAcceptedMatch(t *testing.T) {
	challenge := pendingChallenge()
	challenge.Status = "accepted"
	challenge.MatchID = "match-1"
	existing := Match{ID: "match-1", White: "bob", Black: "alice", Status: "starting"}
	store := &fakeStore{
		challenge:      challenge,
		challengeFound: true,
		match:          existing,
		matchFound:     true,
		active:         map[string]bool{},
		roster:         map[string]bool{},
	}
	service, _ := New(Config{Store: store})
	result, err := service.Accept(context.Background(), challenge.ID, "bob", false)
	if err != nil {
		t.Fatal(err)
	}
	if result.AcceptedNow || result.Match.ID != "match-1" || store.commitCalls != 0 {
		t.Fatalf("retry was not idempotent: %#v calls=%d", result, store.commitCalls)
	}
}

func TestAcceptRepairsAcceptedChallengeWhenMatchIsMissing(t *testing.T) {
	now := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	challenge := pendingChallenge()
	challenge.Status = "accepted"
	challenge.MatchID = "match-1"
	store := &fakeStore{
		challenge:      challenge,
		challengeFound: true,
		matchFound:     false,
		active:         map[string]bool{"alice": true, "bob": true},
		roster:         map[string]bool{},
		commitOK:       true,
	}
	service, _ := New(Config{
		Store: store,
		Now:   func() time.Time { return now },
		Coin:  func() (bool, error) { return false, nil },
	})
	result, err := service.Accept(context.Background(), challenge.ID, "bob", false)
	if err != nil {
		t.Fatal(err)
	}
	if !result.AcceptedNow || store.commitCalls != 1 {
		t.Fatalf("accepted recovery did not resume saga: %#v calls=%d", result, store.commitCalls)
	}
	if store.committedDraft.ID != "match-1" {
		t.Fatalf("recovery changed deterministic match id: %#v", store.committedDraft)
	}
}

func TestAcceptPreservesPythonPreconditionOrder(t *testing.T) {
	tests := []struct {
		name   string
		active map[string]bool
		roster map[string]bool
		want   error
	}{
		{name: "opponent busy", active: map[string]bool{"alice": true}, roster: map[string]bool{"alice": true, "bob": true}, want: ErrOpponentBusy},
		{name: "self busy", active: map[string]bool{"bob": true}, roster: map[string]bool{"alice": true, "bob": true}, want: ErrSelfBusy},
		{name: "opponent unavailable", active: map[string]bool{}, roster: map[string]bool{"bob": true}, want: ErrOpponentUnavailable},
		{name: "self unavailable", active: map[string]bool{}, roster: map[string]bool{"alice": true}, want: ErrSelfUnavailable},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			store := &fakeStore{
				challenge:      pendingChallenge(),
				challengeFound: true,
				active:         tc.active,
				roster:         tc.roster,
				commitOK:       true,
			}
			service, _ := New(Config{Store: store, Coin: func() (bool, error) { return false, nil }})
			_, err := service.Accept(context.Background(), "challenge-1", "bob", false)
			if !errors.Is(err, tc.want) {
				t.Fatalf("err=%v want=%v", err, tc.want)
			}
			if store.commitCalls != 0 {
				t.Fatalf("commit called despite precondition failure: %d", store.commitCalls)
			}
		})
	}
}

func TestAcceptRejectsWrongOwnerAndChangedCAS(t *testing.T) {
	store := &fakeStore{
		challenge:      pendingChallenge(),
		challengeFound: true,
		active:         map[string]bool{},
		roster:         map[string]bool{"alice": true, "bob": true},
		commitOK:       false,
	}
	service, _ := New(Config{Store: store, Coin: func() (bool, error) { return false, nil }})

	if _, err := service.Accept(context.Background(), "challenge-1", "mallory", false); !errors.Is(err, ErrChallengeNotFound) {
		t.Fatalf("wrong owner err=%v", err)
	}
	if _, err := service.Accept(context.Background(), "challenge-1", "bob", false); !errors.Is(err, ErrChallengeChanged) {
		t.Fatalf("CAS err=%v", err)
	}
}

func TestAcceptPropagatesEntropyFailureWithoutWriting(t *testing.T) {
	store := &fakeStore{
		challenge:      pendingChallenge(),
		challengeFound: true,
		active:         map[string]bool{},
		roster:         map[string]bool{"alice": true, "bob": true},
		commitOK:       true,
	}
	boom := errors.New("entropy unavailable")
	service, _ := New(Config{Store: store, Coin: func() (bool, error) { return false, boom }})
	if _, err := service.Accept(context.Background(), "challenge-1", "bob", false); !errors.Is(err, boom) {
		t.Fatalf("err=%v", err)
	}
	if store.commitCalls != 0 {
		t.Fatalf("commit called after entropy failure: %d", store.commitCalls)
	}
}

func TestInitialClockIsThirtyMinutes(t *testing.T) {
	if InitialClockMS != int64(30*60*1000) {
		t.Fatalf("InitialClockMS=%d want=%d", InitialClockMS, int64(30*60*1000))
	}
}

package pvproute

import (
	"strings"
	"testing"
)

func TestMatch(t *testing.T) {
	cases := []struct {
		path string
		kind Kind
		id   string
	}{
		{"/api/pvp/lobby", LobbyRead, ""},
		{"/api/pvp/lobby/pulse", LobbyPulse, ""},
		{"/api/pvp/lobby/chat", LobbyChat, ""},
		{"/api/pvp/roster", Roster, ""},
		{"/api/pvp/challenges", ChallengeCreate, ""},
		{"/api/pvp/challenges/c-1/accept", ChallengeAccept, "c-1"},
		{"/api/pvp/challenges/c-1/cancel", ChallengeCancel, "c-1"},
		{"/api/pvp/challenges/c-1/decline", ChallengeDecline, "c-1"},
		{"/api/pvp/matches/m-1", MatchRead, "m-1"},
		{"/api/pvp/matches/m-1/pulse", MatchPulse, "m-1"},
		{"/api/pvp/matches/m-1/cancel-starting", MatchHandoffCancel, "m-1"},
		{"/api/pvp/matches/m-1/ready", MatchReady, "m-1"},
		{"/api/pvp/matches/m-1/resign", MatchResign, "m-1"},
		{"/api/pvp/matches/m-1/move", MatchMove, "m-1"},

		// Exactness carried over from the per-route parsers this replaced.
		{"/api/pvp/lobby/", None, ""},
		{"/api/pvp/challenges/", None, ""},
		{"/api/pvp/matches/", None, ""},
		{"/api/pvp/matches/m-1/", None, ""},
		{"/api/pvp/matches/m-1/move/", None, ""},
		{"/api/pvp/matches/m-1/resign/", None, ""},
		{"/api/pvp/matches//move", None, ""},
		{"/api/pvp/matches//resign", None, ""},
		{"/api/pvp/matches/a/b/move", None, ""},
		{"/api/pvp/matches/a/b", None, ""},
		{"/api/pvp/matches/m-1/unknown", None, ""},
		{"/api/pvp/challenges//accept", None, ""},
		{"/api/pvp/challenges/c-1/accept/", None, ""},
		{"/api/pvp/challenges/c-1/retract", None, ""},
		{"/api/pvp/challenges/c-1", None, ""},
		{"/api/pvp/challenges//cancel", None, ""},
		{"/api/pvp/elsewhere", None, ""},
		{"/healthz", None, ""},

		// Stray slashes around an action's id are tolerated, as before.
		{"/api/pvp/matches//m-1/ready", MatchReady, "m-1"},

		// An id that is an action word resolves to the action, the way the
		// edge always routed it. The native handler used to read it as a
		// match id instead; one table removes that disagreement.
		{"/api/pvp/matches/move", MatchMove, "move"},
		{"/api/pvp/matches/pulse", MatchPulse, "pulse"},
	}
	for _, tc := range cases {
		got := Match(tc.path)
		if got.Kind != tc.kind || got.ID != tc.id {
			t.Errorf("%s: got %s(%q) want %s(%q)", tc.path, got.Kind, got.ID, tc.kind, tc.id)
		}
	}
}

func TestKindNamesAreComplete(t *testing.T) {
	for kind := None; kind <= MatchRead; kind++ {
		if kind.String() == "unknown" || kind.String() == "" {
			t.Fatalf("kind %d has no name", kind)
		}
	}
	if Kind(99).String() != "unknown" {
		t.Fatal("out-of-range kind")
	}
}

// Every native route has an http.route template, and filling the template's
// ids resolves back to the same route: the label can never drift from the
// table the edge dispatches with.
func TestPatternsRoundTrip(t *testing.T) {
	for kind := LobbyRead; kind <= MatchRead; kind++ {
		pattern := kind.Pattern()
		if pattern == "" {
			t.Errorf("%s has no pattern", kind)
			continue
		}
		path := strings.NewReplacer("{match_id}", "m-1", "{challenge_id}", "c-1").Replace(pattern)
		if got := Match(path).Kind; got != kind {
			t.Errorf("%s: %s resolves to %s", kind, path, got)
		}
	}
	if None.Pattern() != "" || Kind(-1).Pattern() != "" || Kind(999).Pattern() != "" {
		t.Error("unknown kinds have no pattern")
	}
}

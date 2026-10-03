package pulse

import (
	"testing"
	"time"
)

func TestAccumulateLobbyHeadToHeadMatchesPythonSemantics(t *testing.T) {
	t0 := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	t1 := t0.Add(time.Minute)
	t2 := t1.Add(time.Minute)
	rows := []lobbyFinishedMatchRow{
		{White: "alice", Black: "bob", Status: "finished", Result: "1-0", CreatedAt: t0, UpdatedAt: t1},
		{White: "bob", Black: "alice", Status: "finished", Result: "1-0", CreatedAt: t2},
		{White: "alice", Black: "bob", Status: "finished", Result: "1/2-1/2", CreatedAt: t0},
		{White: "alice", Black: "carol", Status: "finished", Result: "0-1", CreatedAt: t1},
		{White: "alice", Black: "bob", Status: "active", Result: "1-0", CreatedAt: t2},
		{White: "alice", Black: "bob", Status: "finished", Result: "*", CreatedAt: t2},
		{White: "mallory", Black: "trent", Status: "finished", Result: "1-0", CreatedAt: t2},
	}

	got := accumulateLobbyHeadToHead("alice", rows)
	bob := got["bob"]
	if bob.Games != 3 || bob.Wins != 1 || bob.Draws != 1 || bob.Losses != 1 {
		t.Fatalf("bob=%#v", bob)
	}
	if !bob.LastPlayedAt.Equal(t2) {
		t.Fatalf("bob last=%s want=%s", bob.LastPlayedAt, t2)
	}
	carol := got["carol"]
	if carol.Games != 1 || carol.Wins != 0 || carol.Draws != 0 || carol.Losses != 1 {
		t.Fatalf("carol=%#v", carol)
	}
	if !carol.LastPlayedAt.Equal(t1) {
		t.Fatalf("carol last=%s want=%s", carol.LastPlayedAt, t1)
	}
	if _, ok := got["trent"]; ok {
		t.Fatalf("unrelated match leaked into summary: %#v", got)
	}
}

func TestAccumulateLobbyHeadToHeadUsesUpdatedAtWhenPresent(t *testing.T) {
	created := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	updated := created.Add(time.Hour)
	got := accumulateLobbyHeadToHead("alice", []lobbyFinishedMatchRow{{
		White: "alice", Black: "bob", Status: "finished", Result: "1-0",
		CreatedAt: created, UpdatedAt: updated,
	}})
	if !got["bob"].LastPlayedAt.Equal(updated) {
		t.Fatalf("last=%s want=%s", got["bob"].LastPlayedAt, updated)
	}
}

func TestAccumulateLobbyHeadToHeadFallsBackToCreatedAt(t *testing.T) {
	created := time.Date(2026, 10, 2, 10, 0, 0, 0, time.UTC)
	got := accumulateLobbyHeadToHead("alice", []lobbyFinishedMatchRow{{
		White: "bob", Black: "alice", Status: "finished", Result: "0-1", CreatedAt: created,
	}})
	if !got["bob"].LastPlayedAt.Equal(created) {
		t.Fatalf("last=%s want=%s", got["bob"].LastPlayedAt, created)
	}
}

func TestLobbyChatMaxMessagesMatchesPythonContract(t *testing.T) {
	if lobbyChatMaxMessages != 40 {
		t.Fatalf("max messages=%d want=40", lobbyChatMaxMessages)
	}
}

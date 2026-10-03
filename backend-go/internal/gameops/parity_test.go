package gameops

import (
	"encoding/json"
	"os"
	"testing"
)

type opsCorpus struct {
	NewGames []struct {
		Body        map[string]any `json:"body"`
		Fingerprint *string        `json:"fingerprint"`
		Valid       bool           `json:"valid"`
	} `json:"new_games"`
	Moves []struct {
		Body        map[string]any `json:"body"`
		Fingerprint *string        `json:"fingerprint"`
		Valid       bool           `json:"valid"`
	} `json:"moves"`
	Undos []struct {
		GameID      string `json:"gameId"`
		Fingerprint string `json:"fingerprint"`
	} `json:"undos"`
	Keys []struct {
		Raw        string  `json:"raw"`
		Normalized *string `json:"normalized"`
	} `json:"keys"`
	IDs []struct {
		Username string `json:"username"`
		Key      string `json:"key"`
		ID       string `json:"id"`
	} `json:"ids"`
}

func loadOps(t *testing.T) opsCorpus {
	t.Helper()
	data, err := os.ReadFile("testdata/python_ops_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var c opsCorpus
	if err := json.Unmarshal(data, &c); err != nil {
		t.Fatal(err)
	}
	return c
}

// rawJSON re-encodes a decoded body; json.Marshal keeps numbers as written
// for the values in the corpus (ints stay ints, 1e-05 stays a float).
func rawJSON(t *testing.T, body map[string]any) []byte {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestNewGameFingerprintsMatchPython(t *testing.T) {
	for _, c := range loadOps(t).NewGames {
		req, err := ParseNewGameRequest(rawJSON(t, c.Body))
		if (err == nil) != c.Valid {
			t.Errorf("%v: go valid=%v python valid=%v (%v)", c.Body, err == nil, c.Valid, err)
			continue
		}
		if !c.Valid {
			continue
		}
		got, err := Fingerprint(req.Payload)
		if err != nil {
			t.Fatal(err)
		}
		if got != *c.Fingerprint {
			canonical, _ := pyJSON(req.Payload)
			t.Errorf("%v: fingerprint drift; go canonical=%s", c.Body, canonical)
		}
	}
}

func TestMoveAndUndoFingerprintsMatchPython(t *testing.T) {
	c := loadOps(t)
	for _, m := range c.Moves {
		req, err := ParseMoveRequest(rawJSON(t, m.Body))
		if (err == nil) != m.Valid {
			t.Errorf("%v: go valid=%v python valid=%v (%v)", m.Body, err == nil, m.Valid, err)
			continue
		}
		if !m.Valid {
			continue
		}
		if got, _ := Fingerprint(req.Payload); got != *m.Fingerprint {
			t.Errorf("%v: move fingerprint drift", m.Body)
		}
	}
	for _, u := range c.Undos {
		if got, _ := UndoFingerprint(u.GameID); got != u.Fingerprint {
			t.Errorf("%q: undo fingerprint drift", u.GameID)
		}
	}
}

func TestKeysAndIDsMatchPython(t *testing.T) {
	c := loadOps(t)
	for _, k := range c.Keys {
		raw := k.Raw
		got, err := NormalizeKey(&raw)
		switch {
		case k.Normalized == nil && err == nil:
			t.Errorf("%q: go accepted %q, python rejected", k.Raw, *got)
		case k.Normalized != nil && (err != nil || *got != *k.Normalized):
			t.Errorf("%q: go=%v err=%v python=%q", k.Raw, got, err, *k.Normalized)
		}
	}
	for _, id := range c.IDs {
		if got := DeterministicGameID(id.Username, id.Key); got != id.ID {
			t.Errorf("%s:%s go=%s python=%s", id.Username, id.Key, got, id.ID)
		}
	}
}

func TestLedgerReplayAndRemember(t *testing.T) {
	key := "op-12345678"
	var ledger []Operation
	if replay, err := Replay(ledger, &key, "fp", "move"); replay || err != nil {
		t.Fatalf("empty ledger: %v %v", replay, err)
	}
	ledger = Remember(ledger, &key, "fp", "move")
	if replay, err := Replay(ledger, &key, "fp", "move"); !replay || err != nil {
		t.Fatalf("replay: %v %v", replay, err)
	}
	if _, err := Replay(ledger, &key, "other", "move"); err != ErrConflict {
		t.Fatalf("conflict: %v", err)
	}
	if _, err := Replay(ledger, &key, "fp", "undo"); err != ErrConflict {
		t.Fatalf("kind conflict: %v", err)
	}
	for i := 0; i < 20; i++ {
		k := "op-" + string(rune('a'+i)) + "-1234567"
		ledger = Remember(ledger, &k, "fp", "move")
	}
	if len(ledger) != MaxOperationLedger {
		t.Fatalf("ledger=%d", len(ledger))
	}
	ledger = Remember(ledger, &key, "fp2", "undo") // same key replaces, goes last
	if last := ledger[len(ledger)-1]; last.Key != key || last.Kind != "undo" {
		t.Fatalf("last=%v", last)
	}
	if replay, err := Replay(ledger, nil, "fp", "move"); replay || err != nil {
		t.Fatal("nil key never replays")
	}
}

func TestPyFloatRepr(t *testing.T) {
	for in, want := range map[float64]string{
		50: "50.0", 0.1: "0.1", 1e-05: "1e-05", 0.0001: "0.0001", 1e16: "1e+16",
		1e15: "1000000000000000.0", 123456789.125: "123456789.125", -3.25: "-3.25",
		1.5e300: "1.5e+300", 5e-324: "5e-324",
	} {
		if got := pyFloatRepr(in); got != want {
			t.Errorf("%v: got %s want %s", in, got, want)
		}
	}
}

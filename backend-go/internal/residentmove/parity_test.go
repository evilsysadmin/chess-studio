package residentmove

import (
	"encoding/json"
	"math"
	"os"
	"testing"

	chess "github.com/corentings/chess/v2"
)

// Position complexity drives how often Matthias errs; the corpus comes from
// backend-python/cpu_difficulty.position_complexity
// (scripts/cpu_policy_parity_corpus.py).
func TestPositionComplexityMatchesPythonCorpus(t *testing.T) {
	raw, err := os.ReadFile("../residentpolicy/testdata/python_cpu_policy_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Positions []struct {
			FEN        string  `json:"fen"`
			Complexity float64 `json:"complexity"`
		} `json:"positions"`
	}
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Positions) < 100 {
		t.Fatalf("corpus too small: %d positions", len(corpus.Positions))
	}
	for _, row := range corpus.Positions {
		option, err := chess.FEN(row.FEN)
		if err != nil {
			t.Fatalf("%s: %v", row.FEN, err)
		}
		got := positionComplexity(chess.NewGame(option).Position())
		if math.Abs(got-row.Complexity) > 1e-12 {
			t.Errorf("%s: complexity %v, python %v", row.FEN, got, row.Complexity)
		}
	}
}

package gamesapi

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/gamecore"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/residentsearch"
)

// TestFactualMoveAnalysisMatchesPython pins /api/analyze-move's payload to
// scripts/engine_move_analysis_parity_corpus.py: every field of
// analyze_move_payload, at a fixed depth without a clock.
func TestFactualMoveAnalysisMatchesPython(t *testing.T) {
	raw, err := os.ReadFile("testdata/python_move_analysis_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Positions []struct {
			FEN     string         `json:"fen"`
			Played  string         `json:"played"`
			Depth   int            `json:"depth"`
			Payload map[string]any `json:"payload"`
		} `json:"positions"`
	}
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Positions) < 40 {
		t.Fatalf("corpus too small: %d", len(corpus.Positions))
	}
	search := residentsearch.New()
	mismatches := 0
	for _, row := range corpus.Positions {
		board, err := gamecore.BoardFromValidFEN(row.FEN)
		if err != nil {
			t.Fatal(err)
		}
		played, ok := findMove(board, row.Played)
		if !ok {
			t.Fatalf("%s: %s not legal", row.FEN, row.Played)
		}
		payload, ok := FactualMoveAnalysis(context.Background(), search, board, played, row.Depth, time.Hour)
		if !ok {
			t.Fatalf("%s: no analysis", row.FEN)
		}
		encoded, _ := json.Marshal(payload)
		var got map[string]any
		_ = json.Unmarshal(encoded, &got)
		for key, want := range row.Payload {
			if !reflect.DeepEqual(got[key], want) {
				mismatches++
				if mismatches <= 8 {
					t.Errorf("%s played %s depth %d: %s = %v, Python %v", row.FEN, row.Played, row.Depth, key, got[key], want)
				}
			}
		}
		if len(got) != len(row.Payload) {
			t.Errorf("%s: keys %d, Python %d", row.FEN, len(got), len(row.Payload))
		}
	}
	if mismatches > 0 {
		t.Fatalf("%d field mismatches", mismatches)
	}
}

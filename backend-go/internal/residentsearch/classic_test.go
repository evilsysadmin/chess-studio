package residentsearch

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	chess "github.com/corentings/chess/v2"
)

// The search corpus is chess_ai._search itself (fixed depth, no clock):
// Classic must return the same move, not only an equally good one.
func TestClassicMatchesPythonSearchCorpus(t *testing.T) {
	if testing.Short() {
		t.Skip("search parity corpus is slow; run without -short")
	}
	data, err := os.ReadFile("testdata/python_search_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus pythonSearchCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	failures := 0
	for _, position := range corpus.Positions {
		want, err := decodeScore(position.Score)
		if err != nil {
			t.Fatal(err)
		}
		option, err := chess.FEN(position.FEN)
		if err != nil {
			t.Fatal(err)
		}
		root := chess.NewGame(option).Position()
		move, score, err := New().Classic(context.Background(), []*chess.Position{root}, position.Depth, time.Hour)
		if err != nil {
			t.Fatalf("%s: %v", position.FEN, err)
		}
		if move != position.Move || !sameScore(score, want) {
			failures++
			if failures <= 20 {
				t.Errorf("depth %d %s: go %s %v, python %s %v", position.Depth, position.FEN, move, score, position.Move, want)
			}
		}
	}
	if failures > 0 {
		t.Fatalf("%d/%d positions differ from chess_ai._search", failures, len(corpus.Positions))
	}
}

func TestClassicKeepsTheStaticBestWhenNoDepthCompletes(t *testing.T) {
	root := chess.NewGame().Position()
	s := New()
	s.now = func() time.Time { return time.Unix(0, 0) }
	move, _, err := s.Classic(context.Background(), []*chess.Position{root}, 4, 0)
	if err != nil || move == "" {
		t.Fatalf("move=%q err=%v", move, err)
	}
	static, _, ok := StaticBest([]*chess.Position{root})
	if !ok || static != move {
		t.Fatalf("static=%q classic=%q", static, move)
	}
}

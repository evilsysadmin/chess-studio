package matthiasmem

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// applyUpdate emulates the Mongo operators the store sends ($set,
// $setOnInsert, $inc with dotted paths, $push with $each/$slice).
func applyUpdate(doc bson.D, update bson.D, username string) (bson.D, error) {
	inserting := doc == nil
	if inserting {
		doc = bson.D{{Key: "_id", Value: username}}
	}
	for _, op := range update {
		fields, _ := op.Value.(bson.D)
		switch op.Key {
		case "$setOnInsert":
			if inserting {
				for _, f := range fields {
					doc = pydoc.Set(doc, f.Key, f.Value)
				}
			}
		case "$set":
			for _, f := range fields {
				doc = pydoc.Set(doc, f.Key, f.Value)
			}
		case "$inc":
			for _, f := range fields {
				var err error
				doc, err = incPath(doc, strings.Split(f.Key, "."), f.Value.(int64))
				if err != nil {
					return nil, err
				}
			}
		case "$push":
			for _, f := range fields {
				spec := f.Value.(bson.D)
				each := get(spec, "$each").(bson.A)
				slice := get(spec, "$slice").(int)
				current := bson.A{}
				if raw, present := pydoc.Get(doc, f.Key); present {
					arr, ok := list(raw)
					if !ok {
						return nil, errors.New("push to non-array")
					}
					current = append(current, arr...)
				}
				current = append(current, each...)
				doc = pydoc.Set(doc, f.Key, tail(current, -slice))
			}
		}
	}
	return doc, nil
}

func incPath(doc bson.D, path []string, by int64) (bson.D, error) {
	raw, present := pydoc.Get(doc, path[0])
	if len(path) == 1 {
		switch v := raw.(type) {
		case nil:
			if present {
				return nil, errors.New("inc null")
			}
			return pydoc.Set(doc, path[0], by), nil
		case int32:
			return pydoc.Set(doc, path[0], int64(v)+by), nil
		case int64:
			return pydoc.Set(doc, path[0], v+by), nil
		case float64:
			return pydoc.Set(doc, path[0], v+float64(by)), nil
		}
		return nil, errors.New("inc non-number")
	}
	child := bson.D{}
	if present {
		d, ok := raw.(bson.D)
		if !ok {
			return nil, errors.New("inc through non-document")
		}
		child = d
	}
	child, err := incPath(child, path[1:], by)
	if err != nil {
		return nil, err
	}
	return pydoc.Set(doc, path[0], child), nil
}

type guardedResult struct {
	Result json.RawMessage `json:"result"`
	Error  string          `json:"error"`
}

type writeOp struct {
	Op              string          `json:"op"`
	Now             string          `json:"now"`
	Facts           json.RawMessage `json:"facts"`
	Kind            json.RawMessage `json:"kind"`
	Text            json.RawMessage `json:"text"`
	ConsultationID  json.RawMessage `json:"consultation_id"`
	Observe         *guardedResult  `json:"observe"`
	Episodes        *guardedResult  `json:"episodes"`
	Context         *guardedResult  `json:"context"`
	EpisodicContext *guardedResult  `json:"episodic_context"`
	Recorded        *guardedResult  `json:"recorded"`
	Replay          *guardedResult  `json:"replay"`
	Doc             json.RawMessage `json:"doc"`
}

func decodeAny(t *testing.T, raw json.RawMessage) any {
	t.Helper()
	if len(raw) == 0 {
		return nil
	}
	v, err := pydoc.Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestWritesMatchPythonCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/python_matthias_writes_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Players []struct {
			Seed json.RawMessage `json:"seed"`
			Ops  []writeOp       `json:"ops"`
		} `json:"players"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	failures := 0
	fail := func(format string, args ...any) {
		t.Helper()
		t.Errorf(format, args...)
		failures++
		if failures > 10 {
			t.FailNow()
		}
	}
	check := func(where string, want *guardedResult, got any, gotErr error) {
		t.Helper()
		if want == nil {
			return
		}
		switch {
		case want.Error != "" && gotErr == nil:
			fail("%s: Python raised %s, Go did not", where, want.Error)
		case want.Error == "" && gotErr != nil:
			fail("%s: Go failed: %v", where, gotErr)
		case gotErr == nil:
			expected := decodeAny(t, want.Result)
			if !pydoc.Equal(expected, got) || encode(t, expected) != encode(t, got) {
				fail("%s:\n got %s\nwant %s", where, encode(t, got), encode(t, expected))
			}
		}
	}
	for pi, player := range corpus.Players {
		var doc bson.D
		if seed, _ := decodeAny(t, player.Seed).(bson.D); seed != nil {
			doc = seed
		}
		for oi, op := range player.Ops {
			where := fmt.Sprintf("player %d op %d (%s)", pi, oi, op.Op)
			now, err := time.Parse(time.RFC3339Nano, op.Now)
			if err != nil {
				t.Fatal(err)
			}
			facts, _ := decodeAny(t, op.Facts).(bson.D)
			row := doc
			if row == nil {
				row = bson.D{{Key: "_id", Value: "p"}}
			}
			switch op.Op {
			case "audience", "portrait":
				update, obsErr := ObserveFacts(row, facts, now)
				check(where+" observe", op.Observe, nil, obsErr)
				if obsErr == nil {
					if doc, err = applyUpdate(doc, update, "p"); err != nil {
						t.Fatal(err)
					}
				}
				epUpdate, result, epErr := ObserveEpisodes(doc, facts, now)
				check(where+" episodes", op.Episodes, result, epErr)
				if epErr == nil {
					if doc, err = applyUpdate(doc, epUpdate, "p"); err != nil {
						t.Fatal(err)
					}
				}
				fallthrough
			case "narrative_context":
				ctx, ctxErr := Context(doc, facts, now)
				check(where+" context", op.Context, ctx, ctxErr)
				epCtx, epCtxErr := EpisodicContext(doc, now)
				check(where+" episodic context", op.EpisodicContext, epCtx, epCtxErr)
			case "record":
				kind, text, cid := decodeAny(t, op.Kind), decodeAny(t, op.Text), decodeAny(t, op.ConsultationID)
				recorded := false
				if c := NewConsultation(kind, text, facts, cid, now); c != nil {
					switch {
					case doc == nil:
						doc, recorded = c.NewRow("p"), true
					case !c.Known(get(doc, "recent_consultation_ids")):
						if doc, err = applyUpdate(doc, c.Update(), "p"); err != nil {
							t.Fatal(err)
						}
						recorded = true
					}
				}
				check(where+" record", op.Recorded, recorded, nil)
			case "replay":
				var got any
				if r := Replay(doc, decodeAny(t, op.ConsultationID)); r != nil {
					got = r
				}
				check(where+" replay", op.Replay, got, nil)
			case "position":
				update, posErr := EmblematicUpdate(get(doc, "emblematic_positions"), facts, now)
				check(where+" position", op.Recorded, update != nil, posErr)
				if posErr == nil && update != nil {
					if doc, err = applyUpdate(doc, update, "p"); err != nil {
						t.Fatal(err)
					}
				}
			}
			if len(op.Doc) > 0 {
				want := decodeAny(t, op.Doc)
				var got any = doc
				if doc == nil {
					got = nil
				}
				if !pydoc.Equal(want, got) {
					fail("%s doc:\n got %s\nwant %s", where, encode(t, doc), encode(t, want))
				}
			}
		}
	}
}

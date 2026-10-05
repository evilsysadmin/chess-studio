package narrative

import (
	"encoding/json"
	"os"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

type corpusCase struct {
	Event     string          `json:"event"`
	Facts     json.RawMessage `json:"facts"`
	Tone      *string         `json:"tone"`
	Locale    *string         `json:"locale"`
	RequestID *string         `json:"request_id"`
	Text      string          `json:"text"`
	Limit     int             `json:"limit"`
	Body      string          `json:"body"`
	Signature string          `json:"signature"`
	Fallback  string          `json:"fallback"`
	Trim      string          `json:"trim"`
	Grounded  []any           `json:"grounded"`
	Portrait  []any           `json:"portrait"`
	Daily     []any           `json:"daily"`
	Opening   []any           `json:"opening"`
	Register  []any           `json:"register"`
	MaxChars  int             `json:"max_chars"`
	Channel   string          `json:"channel"`
}

func verdict(t *testing.T, name string, i int, want []any, ok bool, reason string) {
	t.Helper()
	wantOK, _ := want[0].(bool)
	wantReason, _ := want[1].(string)
	if ok != wantOK || reason != wantReason {
		t.Errorf("case %d %s: got (%v, %q) want (%v, %q)", i, name, ok, reason, wantOK, wantReason)
	}
}

func TestNarrativeMatchesPythonCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/python_narrative_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Secret    string       `json:"secret"`
		Timestamp string       `json:"timestamp"`
		Cases     []corpusCase `json:"cases"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	for i, c := range corpus.Cases {
		decoded, err := pydoc.Decode(c.Facts)
		if err != nil {
			t.Fatal(err)
		}
		facts, _ := decoded.(bson.D)
		body, err := CanonicalJSON(BuildPayload(c.Event, facts, c.Tone, c.Locale, c.RequestID))
		if err != nil || string(body) != c.Body {
			t.Errorf("case %d body:\n got %s\nwant %s", i, body, c.Body)
		}
		if got := Sign(corpus.Secret, corpus.Timestamp, []byte(c.Body)); got != c.Signature {
			t.Errorf("case %d signature %s want %s", i, got, c.Signature)
		}
		if got := Fallback(c.Event, facts); got != c.Fallback {
			t.Errorf("case %d (%s) fallback:\n got %q\nwant %q", i, c.Event, got, c.Fallback)
		}
		if got := TrimComplete(c.Text, c.Limit); got != c.Trim {
			t.Errorf("case %d trim(%d):\n got %q\nwant %q", i, c.Limit, got, c.Trim)
		}
		ok, reason := Grounded(c.Text, c.Event, facts)
		verdict(t, "grounded", i, c.Grounded, ok, reason)
		ok, reason = Portrait(c.Text, facts)
		verdict(t, "portrait", i, c.Portrait, ok, reason)
		ok, reason = Daily(c.Text, facts)
		verdict(t, "daily", i, c.Daily, ok, reason)
		ok, reason = OpeningBanter(c.Text, facts)
		verdict(t, "opening", i, c.Opening, ok, reason)
		ok, reason = Register(c.Text, c.Event)
		verdict(t, "register", i, c.Register, ok, reason)
		if MaxOutputChars(c.Event) != c.MaxChars || Channel(c.Event) != c.Channel {
			t.Errorf("case %d %s: max %d channel %s", i, c.Event, MaxOutputChars(c.Event), Channel(c.Event))
		}
		if t.Failed() && i > 40 {
			t.FailNow()
		}
	}
}

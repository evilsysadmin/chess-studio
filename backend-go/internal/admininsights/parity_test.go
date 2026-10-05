package admininsights

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

type outcome struct {
	Value  json.RawMessage `json:"value"`
	Error  string          `json:"error"`
	SHA256 string          `json:"sha256"`
	Length int             `json:"length"`
}

func loadCorpus(t *testing.T) (cases []struct {
	Profile  json.RawMessage `json:"profile"`
	Summary  outcome         `json:"summary"`
	Insights outcome         `json:"insights"`
}, groups []struct {
	Profiles []string `json:"profiles"`
	Result   outcome  `json:"result"`
}) {
	t.Helper()
	data, err := os.ReadFile("testdata/python_admin_insights_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cases []struct {
			Profile  json.RawMessage `json:"profile"`
			Summary  outcome         `json:"summary"`
			Insights outcome         `json:"insights"`
		} `json:"cases"`
		Matchmaking []struct {
			Profiles []string `json:"profiles"`
			Result   outcome  `json:"result"`
		} `json:"matchmaking"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	return corpus.Cases, corpus.Matchmaking
}

func decodeProfile(t *testing.T, raw json.RawMessage) bson.D {
	t.Helper()
	v, err := pydoc.Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	if v == nil {
		return nil
	}
	return v.(bson.D)
}

func check(t *testing.T, label string, got bson.D, err error, want outcome) bool {
	t.Helper()
	if want.Error == "ValueError" { // the JSON response cannot carry NaN/Infinity
		if _, encodeErr := pydoc.Encode(got); err != nil || encodeErr == nil {
			t.Errorf("%s: Python could not serialize the answer; Go: %v", label, err)
			return false
		}
		return true
	}
	if want.Error != "" {
		if !errors.Is(err, ErrRaised) {
			t.Errorf("%s: Python raised %s, Go answered %v", label, want.Error, err)
			return false
		}
		return true
	}
	if err != nil {
		t.Errorf("%s: %v", label, err)
		return false
	}
	raw, err := pydoc.Encode(got)
	if err != nil {
		t.Errorf("%s: %v", label, err)
		return false
	}
	if want.Value != nil {
		decoded, _ := pydoc.Decode(want.Value)
		expected, _ := pydoc.Encode(decoded)
		if string(raw) != string(expected) {
			t.Errorf("%s:\ngo     %s\npython %s", label, raw, expected)
			return false
		}
		return true
	}
	sum := sha256.Sum256(raw)
	if hex.EncodeToString(sum[:]) != want.SHA256 || len(raw) != want.Length {
		t.Errorf("%s: sha/length differ (%d vs %d): %s", label, len(raw), want.Length, raw)
		return false
	}
	return true
}

func TestSummariesMatchPythonCorpus(t *testing.T) {
	cases, _ := loadCorpus(t)
	if len(cases) < 300 {
		t.Fatalf("corpus too small: %d", len(cases))
	}
	failures := 0
	for i, c := range cases {
		profile := decodeProfile(t, c.Profile)
		summary, err := SummaryStats(profile)
		if !check(t, "summary #"+itoa(i), summary, err, c.Summary) {
			failures++
		}
		insights, err := InsightsPayload(profile)
		if !check(t, "insights #"+itoa(i), insights, err, c.Insights) {
			failures++
		}
		if failures > 5 {
			t.FailNow()
		}
	}
}

func TestMatchmakingMatchesPythonCorpus(t *testing.T) {
	cases, groups := loadCorpus(t)
	byName := map[string]bson.D{}
	for i, c := range cases {
		byName["u"+itoa(i)] = decodeProfile(t, c.Profile)
	}
	for i, g := range groups {
		var profiles []bson.D
		for _, name := range g.Profiles {
			profiles = append(profiles, byName[name])
		}
		got, err := AggregateMatchmaking(profiles)
		check(t, "matchmaking #"+itoa(i), got, err, g.Result)
	}
}

func itoa(i int) string {
	raw, _ := json.Marshal(i)
	return string(raw)
}

package chronicles

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesmap"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

func TestContentMatchesPython(t *testing.T) {
	python, err := filepath.Glob("../../../backend-python/chronicles_maps/*.json")
	if err != nil || len(python) == 0 {
		t.Fatalf("python maps: %v %v", python, err)
	}
	python = append(python, "../../../backend-python/chronicles_entry_catalog.json")
	embedded, _ := content.ReadDir("content/maps")
	if len(embedded)+1 != len(python) {
		t.Fatalf("embedded %d maps, Python has %d", len(embedded), len(python)-1)
	}
	for _, path := range python {
		want, _ := os.ReadFile(path)
		name := "content/maps/" + filepath.Base(path)
		if filepath.Base(path) == "chronicles_entry_catalog.json" {
			name = "content/chronicles_entry_catalog.json"
		}
		got, err := content.ReadFile(name)
		if err != nil || !bytes.Equal(got, want) {
			t.Fatalf("%s differs from backend-python: copy it into internal/chronicles/%s", filepath.Base(path), filepath.Dir(name))
		}
	}
}

type areaResult struct {
	SHA256  string          `json:"sha256"`
	Length  int             `json:"length"`
	Payload json.RawMessage `json:"payload"`
	Error   string          `json:"error"`
	Message string          `json:"message"`
	Status  int             `json:"status"`
	Detail  string          `json:"detail"`
}

type areaCorpus struct {
	Areas []struct {
		MapID      string     `json:"mapId"`
		Seed       int64      `json:"seed"`
		PartyLevel *int64     `json:"partyLevel"`
		Placement  int        `json:"placement"`
		Route      bool       `json:"route"`
		Result     areaResult `json:"result"`
	} `json:"areas"`
	Planner []struct {
		MapID      string          `json:"mapId"`
		Seed       int64           `json:"seed"`
		Snapshot   json.RawMessage `json:"snapshot"`
		PartyLevel *int64          `json:"partyLevel"`
		Placement  int             `json:"placement"`
		Result     areaResult      `json:"result"`
	} `json:"planner"`
	Routes []struct {
		Seed  int64           `json:"seed"`
		Entry string          `json:"entry"`
		Route json.RawMessage `json:"route"`
	} `json:"routes"`
	Previews []struct {
		MapCode string     `json:"mapCode"`
		Result  areaResult `json:"result"`
	} `json:"previews"`
}

func loadAreaCorpus(t *testing.T) areaCorpus {
	t.Helper()
	data, err := os.ReadFile("testdata/python_chronicles_area_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus areaCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	return corpus
}

// pythonError names the exception class the corpus records.
func pythonError(err error) string {
	var manifest *ManifestError
	var generation *GenerationError
	var mapGeneration *chroniclesmap.GenerationError
	var code *chroniclesmap.Error
	switch {
	case errors.As(err, &manifest):
		return "ChroniclesManifestError"
	case errors.As(err, &generation), errors.As(err, &mapGeneration):
		return "ChroniclesMapGenerationError"
	case errors.As(err, &code):
		return "ChroniclesMapCodeError"
	}
	return "unexpected: " + err.Error()
}

func checkArea(t *testing.T, label string, envelope bson.D, err error, want areaResult) {
	t.Helper()
	if want.Error != "" {
		if err == nil || pythonError(err) != want.Error || err.Error() != want.Message {
			t.Errorf("%s: err=%v want %s(%s)", label, err, want.Error, want.Message)
		}
		return
	}
	if err != nil {
		t.Errorf("%s: %v", label, err)
		return
	}
	raw, err := pydoc.Encode(envelope)
	if err != nil {
		t.Fatalf("%s: encode: %v", label, err)
	}
	sum := sha256.Sum256(raw)
	if hex.EncodeToString(sum[:]) == want.SHA256 && len(raw) == want.Length {
		return
	}
	if len(want.Payload) > 0 {
		t.Errorf("%s: envelope differs\ngo=%s\npython=%s", label, raw, want.Payload)
	} else {
		t.Errorf("%s: envelope sha/length differ (%d vs %d)\ngo=%s", label, len(raw), want.Length, raw)
	}
}

func TestAreaEnvelopesMatchPythonCorpus(t *testing.T) {
	corpus := loadAreaCorpus(t)
	if len(corpus.Areas) < 500 || len(corpus.Planner) < 10 || len(corpus.Routes) < 50 || len(corpus.Previews) < 15 {
		t.Fatalf("corpus too small")
	}
	full, failures := 0, 0
	for _, c := range corpus.Areas {
		opts := AreaOptions{PartyLevel: c.PartyLevel, PlacementVersion: c.Placement}
		if c.Route {
			route, err := RouteSnapshotForSeed(c.Seed)
			if err != nil {
				t.Fatal(err)
			}
			opts.Route = route
		}
		if len(c.Result.Payload) > 0 {
			full++
		}
		envelope, err := AreaEnvelope(c.MapID, c.Seed, opts)
		before := t.Failed()
		checkArea(t, c.MapID+"/"+jsonString(c), envelope, err, c.Result)
		if !before && t.Failed() {
			failures++
		}
		if failures > 3 {
			t.FailNow()
		}
	}
	if full < 10 {
		t.Fatalf("only %d full payloads", full)
	}
}

func jsonString(v any) string {
	raw, _ := json.Marshal(v)
	if len(raw) > 160 {
		raw = raw[:160]
	}
	return string(raw)
}

func TestPlannerEnvelopesMatchPythonCorpus(t *testing.T) {
	for _, c := range loadAreaCorpus(t).Planner {
		snapshot, err := pydoc.Decode(c.Snapshot)
		if err != nil {
			t.Fatal(err)
		}
		opts := AreaOptions{PlannerSnapshot: snapshot, PartyLevel: c.PartyLevel, PlacementVersion: c.Placement}
		envelope, err := AreaEnvelope(c.MapID, c.Seed, opts)
		checkArea(t, string(c.Snapshot), envelope, err, c.Result)
	}
}

func TestRoutesMatchPythonCorpus(t *testing.T) {
	for _, c := range loadAreaCorpus(t).Routes {
		entry, err := EntryMapForSeed(c.Seed)
		if err != nil || entry != c.Entry {
			t.Errorf("seed %d: entry %q %v want %q", c.Seed, entry, err, c.Entry)
		}
		route, err := RouteSnapshotForSeed(c.Seed)
		if err != nil {
			t.Fatal(err)
		}
		want, _ := pydoc.Decode(c.Route)
		if !pydoc.Equal(route.Doc(), want) {
			got, _ := pydoc.Encode(route.Doc())
			t.Errorf("seed %d: route %s want %s", c.Seed, got, c.Route)
		}
	}
}

func TestPreviewsMatchPythonCorpus(t *testing.T) {
	for _, c := range loadAreaCorpus(t).Previews {
		layout, err := Preview(c.MapCode)
		if c.Result.Status != 0 {
			if err == nil || err.Error() != c.Result.Detail {
				t.Errorf("%s: err=%v want %q", c.MapCode, err, c.Result.Detail)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: %v", c.MapCode, err)
			continue
		}
		got, _ := pydoc.Encode(layout)
		var compact bytes.Buffer
		_ = json.Compact(&compact, c.Result.Payload)
		if !bytes.Equal(got, compact.Bytes()) {
			t.Errorf("%s:\ngo=%s\npython=%s", c.MapCode, got, compact.Bytes())
		}
	}
}

func TestRecipesAndAnchorsMatchPythonCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/python_chronicles_area_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Themes  map[string]string `json:"themes"`
		Recipes []struct {
			MapID   string                `json:"mapId"`
			Variant string                `json:"variant"`
			Seed    int64                 `json:"seed"`
			MapCode string                `json:"mapCode"`
			Anchors map[string][][2]int64 `json:"anchors"`
		} `json:"recipes"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Themes) < 15 || len(corpus.Recipes) < 30 {
		t.Fatalf("corpus too small")
	}
	for id, want := range corpus.Themes {
		if got := themeForMapID(id); got != want {
			t.Errorf("theme(%q)=%q want %q", id, got, want)
		}
	}
	variants := map[string]func(bson.D) bson.D{
		"authored": func(m bson.D) bson.D { return m },
		"bulk": func(m bson.D) bson.D {
			start, _ := get(m, "partyStart").(bson.D)
			filler := func(id string, extra ...bson.E) bson.D {
				d := bson.D{{Key: "id", Value: id}}
				d = append(d, extra...)
				return append(d, bson.E{Key: "x", Value: get(start, "x")}, bson.E{Key: "y", Value: get(start, "y")},
					bson.E{Key: "action", Value: bson.D{{Key: "effects", Value: bson.A{}}}})
			}
			treasures, _ := get(m, "treasures").(bson.A)
			triggers, _ := get(m, "triggers").(bson.A)
			for n := 0; n < 5; n++ {
				treasures = append(treasures, filler(fmt.Sprintf("t-extra-%d", n)))
			}
			for n := 0; n < 4; n++ {
				triggers = append(triggers, filler(fmt.Sprintf("s-extra-%d", n), bson.E{Key: "kind", Value: "secret-door"}))
			}
			enemies, _ := get(m, "enemies").(bson.A)
			m = setKey(setKey(m, "treasures", treasures), "triggers", triggers)
			return setKey(m, "enemies", enemies[:min(1, len(enemies))])
		},
		"positionKey": func(m bson.D) bson.D {
			enemies, _ := get(m, "enemies").(bson.A)
			for i, raw := range enemies {
				enemies[i] = setKey(raw.(bson.D), "positionKey", "pk")
			}
			return m
		},
	}
	for _, c := range corpus.Recipes {
		manifest, _, err := LoadManifest(c.MapID)
		if err != nil {
			t.Fatal(err)
		}
		manifest = variants[c.Variant](manifest)
		recipe, err := mapCodeForManifest(manifest, c.Seed)
		if err != nil {
			t.Fatal(err)
		}
		if code, err := chroniclesmap.Encode(recipe); err != nil || code != c.MapCode {
			t.Errorf("%s/%s: map code %q %v want %q", c.MapID, c.Variant, code, err, c.MapCode)
		}
		for version, want := range c.Anchors {
			anchors, err := anchorPositions(manifest, int(version[0]-'0'))
			if err != nil {
				t.Fatal(err)
			}
			var got [][2]int64
			for p := range anchors {
				got = append(got, [2]int64{p.x, p.y})
			}
			sort.Slice(got, func(i, j int) bool { return got[i][0] < got[j][0] || (got[i][0] == got[j][0] && got[i][1] < got[j][1]) })
			if fmt.Sprint(got) != fmt.Sprint(want) {
				t.Errorf("%s/%s v%s anchors %v want %v", c.MapID, c.Variant, version, got, want)
			}
		}
	}
}

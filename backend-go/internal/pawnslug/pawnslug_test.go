package pawnslug

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// The embedded manifests are a copy of Python's: they must not drift.
func TestEmbeddedManifestsMatchPython(t *testing.T) {
	python, err := filepath.Glob("../../../backend-python/pawn_slug_manifests/*.json")
	if err != nil || len(python) == 0 {
		t.Fatalf("python manifests: %v %v", python, err)
	}
	embedded, _ := manifests.ReadDir("manifests")
	if len(embedded) != len(python) {
		t.Fatalf("embedded %d manifests, Python has %d", len(embedded), len(python))
	}
	for _, path := range python {
		want, _ := os.ReadFile(path)
		got, err := manifests.ReadFile("manifests/" + filepath.Base(path))
		if err != nil || !bytes.Equal(got, want) {
			t.Fatalf("%s differs from backend-python: copy it into internal/pawnslug/manifests", filepath.Base(path))
		}
	}
}

func TestEnvelopesMatchPythonCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/python_pawn_slug_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Envelopes []struct {
			Stage    string          `json:"stage"`
			Seed     int64           `json:"seed"`
			Envelope json.RawMessage `json:"envelope"`
		} `json:"envelopes"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	for _, c := range corpus.Envelopes {
		got, err := Envelope(c.Stage, c.Seed)
		if err != nil {
			t.Fatal(err)
		}
		want, _ := pydoc.Decode(c.Envelope)
		g, _ := pydoc.Encode(got)
		w, _ := pydoc.Encode(want)
		if !bytes.Equal(g, w) {
			t.Fatalf("%s seed %d:\n got %s\nwant %s", c.Stage, c.Seed, g, w)
		}
	}
}

func TestValidationAndLookup(t *testing.T) {
	for _, id := range []string{"Pawn", "-a", "nope", "../x"} {
		if _, _, err := Load(id); err != ErrNotFound {
			t.Errorf("%q: %v", id, err)
		}
	}
	manifest, _, err := Load("pawn-slug-v1")
	if err != nil {
		t.Fatal(err)
	}
	broken := pydoc.Set(pydoc.Copy(manifest), "spawns", bson.A{bson.D{{Key: "id", Value: "s"}, {Key: "type", Value: "dragon"}, {Key: "x", Value: int64(1)}}})
	if err := Validate(broken, "pawn-slug-v1"); err == nil || err.Error() != "spawn s references an unknown enemy type" {
		t.Fatalf("unknown enemy: %v", err)
	}
	if err := Validate(pydoc.Set(pydoc.Copy(manifest), "version", true), "pawn-slug-v1"); err == nil {
		t.Fatal("a bool version must fail")
	}
}

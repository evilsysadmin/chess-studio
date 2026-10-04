package chroniclesmap

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

type topologyCorpus struct {
	MapCodeVersion   int `json:"mapCodeVersion"`
	GeneratorVersion int `json:"generatorVersion"`
	Cases            []struct {
		MapCode string `json:"mapCode"`
		Layout  Layout `json:"layout"`
	} `json:"cases"`
}

func TestTopologyMatchesPythonCorpus(t *testing.T) {
	data, err := os.ReadFile("testdata/python_topology_corpus.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus topologyCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	if corpus.MapCodeVersion != MapCodeVersion {
		t.Fatalf("MapCode corpus version=%d go=%d", corpus.MapCodeVersion, MapCodeVersion)
	}
	if corpus.GeneratorVersion != GeneratorVersion {
		t.Fatalf("generator corpus version=%d go=%d", corpus.GeneratorVersion, GeneratorVersion)
	}
	if len(corpus.Cases) < 9 {
		t.Fatalf("corpus too small: %d", len(corpus.Cases))
	}

	for _, testCase := range corpus.Cases {
		got, err := Generate(testCase.MapCode)
		if err != nil {
			t.Fatalf("%s: %v", testCase.MapCode, err)
		}
		if !reflect.DeepEqual(got, testCase.Layout) {
			gotJSON, _ := json.Marshal(got)
			wantJSON, _ := json.Marshal(testCase.Layout)
			t.Errorf("%s\ngo=%s\npython=%s", testCase.MapCode, gotJSON, wantJSON)
		}
	}
}

package chronicles

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestAuthoredMainDungeonKeepsTopologyAcrossSeeds(t *testing.T) {
	rows := []string{
		"#########", "#...#...#", "#...#...#", "#.......#",
		"#...#...#", "#...#...#", "#########",
	}
	grid := bson.A{}
	for _, row := range rows {
		grid = append(grid, row)
	}
	manifest := bson.D{
		{Key: "id", Value: "story-catacomb"},
		{Key: "version", Value: int64(2)},
		{Key: "regionKind", Value: "dungeon"},
		{Key: "dungeonRole", Value: "main"},
		{Key: "layoutMode", Value: "authored"},
		{Key: "grid", Value: grid},
		{Key: "partyStart", Value: bson.D{
			{Key: "x", Value: int64(1)},
			{Key: "y", Value: int64(5)},
			{Key: "direction", Value: int64(1)},
		}},
		{Key: "enemies", Value: bson.A{}},
		{Key: "interactables", Value: bson.A{}},
		{Key: "triggers", Value: bson.A{}},
		{Key: "treasures", Value: bson.A{}},
		{Key: "traps", Value: bson.A{}},
		{Key: "exits", Value: bson.A{}},
	}
	var revision, code string
	for _, seed := range []int64{0, 1, 417, 2147483647} {
		generated, nextCode, nextRevision, err := proceduralize(manifest, seed, nil, 0)
		if err != nil {
			t.Fatalf("seed %d: %v", seed, err)
		}
		if !reflect.DeepEqual(gridRows(generated), rows) {
			t.Fatalf("seed %d mutated story dungeon", seed)
		}
		gen, ok := get(generated, "generation").(bson.D)
		if !ok || get(gen, "kind") != "authored-layout" {
			t.Fatalf("seed %d did not use authored generation", seed)
		}
		if revision != "" && (revision != nextRevision || code != nextCode) {
			t.Fatalf("seed %d changed static world identity", seed)
		}
		revision, code = nextRevision, nextCode
	}
}

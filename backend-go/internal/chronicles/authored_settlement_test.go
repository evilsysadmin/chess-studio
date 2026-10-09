package chronicles

import (
	"reflect"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestAuthoredSettlementKeepsRoadsAndDoorways(t *testing.T) {
	grid := bson.A{strings.Repeat("#", 19)}
	for i := 0; i < 17; i++ {
		grid = append(grid, "#"+strings.Repeat(".", 17)+"#")
	}
	grid = append(grid, strings.Repeat("#", 19))
	expected := make([]string, 0, len(grid))
	for _, value := range grid {
		expected = append(expected, value.(string))
	}
	manifest := bson.D{
		{Key: "id", Value: "swordhaven-square"},
		{Key: "version", Value: int64(1)},
		{Key: "regionKind", Value: "settlement"},
		{Key: "layoutMode", Value: "authored"},
		{Key: "grid", Value: grid},
		{Key: "partyStart", Value: bson.D{
			{Key: "x", Value: int64(9)},
			{Key: "y", Value: int64(16)},
			{Key: "direction", Value: int64(0)},
		}},
		{Key: "enemies", Value: bson.A{}},
		{Key: "interactables", Value: bson.A{}},
		{Key: "triggers", Value: bson.A{}},
		{Key: "treasures", Value: bson.A{}},
		{Key: "traps", Value: bson.A{}},
		{Key: "exits", Value: bson.A{}},
	}
	for _, seed := range []int64{0, 1, 417, 2147483647} {
		generated, code, revision, err := proceduralize(manifest, seed, nil, 0)
		if err != nil {
			t.Fatalf("seed %d: %v", seed, err)
		}
		if !reflect.DeepEqual(gridRows(generated), expected) {
			t.Fatalf("seed %d changed authored settlement grid", seed)
		}
		metadata, ok := get(generated, "generation").(bson.D)
		if !ok || get(metadata, "kind") != "authored-layout" || get(metadata, "layoutRevision") != revision || code == "" {
			t.Fatalf("seed %d: invalid authored generation metadata", seed)
		}
	}
}

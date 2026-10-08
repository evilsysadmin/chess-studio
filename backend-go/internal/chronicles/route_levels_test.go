package chronicles

import (
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestRoutePlanForLevelScalesLengthAndCapsAtPolicyMax(t *testing.T) {
	want := map[int64]int{1: 3, 2: 4, 3: 5, 4: 6, 8: 6}
	for level, length := range want {
		route, err := RoutePlanForLevel(20261008, level)
		if err != nil {
			t.Fatalf("level %d: %v", level, err)
		}
		if len(route) != length {
			t.Fatalf("level %d: got route length %d, want %d", level, len(route), length)
		}
		if route[len(route)-1] != "echo-cistern" {
			t.Fatalf("level %d: route must end in echo-cistern: %v", level, route)
		}
	}
}


func TestDungeonTopologyRecipePreservesLegacyAndScalesDifficulty(t *testing.T) {
	manifest, _, err := LoadManifest("crypt-eight-squares")
	if err != nil {
		t.Fatal(err)
	}
	base, err := mapCodeForManifest(manifest, 417)
	if err != nil {
		t.Fatal(err)
	}

	legacy := dungeonTopologyRecipe(base, 4, 0)
	if !legacy.Equal(base) {
		t.Fatalf("version zero changed legacy recipe: %#v != %#v", legacy, base)
	}

	levelThree := dungeonTopologyRecipe(base, 3, DungeonTopologyVersion)
	want := base.Difficulty + 2
	if want > 5 {
		want = 5
	}
	if levelThree.Difficulty != want {
		t.Fatalf("level 3 difficulty=%d, want %d", levelThree.Difficulty, want)
	}
}

func TestDungeonTopologyV1EmitsVersionedMetadata(t *testing.T) {
	manifest, _, err := LoadManifest("crypt-eight-squares")
	if err != nil {
		t.Fatal(err)
	}
	generated, _, _, err := proceduralize(
		manifest,
		417,
		nil,
		ContentPlacementVersion,
		3,
		DungeonTopologyVersion,
	)
	if err != nil {
		t.Fatal(err)
	}
	generation, _ := get(generated, "generation").(bson.D)
	version, _ := intValue(get(generation, "dungeonTopologyVersion"))
	level, _ := intValue(get(generation, "dungeonLevel"))
	if version != DungeonTopologyVersion || level != 3 {
		t.Fatalf("unexpected topology metadata: version=%d level=%d", version, level)
	}
}


func TestDungeonTopologyIsPlannerDifficultyFloor(t *testing.T) {
	manifest, _, err := LoadManifest("crypt-eight-squares")
	if err != nil {
		t.Fatal(err)
	}
	proposal := bson.D{
		{Key: "version", Value: int64(1)},
		{Key: "source", Value: "test"},
		{Key: "difficulty", Value: int64(1)},
	}
	_, mapCode, _, err := proceduralize(
		manifest,
		417,
		proposal,
		ContentPlacementVersion,
		3,
		DungeonTopologyVersion,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(mapCode, "difficulty=4") {
		t.Fatalf("dungeon topology floor missing from map code: %s", mapCode)
	}
}

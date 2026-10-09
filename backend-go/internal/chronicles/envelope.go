package chronicles

import (
	"fmt"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesmap"
)

// AreaOptions are chronicles_area_envelope's keyword arguments.
type AreaOptions struct {
	Route            *RouteSnapshot
	PlannerSnapshot  any // raw document, nil without one
	PartyLevel       *int64
	DungeonLevel     int64
	PlacementVersion int
}

func max64(left, right int64) int64 {
	if left > right {
		return left
	}
	return right
}

// AreaEnvelope is chronicles_area_envelope.
func AreaEnvelope(mapID string, seed int64, opts AreaOptions) (bson.D, error) {
	authored, _, err := LoadManifest(mapID)
	if err != nil {
		return nil, err
	}
	proposals, err := normalizePlannerSnapshot(opts.PlannerSnapshot)
	if err != nil {
		return nil, err
	}
	var proposal any
	if p, ok := proposals[mapID]; ok {
		proposal = p
	}
	generated, mapCode, layoutRevision, err := proceduralize(authored, seed, proposal, opts.PlacementVersion)
	if err != nil {
		return nil, err
	}
	routed, err := applyRoutePlan(generated, seed, opts.Route)
	if err != nil {
		return nil, err
	}
	var difficulty bson.D
	if opts.PartyLevel != nil {
		depth := opts.Route.depth(mapID) + max64(0, opts.DungeonLevel-1)
		if routed, difficulty, err = applyDifficulty(routed, *opts.PartyLevel, depth); err != nil {
			return nil, err
		}
	}
	authoredID, _ := get(authored, "id").(string)
	if err := ValidateManifest(routed, authoredID); err != nil {
		return nil, err
	}
	revision, err := canonicalRevision(routed)
	if err != nil {
		return nil, err
	}
	version := get(routed, "version")
	envelope := bson.D{
		{Key: "schemaVersion", Value: int64(ManifestSchemaVersion)},
		{Key: "mapId", Value: authoredID},
		{Key: "contentVersion", Value: version},
		{Key: "seed", Value: seed},
		{Key: "instanceId", Value: sha256Hex(fmtInstance(authoredID, version, seed, revision))[:24]},
		{Key: "manifestRevision", Value: revision},
		{Key: "mapCode", Value: mapCode},
		{Key: "generatorVersion", Value: int64(chroniclesmap.GeneratorVersion)},
		{Key: "layoutRevision", Value: layoutRevision},
	}
	if difficulty != nil {
		envelope = append(envelope, bson.E{Key: "difficulty", Value: difficulty})
	}
	return append(envelope, bson.E{Key: "manifest", Value: routed}), nil
}

func fmtInstance(id string, version any, seed int64, revision string) string {
	v, _ := intValue(version)
	return fmt.Sprintf("chronicles-area-v%d:%s:%d:%d:%s", ManifestSchemaVersion, id, v, seed, revision)
}

// Preview is the MapCode preview route: generate_chronicles_layout(code).as_dict().
// Errors are *chroniclesmap.Error or *chroniclesmap.GenerationError (the 400s).
func Preview(code string) (bson.D, error) {
	layout, err := chroniclesmap.Generate(code)
	if err != nil {
		return nil, err
	}
	grid := bson.A{}
	for _, row := range layout.Grid {
		grid = append(grid, row)
	}
	return bson.D{
		{Key: "mapCode", Value: layout.MapCode},
		{Key: "generatorVersion", Value: int64(layout.GeneratorVersion)},
		{Key: "layoutRevision", Value: layout.LayoutRevision},
		{Key: "grid", Value: grid},
		{Key: "partyStart", Value: bson.D{{Key: "x", Value: int64(layout.PartyStart.X)}, {Key: "y", Value: int64(layout.PartyStart.Y)}, {Key: "direction", Value: int64(1)}}},
		{Key: "exit", Value: bson.D{{Key: "x", Value: int64(layout.Exit.X)}, {Key: "y", Value: int64(layout.Exit.Y)}}},
		{Key: "walkableCount", Value: int64(layout.WalkableCount)},
	}, nil
}

// TransitionTargets is _transition_targets: every map a content action or an
// enemy's defeat can transition to.
func TransitionTargets(manifest bson.D) map[string]bool {
	var effects bson.A
	collect := func(owner bson.D, key string) {
		action, _ := get(owner, key).(bson.D)
		list, _ := get(action, "effects").(bson.A)
		effects = append(effects, list...)
	}
	for _, group := range contentGroups {
		for _, entry := range docs(get(manifest, group)) {
			collect(entry, "action")
		}
	}
	for _, enemy := range docs(get(manifest, "enemies")) {
		collect(enemy, "onDefeat")
	}
	targets := map[string]bool{}
	for _, raw := range effects {
		if effect, ok := raw.(bson.D); ok && get(effect, "type") == "transition-map" {
			if id, isString := get(effect, "mapId").(string); isString {
				targets[id] = true
			}
		}
	}
	return targets
}

// RouteDepth is _run_depth.
func RouteDepth(route *RouteSnapshot, mapID string) int64 { return route.depth(mapID) }

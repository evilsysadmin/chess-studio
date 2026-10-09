package chronicles

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesmap"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

// chronicles_manifest_procedural.py: the seeded layout overlay that keeps
// every authored anchor while regenerating the geometry around it.
const (
	OptionalEnemyPlacementVersion = 1
	ExitPlacementVersion          = 2
	ContentPlacementVersion       = ExitPlacementVersion
)

func themeForMapID(mapID string) string {
	value := strings.ToLower(mapID)
	switch {
	case strings.Contains(value, "gallery"):
		return "gallery"
	case strings.Contains(value, "ash"):
		return "ash"
	case strings.Contains(value, "archive"):
		return "archive"
	case strings.Contains(value, "foundry") || strings.Contains(value, "iron"):
		return "iron"
	case strings.Contains(value, "basilica"):
		return "basilica"
	case strings.Contains(value, "bell") || strings.Contains(value, "tower"):
		return "bell"
	case strings.Contains(value, "glass"):
		return "glass"
	case strings.Contains(value, "cistern") || strings.Contains(value, "water"):
		return "water"
	}
	return "crypt"
}

func listLen(v any) int {
	arr, _ := v.(bson.A)
	return len(arr)
}

func verbsForManifest(manifest bson.D, theme string) []string {
	var verbs []string
	for _, entry := range docs(get(manifest, "interactables")) {
		if get(entry, "kind") == "lever" {
			if theme == "water" {
				verbs = append(verbs, "sluice")
			} else {
				verbs = append(verbs, "lever")
			}
			break
		}
	}
	if listLen(get(manifest, "traps")) > 0 {
		verbs = append(verbs, "traps")
	}
	for _, group := range contentGroups {
		found := false
		for _, entry := range docs(get(manifest, group)) {
			if get(entry, "kind") == "secret-door" {
				found = true
				break
			}
		}
		if found {
			verbs = append(verbs, "secret")
			break
		}
	}
	if listLen(get(manifest, "enemies")) > 0 {
		verbs = append(verbs, "guardian")
	}
	if len(verbs) == 0 {
		verbs = append(verbs, "hunt")
	}
	if len(verbs) > 4 {
		verbs = verbs[:4]
	}
	return verbs
}

// mapCodeForManifest is chronicles_map_code_for_manifest.
func mapCodeForManifest(manifest bson.D, seed int64) (chroniclesmap.Recipe, error) {
	grid := gridRows(manifest)
	width := 0
	if len(grid) > 0 {
		width = len([]rune(grid[0]))
	}
	id, _ := get(manifest, "id").(string)
	theme := themeForMapID(id)
	secrets := 0
	for _, group := range contentGroups {
		for _, entry := range docs(get(manifest, group)) {
			if get(entry, "kind") == "secret-door" {
				secrets++
			}
		}
	}
	difficulty, err := authoredDifficulty(manifest)
	if err != nil {
		return chroniclesmap.Recipe{}, err
	}
	return chroniclesmap.Recipe{
		Theme: theme, Width: width, Height: len(grid), Verbs: verbsForManifest(manifest, theme),
		Enemies: max(2, min(8, listLen(get(manifest, "enemies")))), Treasures: min(4, listLen(get(manifest, "treasures"))),
		Secrets: min(3, secrets), Difficulty: int(difficulty), Seed: int(seed),
	}, nil
}

func baseMarkerPositions(grid []string, includeExit bool) map[point]rune {
	markers := map[point]rune{}
	for y, row := range grid {
		for x, cell := range []rune(row) {
			if cell == '#' || cell == '.' || (!includeExit && cell == 'X') {
				continue
			}
			markers[point{int64(x), int64(y)}] = cell
		}
	}
	return markers
}

func enemyUsesSeededPlacement(manifest, enemy bson.D, version int) bool {
	if version < OptionalEnemyPlacementVersion {
		return false
	}
	ai, ok := get(enemy, "ai").(bson.D)
	return ok && get(ai, "movement") == "hold" && !pyval.Truthy(get(ai, "patrolRoute")) &&
		!pyval.Truthy(get(enemy, "positions")) && !pyval.Truthy(get(enemy, "positionKey")) &&
		optionalEnemyIsVariable(manifest, enemy)
}

// pyPoint is (int(p["x"]), int(p["y"])).
func pyPoint(v any) (point, error) {
	d, _ := v.(bson.D)
	x, err := pyval.Int(get(d, "x"))
	if err != nil {
		return point{}, err
	}
	y, err := pyval.Int(get(d, "y"))
	return point{x, y}, err
}

// anchorPositions is _anchor_positions.
func anchorPositions(manifest bson.D, version int) (map[point]bool, error) {
	anchors := map[point]bool{}
	add := func(v any) error {
		p, err := pyPoint(v)
		if err == nil {
			anchors[p] = true
		}
		return err
	}
	if err := add(get(manifest, "partyStart")); err != nil {
		return nil, err
	}
	for _, enemy := range docs(get(manifest, "enemies")) {
		if enemyUsesSeededPlacement(manifest, enemy, version) {
			continue
		}
		if err := add(enemy); err != nil {
			return nil, err
		}
		ai, _ := get(enemy, "ai").(bson.D)
		route, _ := get(ai, "patrolRoute").(bson.A)
		for _, p := range route {
			if err := add(p); err != nil {
				return nil, err
			}
		}
		positions, _ := get(enemy, "positions").(bson.D)
		for _, e := range positions {
			if err := add(e.Value); err != nil {
				return nil, err
			}
		}
	}
	for _, group := range contentGroups {
		for _, entry := range docs(get(manifest, group)) {
			if has(entry, "x") && has(entry, "y") {
				if err := add(entry); err != nil {
					return nil, err
				}
			}
		}
	}
	for p := range baseMarkerPositions(gridRows(manifest), version < ExitPlacementVersion) {
		anchors[p] = true
	}
	return anchors, nil
}

func digestOf(format string, args ...any) []byte {
	sum := sha256.Sum256([]byte(fmt.Sprintf(format, args...)))
	return sum[:]
}

// pickMin is min(points, key=(digest(point), y, x)).
func pickMin(points map[point]bool, key func(point) []byte) point {
	var best point
	var bestKey []byte
	first := true
	for p := range points {
		k := key(p)
		if first {
			best, bestKey, first = p, k, false
			continue
		}
		c := bytes.Compare(k, bestKey)
		if c < 0 || (c == 0 && (p.y < best.y || (p.y == best.y && p.x < best.x))) {
			best, bestKey = p, k
		}
	}
	return best
}

func connectAnchor(grid [][]rune, open map[point]bool, anchor point, mapCode string) {
	if open[anchor] {
		return
	}
	abs := func(v int64) int64 {
		if v < 0 {
			return -v
		}
		return v
	}
	var target point
	bestDistance := int64(-1)
	for p := range open {
		d := abs(p.x-anchor.x) + abs(p.y-anchor.y)
		if bestDistance < 0 || d < bestDistance || (d == bestDistance && (p.y < target.y || (p.y == target.y && p.x < target.x))) {
			target, bestDistance = p, d
		}
	}
	x, y := anchor.x, anchor.y
	grid[y][x] = '.'
	open[point{x, y}] = true
	horizontalFirst := digestOf("%s:%d:%d", mapCode, anchor.x, anchor.y)[0]&1 == 1
	axes := []byte{'y', 'x'}
	if horizontalFirst {
		axes = []byte{'x', 'y'}
	}
	step := func(from, to int64) int64 {
		if to > from {
			return 1
		}
		return -1
	}
	for _, axis := range axes {
		if axis == 'x' {
			for x != target.x {
				x += step(x, target.x)
				grid[y][x] = '.'
				open[point{x, y}] = true
			}
		} else {
			for y != target.y {
				y += step(y, target.y)
				grid[y][x] = '.'
				open[point{x, y}] = true
			}
		}
	}
}

func gridDistances(grid [][]rune, start point) map[point]int {
	distances := map[point]int{start: 0}
	queue := []point{start}
	for len(queue) > 0 {
		p := queue[0]
		queue = queue[1:]
		for _, d := range cardinal {
			n := point{p.x + d.x, p.y + d.y}
			if n.y < 0 || n.y >= int64(len(grid)) || n.x < 0 || n.x >= int64(len(grid[0])) || grid[n.y][n.x] == '#' {
				continue
			}
			if _, seen := distances[n]; seen {
				continue
			}
			distances[n] = distances[p] + 1
			queue = append(queue, n)
		}
	}
	return distances
}

func genErr(msg string) error { return &GenerationError{msg: msg} }

func placeSeededExit(manifest bson.D, grid [][]rune, mapCode string, version int) (*point, error) {
	if version < ExitPlacementVersion {
		return nil, nil
	}
	start, err := pyPoint(get(manifest, "partyStart"))
	if err != nil {
		return nil, err
	}
	distances := gridDistances(grid, start)
	fixed, err := anchorPositions(manifest, version)
	if err != nil {
		return nil, err
	}
	farthest := -1
	for p, d := range distances {
		if d >= 4 && grid[p.y][p.x] == '.' && !fixed[p] && d > farthest {
			farthest = d
		}
	}
	if farthest < 0 {
		return nil, genErr("generated topology has no safe distant cell for the exit")
	}
	candidates := map[point]bool{}
	for p, d := range distances {
		if d == farthest && grid[p.y][p.x] == '.' && !fixed[p] {
			candidates[p] = true
		}
	}
	exit := pickMin(candidates, func(p point) []byte {
		return digestOf("chronicles-exit-placement-v%d:%s:%d:%d", ExitPlacementVersion, mapCode, p.x, p.y)
	})
	return &exit, nil
}

type placement struct {
	id   string
	x, y int64
}

func contentPlacementRevision(mapCode string, placements []placement, version int, exit *point) string {
	parts := make([]string, len(placements))
	for i, p := range placements {
		parts[i] = fmt.Sprintf("%s:%d:%d", p.id, p.x, p.y)
	}
	material := fmt.Sprintf("chronicles-content-placement-v%d:%s:", version, mapCode) + strings.Join(parts, "|")
	if version >= ExitPlacementVersion && exit != nil {
		material += fmt.Sprintf("|exit:%d:%d", exit.x, exit.y)
	}
	return sha256Hex(material)
}

// placeSeededOptionalEnemies mutates generated's relocatable enemies.
func placeSeededOptionalEnemies(generated bson.D, mapCode string, version int) ([]placement, any, error) {
	if version < OptionalEnemyPlacementVersion {
		return nil, nil, nil
	}
	enemies, _ := get(generated, "enemies").(bson.A)
	type relocatable struct {
		index int
		id    string
	}
	var movable []relocatable
	for i, raw := range enemies {
		if enemy, ok := raw.(bson.D); ok && enemyUsesSeededPlacement(generated, enemy, version) {
			movable = append(movable, relocatable{i, strOr(get(enemy, "id"))})
		}
	}
	sort.SliceStable(movable, func(i, j int) bool { return movable[i].id < movable[j].id })
	if len(movable) == 0 {
		return nil, contentPlacementRevision(mapCode, nil, version, nil), nil
	}
	fixed, err := anchorPositions(generated, version)
	if err != nil {
		return nil, nil, err
	}
	start, err := pyPoint(get(generated, "partyStart"))
	if err != nil {
		return nil, nil, err
	}
	collect := func(minDistance int64) map[point]bool {
		out := map[point]bool{}
		for y, row := range gridRows(generated) {
			for x, cell := range []rune(row) {
				p := point{int64(x), int64(y)}
				dx, dy := p.x-start.x, p.y-start.y
				if dx < 0 {
					dx = -dx
				}
				if dy < 0 {
					dy = -dy
				}
				if cell == '.' && !fixed[p] && dx+dy >= minDistance {
					out[p] = true
				}
			}
		}
		return out
	}
	candidates := collect(3)
	if len(candidates) < len(movable) {
		candidates = collect(-1)
	}
	if len(candidates) < len(movable) {
		return nil, nil, genErr("generated topology has no safe cells for optional encounters")
	}
	var placed []placement
	for _, m := range movable {
		p := pickMin(candidates, func(c point) []byte {
			return digestOf("chronicles-content-placement-v%d:%s:%s:%d:%d", OptionalEnemyPlacementVersion, mapCode, m.id, c.x, c.y)
		})
		delete(candidates, p)
		enemy := enemies[m.index].(bson.D)
		enemy = setKey(enemy, "x", p.x)
		enemies[m.index] = setKey(enemy, "y", p.y)
		placed = append(placed, placement{m.id, p.x, p.y})
	}
	return placed, contentPlacementRevision(mapCode, placed, version, nil), nil
}

type materialized struct {
	manifest                bson.D
	mapCode, layoutRevision string
	placements              []placement
	placementRevision       any
	exit                    *point
}

func materializeRecipe(composed bson.D, recipe chroniclesmap.Recipe, version int) (materialized, error) {
	mapCode, err := chroniclesmap.Encode(recipe)
	if err != nil {
		return materialized{}, err
	}
	layout, err := chroniclesmap.GenerateRecipe(recipe)
	if err != nil {
		return materialized{}, err
	}
	grid := make([][]rune, len(layout.Grid))
	open := map[point]bool{}
	for y, row := range layout.Grid {
		grid[y] = []rune(row)
		for x, cell := range grid[y] {
			if cell == 'P' || cell == 'X' {
				grid[y][x] = '.'
			}
			if grid[y][x] != '#' {
				open[point{int64(x), int64(y)}] = true
			}
		}
	}
	anchors, err := anchorPositions(composed, version)
	if err != nil {
		return materialized{}, err
	}
	ordered := make([]point, 0, len(anchors))
	for p := range anchors {
		ordered = append(ordered, p)
	}
	sort.Slice(ordered, func(i, j int) bool {
		return ordered[i].y < ordered[j].y || (ordered[i].y == ordered[j].y && ordered[i].x < ordered[j].x)
	})
	for _, anchor := range ordered {
		if anchor.y < 0 || anchor.y >= int64(len(grid)) || anchor.x < 0 || anchor.x >= int64(len(grid[0])) {
			return materialized{}, fmt.Errorf("IndexError: anchor outside the generated grid")
		}
		connectAnchor(grid, open, anchor, mapCode)
	}
	for p, marker := range baseMarkerPositions(gridRows(composed), version < ExitPlacementVersion) {
		grid[p.y][p.x] = marker
	}
	start, err := pyPoint(get(composed, "partyStart"))
	if err != nil {
		return materialized{}, err
	}
	grid[start.y][start.x] = 'P'
	exit, err := placeSeededExit(composed, grid, mapCode, version)
	if err != nil {
		return materialized{}, err
	}
	if exit != nil {
		grid[exit.y][exit.x] = 'X'
	}
	finalGrid := make([]string, len(grid))
	rows := bson.A{}
	for i, row := range grid {
		finalGrid[i] = string(row)
		rows = append(rows, finalGrid[i])
	}
	generated := setKey(copyDoc(composed), "grid", rows)
	placements, placementRevision, err := placeSeededOptionalEnemies(generated, mapCode, version)
	if err != nil {
		return materialized{}, err
	}
	if version >= ExitPlacementVersion {
		placementRevision = contentPlacementRevision(mapCode, placements, version, exit)
	}
	layoutSum := sha256.Sum256([]byte(fmt.Sprintf("seeded-area-v%d\x00%s\x00", chroniclesmap.GeneratorVersion, mapCode) + strings.Join(finalGrid, "\n")))
	return materialized{
		manifest: generated, mapCode: mapCode, layoutRevision: hex.EncodeToString(layoutSum[:]),
		placements: placements, placementRevision: placementRevision, exit: exit,
	}, nil
}

// proceduralize is proceduralize_chronicles_manifest; it returns the
// generated manifest, its MapCode and layout revision.
func proceduralize(manifest bson.D, seed int64, proposal any, version int) (bson.D, string, string, error) {
	// An authored settlement is a persistent hub, not a generated dungeon.
	// Preserve every wall and doorway; no seeded composition or relocation.
	if get(manifest, "regionKind") == "settlement" && get(manifest, "layoutMode") == "authored" {
		// An authored town may exceed procedural MapCode dimension limits.
		// Its mapCode is a stable content identity, not a dungeon recipe.
		code := fmt.Sprintf("authored-layout-v1:%v:%v", get(manifest, "id"), get(manifest, "version"))
		sum := sha256.Sum256([]byte(fmt.Sprintf("seeded-area-v%d\x00%s\x00", chroniclesmap.GeneratorVersion, code) + strings.Join(gridRows(manifest), "\n")))
		revision := hex.EncodeToString(sum[:])
		generation := bson.D{
			{Key: "kind", Value: "authored-layout"},
			{Key: "mapCode", Value: code},
			{Key: "generatorVersion", Value: int64(chroniclesmap.GeneratorVersion)},
			{Key: "layoutRevision", Value: revision},
		}
		return setKey(manifest, "generation", generation), code, revision, nil
	}

	varied, modules := applyModules(manifest, seed)
	composed, composition := applyComposition(varied, seed)
	composed, treasure := applyTreasure(composed, seed)
	base, err := mapCodeForManifest(composed, seed)
	if err != nil {
		return nil, "", "", err
	}
	planner, err := resolvePlannerRecipe(base, proposal)
	if err != nil {
		return nil, "", "", err
	}
	local, err := materializeRecipe(composed, base, version)
	if err != nil {
		return nil, "", "", err
	}
	localQuality := evaluateTopology(local.manifest)
	if !localQuality.accepted {
		detail := strings.Join(localQuality.reasons, ",")
		if detail == "" {
			detail = "unknown"
		}
		return nil, "", "", genErr("local Chronicles topology failed quality gate: " + detail)
	}
	chosen, quality := local, localQuality
	fallback, applied, reason := false, false, planner.reason
	var rejected []string
	if planner.accepted {
		planned, err := materializeRecipe(composed, planner.recipe, version)
		if err != nil {
			return nil, "", "", err
		}
		plannedQuality := evaluateTopology(planned.manifest)
		if regressions := compareTopology(plannedQuality, localQuality); len(regressions) > 0 {
			fallback, rejected, reason = true, regressions, "quality-rejected"
		} else {
			chosen, quality, applied = planned, plannedQuality, true
		}
	}
	generation := bson.D{
		{Key: "kind", Value: "seeded-layout"},
		{Key: "mapCode", Value: chosen.mapCode},
		{Key: "generatorVersion", Value: int64(chroniclesmap.GeneratorVersion)},
		{Key: "layoutRevision", Value: chosen.layoutRevision},
		{Key: "topologyQualityVersion", Value: int64(TopologyQualityVersion)},
		{Key: "topologyQuality", Value: quality.doc()},
		{Key: "topologyBaselineQuality", Value: localQuality.doc()},
		{Key: "plannerContractVersion", Value: int64(PlannerContractVersion)},
		{Key: "plannerAccepted", Value: applied},
		{Key: "plannerSource", Value: planner.source},
		{Key: "plannerProposalRevision", Value: planner.revision},
		{Key: "plannerReason", Value: reason},
		{Key: "plannerQualityFallback", Value: fallback},
		{Key: "plannerQualityRejectedReasons", Value: strList(rejected)},
		{Key: "moduleVariationVersion", Value: int64(ModuleVariationVersion)},
		{Key: "moduleVariationRevision", Value: modules.revision},
		{Key: "activeProceduralModuleIds", Value: strList(modules.active)},
		{Key: "omittedProceduralModuleIds", Value: strList(modules.omitted)},
		{Key: "compositionVersion", Value: int64(CompositionVersion)},
		{Key: "compositionRevision", Value: composition.revision},
		{Key: "activeOptionalEnemyIds", Value: strList(composition.active)},
		{Key: "omittedOptionalEnemyIds", Value: strList(composition.omitted)},
		{Key: "protectedOptionalEnemyIds", Value: strList(composition.protected)},
		{Key: "treasureVariationVersion", Value: int64(TreasureVariationVersion)},
		{Key: "treasureVariationRevision", Value: treasure.revision},
		{Key: "treasureBoons", Value: boonDocs(treasure.boons)},
	}
	if version >= OptionalEnemyPlacementVersion {
		relocated := bson.A{}
		for _, p := range chosen.placements {
			relocated = append(relocated, bson.D{{Key: "id", Value: p.id}, {Key: "x", Value: p.x}, {Key: "y", Value: p.y}})
		}
		generation = append(generation,
			bson.E{Key: "contentPlacementVersion", Value: int64(version)},
			bson.E{Key: "contentPlacementRevision", Value: chosen.placementRevision},
			bson.E{Key: "relocatedOptionalEnemies", Value: relocated},
		)
	}
	if version >= ExitPlacementVersion {
		generation = append(generation, bson.E{Key: "exitPosition", Value: bson.D{{Key: "x", Value: chosen.exit.x}, {Key: "y", Value: chosen.exit.y}}})
	}
	return setKey(chosen.manifest, "generation", generation), chosen.mapCode, chosen.layoutRevision, nil
}

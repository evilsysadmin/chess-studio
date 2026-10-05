package chronicles

import (
	"math"
	"sort"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	TopologyQualityVersion         = 1
	minExitDistance                = 4
	minOpenRatio                   = 0.25
	maxDeadEndRatio                = 0.50
	corridorArticulationRatio      = 0.82
	corridorDegreeTwoRatio         = 0.75
	openRatioRegression            = 0.18
	deadEndRatioRegression         = 0.25
	articulationRatioRegression    = 0.30
	minDeadEndRatioForRegression   = 0.45
	minArticulationRatioForRegress = 0.75
	exitDistanceRetainRatio        = 0.35
)

type point struct{ x, y int64 }

var cardinal = []point{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}

// topologyQuality is ChroniclesTopologyQuality.
type topologyQuality struct {
	accepted                              bool
	reasons, warnings                     []string
	walkable, reachable, exits            int
	minExit, maxExit                      *int
	openRatio, deadEndRatio               float64
	deadEnds, articulations, cycleRank    int
	articulationRatio, corridorRatio      float64
	anchors, unreachableAnchors, overlaps int
}

func optInt(v *int) any {
	if v == nil {
		return nil
	}
	return int64(*v)
}

func (q topologyQuality) doc() bson.D {
	return bson.D{
		{Key: "version", Value: int64(TopologyQualityVersion)},
		{Key: "accepted", Value: q.accepted},
		{Key: "reasons", Value: strList(q.reasons)},
		{Key: "warnings", Value: strList(q.warnings)},
		{Key: "walkableCount", Value: int64(q.walkable)},
		{Key: "reachableCount", Value: int64(q.reachable)},
		{Key: "exitCount", Value: int64(q.exits)},
		{Key: "minExitDistance", Value: optInt(q.minExit)},
		{Key: "maxExitDistance", Value: optInt(q.maxExit)},
		{Key: "openRatio", Value: pyRound(q.openRatio, 4)},
		{Key: "deadEndCount", Value: int64(q.deadEnds)},
		{Key: "deadEndRatio", Value: pyRound(q.deadEndRatio, 4)},
		{Key: "articulationCount", Value: int64(q.articulations)},
		{Key: "articulationRatio", Value: pyRound(q.articulationRatio, 4)},
		{Key: "cycleRank", Value: int64(q.cycleRank)},
		{Key: "corridorRatio", Value: pyRound(q.corridorRatio, 4)},
		{Key: "criticalAnchorCount", Value: int64(q.anchors)},
		{Key: "unreachableAnchorCount", Value: int64(q.unreachableAnchors)},
		{Key: "enemyExitOverlapCount", Value: int64(q.overlaps)},
	}
}

// pointOf is _point: integer x and y, never bools.
func pointOf(v any) (point, bool) {
	d, ok := v.(bson.D)
	if !ok {
		return point{}, false
	}
	x, okX := intValue(get(d, "x"))
	y, okY := intValue(get(d, "y"))
	if !okX || !okY {
		return point{}, false
	}
	return point{x, y}, true
}

func tilePositions(grid []string, tile rune) map[point]bool {
	out := map[point]bool{}
	for y, row := range grid {
		for x, cell := range []rune(row) {
			if cell == tile {
				out[point{int64(x), int64(y)}] = true
			}
		}
	}
	return out
}

func entryPositions(grid []string, entry any) map[point]bool {
	if p, ok := pointOf(entry); ok {
		return map[point]bool{p: true}
	}
	if d, ok := entry.(bson.D); ok {
		if tile, isString := get(d, "tile").(string); isString && len([]rune(tile)) == 1 {
			return tilePositions(grid, []rune(tile)[0])
		}
	}
	return map[point]bool{}
}

func walkableCells(grid []string) map[point]bool {
	out := map[point]bool{}
	for y, row := range grid {
		for x, cell := range []rune(row) {
			if cell != '#' {
				out[point{int64(x), int64(y)}] = true
			}
		}
	}
	return out
}

func neighbors(p point, walkable map[point]bool) []point {
	var out []point
	for _, d := range cardinal {
		n := point{p.x + d.x, p.y + d.y}
		if walkable[n] {
			out = append(out, n)
		}
	}
	return out
}

func bfs(walkable map[point]bool, start point) map[point]int {
	if !walkable[start] {
		return map[point]int{}
	}
	dist := map[point]int{start: 0}
	queue := []point{start}
	for len(queue) > 0 {
		p := queue[0]
		queue = queue[1:]
		for _, n := range neighbors(p, walkable) {
			if _, seen := dist[n]; seen {
				continue
			}
			dist[n] = dist[p] + 1
			queue = append(queue, n)
		}
	}
	return dist
}

func sortedPoints(set map[point]bool) []point {
	out := make([]point, 0, len(set))
	for p := range set {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].y != out[j].y {
			return out[i].y < out[j].y
		}
		return out[i].x < out[j].x
	})
	return out
}

// articulationPoints is _articulation_points (a graph property: the visit
// order does not change the set).
func articulationPoints(walkable map[point]bool) int {
	discovery, low := map[point]int{}, map[point]int{}
	parent := map[point]*point{}
	result := map[point]bool{}
	clock := 0
	var visit func(p point)
	visit = func(p point) {
		clock++
		discovery[p], low[p] = clock, clock
		children := 0
		for _, n := range neighbors(p, walkable) {
			if _, seen := discovery[n]; !seen {
				pp := p
				parent[n] = &pp
				children++
				visit(n)
				low[p] = min(low[p], low[n])
				if parent[p] == nil && children > 1 {
					result[p] = true
				}
				if parent[p] != nil && low[n] >= discovery[p] {
					result[p] = true
				}
			} else if parent[p] == nil || *parent[p] != n {
				low[p] = min(low[p], discovery[n])
			}
		}
	}
	for _, p := range sortedPoints(walkable) {
		if _, seen := discovery[p]; seen {
			continue
		}
		parent[p] = nil
		visit(p)
	}
	return len(result)
}

func criticalAnchors(manifest bson.D, grid []string) map[point]bool {
	anchors := map[point]bool{}
	if p, ok := pointOf(get(manifest, "partyStart")); ok {
		anchors[p] = true
	}
	enemies, _ := get(manifest, "enemies").(bson.A)
	for _, raw := range enemies {
		if p, ok := pointOf(raw); ok {
			anchors[p] = true
		}
		enemy, _ := raw.(bson.D)
		if ai, ok := get(enemy, "ai").(bson.D); ok {
			route, _ := get(ai, "patrolRoute").(bson.A)
			for _, r := range route {
				if p, ok := pointOf(r); ok {
					anchors[p] = true
				}
			}
		}
		if positions, ok := get(enemy, "positions").(bson.D); ok {
			for _, e := range positions {
				if p, ok := pointOf(e.Value); ok {
					anchors[p] = true
				}
			}
		}
	}
	for _, group := range contentGroups {
		entries, _ := get(manifest, group).(bson.A)
		for _, entry := range entries {
			for p := range entryPositions(grid, entry) {
				anchors[p] = true
			}
		}
	}
	return anchors
}

// evaluateTopology is evaluate_chronicles_topology.
func evaluateTopology(manifest bson.D) topologyQuality {
	rawGrid, ok := get(manifest, "grid").(bson.A)
	valid := ok && len(rawGrid) > 0
	var grid []string
	if valid {
		for _, r := range rawGrid {
			s, isString := r.(string)
			if !isString || s == "" {
				valid = false
				break
			}
			grid = append(grid, s)
		}
	}
	if valid {
		for _, row := range grid {
			if len([]rune(row)) != len([]rune(grid[0])) {
				valid = false
			}
		}
	}
	if !valid {
		return topologyQuality{reasons: []string{"invalid-grid"}}
	}
	width, height := len([]rune(grid[0])), len(grid)
	walk := walkableCells(grid)
	q := topologyQuality{walkable: len(walk)}
	var reasons, warnings []string
	start, hasStart := pointOf(get(manifest, "partyStart"))
	var dist map[point]int
	if !hasStart || !walk[start] {
		reasons = append(reasons, "invalid-party-start")
		dist = map[point]int{}
	} else {
		dist = bfs(walk, start)
	}
	if len(dist) != len(walk) {
		reasons = append(reasons, "disconnected-walkable-cells")
	}
	exits := map[point]bool{}
	exitEntries, _ := get(manifest, "exits").(bson.A)
	for _, entry := range exitEntries {
		for p := range entryPositions(grid, entry) {
			exits[p] = true
		}
	}
	if len(exits) == 0 {
		reasons = append(reasons, "missing-exit")
	}
	var exitDistances []int
	for p := range exits {
		if d, ok := dist[p]; ok {
			exitDistances = append(exitDistances, d)
		}
	}
	if len(exits) > 0 && len(exitDistances) != len(exits) {
		reasons = append(reasons, "unreachable-exit")
	}
	if len(exitDistances) > 0 {
		lo, hi := exitDistances[0], exitDistances[0]
		for _, d := range exitDistances {
			lo, hi = min(lo, d), max(hi, d)
		}
		q.minExit, q.maxExit = &lo, &hi
		if lo < minExitDistance {
			reasons = append(reasons, "exit-too-close")
		}
	}
	anchors := criticalAnchors(manifest, grid)
	unreachable := 0
	for p := range anchors {
		if _, ok := dist[p]; !ok {
			unreachable++
		}
	}
	if unreachable > 0 {
		reasons = append(reasons, "unreachable-critical-anchor")
	}
	enemyPositions := map[point]bool{}
	enemies, _ := get(manifest, "enemies").(bson.A)
	for _, raw := range enemies {
		if p, ok := pointOf(raw); ok {
			enemyPositions[p] = true
		}
	}
	if hasStart && enemyPositions[start] {
		reasons = append(reasons, "enemy-overlaps-party")
	}
	for p := range enemyPositions {
		if exits[p] {
			q.overlaps++
		}
	}
	interior := max(1, (width-2)*(height-2))
	q.openRatio = float64(len(walk)) / float64(interior)
	if q.openRatio < minOpenRatio {
		reasons = append(reasons, "open-ratio-low")
	}
	degreeSum, corridors := 0, 0
	for p := range walk {
		degree := len(neighbors(p, walk))
		degreeSum += degree
		if degree <= 1 {
			q.deadEnds++
		}
		if degree == 2 {
			corridors++
		}
	}
	q.deadEndRatio = float64(q.deadEnds) / float64(max(1, len(walk)))
	if q.deadEndRatio > maxDeadEndRatio {
		reasons = append(reasons, "dead-end-ratio-high")
	}
	q.articulations = articulationPoints(walk)
	q.articulationRatio = float64(q.articulations) / float64(max(1, len(walk)))
	q.cycleRank = max(0, degreeSum/2-len(walk)+1)
	q.corridorRatio = float64(corridors) / float64(max(1, len(walk)))
	if q.cycleRank == 0 && q.articulationRatio > corridorArticulationRatio && q.corridorRatio > corridorDegreeTwoRatio {
		warnings = append(warnings, "corridor-dominated")
	}
	q.accepted = len(reasons) == 0
	q.reasons, q.warnings = reasons, warnings
	q.reachable, q.exits, q.anchors, q.unreachableAnchors = len(dist), len(exits), len(anchors), unreachable
	return q
}

// compareTopology is compare_chronicles_topology.
func compareTopology(candidate, baseline topologyQuality) []string {
	reasons := append([]string(nil), candidate.reasons...)
	if len(reasons) > 0 || !baseline.accepted {
		return reasons
	}
	if candidate.openRatio < baseline.openRatio-openRatioRegression {
		reasons = append(reasons, "open-ratio-regression")
	}
	if candidate.deadEndRatio > baseline.deadEndRatio+deadEndRatioRegression && candidate.deadEndRatio > minDeadEndRatioForRegression {
		reasons = append(reasons, "dead-end-regression")
	}
	if candidate.articulationRatio > baseline.articulationRatio+articulationRatioRegression && candidate.articulationRatio > minArticulationRatioForRegress {
		reasons = append(reasons, "articulation-regression")
	}
	if baseline.minExit != nil && candidate.minExit != nil {
		retained := max(minExitDistance, int(math.Ceil(float64(*baseline.minExit)*exitDistanceRetainRatio)))
		if *candidate.minExit < retained {
			reasons = append(reasons, "exit-distance-regression")
		}
	}
	return reasons
}

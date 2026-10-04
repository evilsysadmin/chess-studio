package chroniclesmap

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"math"
	"strings"
)

const GeneratorVersion = 2

const reservedObjectSlots = 1

var difficultyOpenRatio = map[int]float64{
	1: .68,
	2: .62,
	3: .56,
	4: .50,
	5: .46,
}

var themeOpenBias = map[string]float64{
	"crypt": -.02, "gallery": .05, "ash": -.03, "archive": .03, "iron": 0,
	"basilica": .01, "bell": 0, "glass": .02, "water": .06,
}

var cardinal = []Point{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
var mazeSteps = []Point{{2, 0}, {-2, 0}, {0, 2}, {0, -2}}

type Point struct {
	X int
	Y int
}

type Layout struct {
	MapCode          string   `json:"mapCode"`
	GeneratorVersion int      `json:"generatorVersion"`
	LayoutRevision   string   `json:"layoutRevision"`
	Grid             []string `json:"grid"`
	PartyStart       struct {
		X         int `json:"x"`
		Y         int `json:"y"`
		Direction int `json:"direction"`
	} `json:"partyStart"`
	Exit struct {
		X int `json:"x"`
		Y int `json:"y"`
	} `json:"exit"`
	WalkableCount int `json:"walkableCount"`
}

type xorshift32 struct {
	state uint32
}

func newRNG(seed uint32) *xorshift32 {
	if seed == 0 {
		seed = 0x6D2B79F5
	}
	return &xorshift32{state: seed}
}

func (rng *xorshift32) next() uint32 {
	value := rng.state
	value ^= value << 13
	value ^= value >> 17
	value ^= value << 5
	rng.state = value
	return value
}

func (rng *xorshift32) choice(size int) int {
	if size <= 0 {
		panic("empty choice")
	}
	return int(rng.next() % uint32(size))
}

func generatorSeed(mapCode string) uint32 {
	sum := sha256.Sum256([]byte(fmt.Sprintf(
		"chronicles-layout-v%d:%s",
		GeneratorVersion,
		mapCode,
	)))
	return binary.BigEndian.Uint32(sum[:4])
}

func mechanismSlots(recipe Recipe) int {
	slots := reservedObjectSlots
	for _, verb := range recipe.Verbs {
		switch verb {
		case "lever", "sluice", "keys", "puzzle", "traps":
			slots += 2
		}
	}
	return slots
}

func requiredWalkable(recipe Recipe) int {
	return 2 + recipe.Enemies + recipe.Treasures + recipe.Secrets + mechanismSlots(recipe)
}

func perfectMazeWalkable(recipe Recipe) int {
	columns := (recipe.Width - 1) / 2
	rows := (recipe.Height - 1) / 2
	count := 2*columns*rows - 1
	if count < 1 {
		return 1
	}
	return count
}

func targetWalkable(recipe Recipe) (int, error) {
	interior := (recipe.Width - 2) * (recipe.Height - 2)
	required := requiredWalkable(recipe)
	if required > interior {
		return 0, fmt.Errorf(
			"recipe needs %d walkable slots but only %d fit",
			required,
			interior,
		)
	}

	ratio := difficultyOpenRatio[recipe.Difficulty] + themeOpenBias[recipe.Theme]
	if ratio < .42 {
		ratio = .42
	}
	if ratio > .75 {
		ratio = .75
	}
	loopFloor := perfectMazeWalkable(recipe) + 2
	if loopFloor > interior {
		loopFloor = interior
	}
	target := int(math.Ceil(float64(interior) * ratio))
	if target < required {
		target = required
	}
	if target < loopFloor {
		target = loopFloor
	}
	if target > interior {
		target = interior
	}
	return target, nil
}

func carveMaze(recipe Recipe, rng *xorshift32) ([][]byte, int) {
	grid := make([][]byte, recipe.Height)
	for y := range grid {
		grid[y] = make([]byte, recipe.Width)
		for x := range grid[y] {
			grid[y][x] = '#'
		}
	}

	start := Point{X: 1, Y: 1}
	grid[start.Y][start.X] = '.'
	visited := map[Point]bool{start: true}
	stack := []Point{start}
	walkableCount := 1

	for len(stack) > 0 {
		current := stack[len(stack)-1]
		type candidate struct {
			x  int
			y  int
			dx int
			dy int
		}
		candidates := make([]candidate, 0, len(mazeSteps))
		for _, step := range mazeSteps {
			nextX := current.X + step.X
			nextY := current.Y + step.Y
			if nextX < 1 || nextX >= recipe.Width-1 || nextY < 1 || nextY >= recipe.Height-1 {
				continue
			}
			point := Point{X: nextX, Y: nextY}
			if visited[point] {
				continue
			}
			candidates = append(candidates, candidate{
				x: nextX, y: nextY, dx: step.X, dy: step.Y,
			})
		}

		if len(candidates) == 0 {
			stack = stack[:len(stack)-1]
			continue
		}

		next := candidates[rng.choice(len(candidates))]
		grid[current.Y+next.dy/2][current.X+next.dx/2] = '.'
		grid[next.y][next.x] = '.'
		point := Point{X: next.x, Y: next.y}
		visited[point] = true
		stack = append(stack, point)
		walkableCount += 2
	}

	return grid, walkableCount
}

func isOpen(grid [][]byte, x int, y int) bool {
	return grid[y][x] != '#'
}

func openExtra(
	grid [][]byte,
	walkableCount int,
	target int,
	rng *xorshift32,
) (int, error) {
	height := len(grid)
	width := len(grid[0])

	for walkableCount < target {
		type candidate struct {
			x        int
			y        int
			adjacent int
		}
		candidates := []candidate{}
		for y := 1; y < height-1; y++ {
			for x := 1; x < width-1; x++ {
				if grid[y][x] != '#' {
					continue
				}
				adjacent := 0
				for _, direction := range cardinal {
					if isOpen(grid, x+direction.X, y+direction.Y) {
						adjacent++
					}
				}
				if adjacent > 0 {
					candidates = append(candidates, candidate{
						x: x, y: y, adjacent: adjacent,
					})
				}
			}
		}
		if len(candidates) == 0 {
			return 0, fmt.Errorf("generator could not reach required walkable capacity")
		}

		loopCandidates := make([]candidate, 0)
		for _, candidate := range candidates {
			if candidate.adjacent >= 2 {
				loopCandidates = append(loopCandidates, candidate)
			}
		}
		pool := candidates
		if len(loopCandidates) > 0 {
			pool = loopCandidates
		}
		selected := pool[rng.choice(len(pool))]
		grid[selected.y][selected.x] = '.'
		walkableCount++
	}

	return walkableCount, nil
}

func distances(grid [][]byte, start Point) map[Point]int {
	height := len(grid)
	width := len(grid[0])
	queue := []Point{start}
	result := map[Point]int{start: 0}

	for len(queue) > 0 {
		point := queue[0]
		queue = queue[1:]
		for _, direction := range cardinal {
			next := Point{X: point.X + direction.X, Y: point.Y + direction.Y}
			if next.X < 0 || next.X >= width || next.Y < 0 || next.Y >= height {
				continue
			}
			if grid[next.Y][next.X] == '#' {
				continue
			}
			if _, exists := result[next]; exists {
				continue
			}
			result[next] = result[point] + 1
			queue = append(queue, next)
		}
	}
	return result
}

func revision(mapCode string, grid []string) string {
	payload := fmt.Sprintf(
		"v%d\x00%s\x00%s",
		GeneratorVersion,
		mapCode,
		strings.Join(grid, "\n"),
	)
	sum := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(sum[:])
}

func Generate(rawMapCode string) (Layout, error) {
	recipe, err := Parse(rawMapCode)
	if err != nil {
		return Layout{}, err
	}
	mapCode, err := Encode(recipe)
	if err != nil {
		return Layout{}, err
	}

	rng := newRNG(generatorSeed(mapCode))
	grid, walkableCount := carveMaze(recipe, rng)
	target, err := targetWalkable(recipe)
	if err != nil {
		return Layout{}, err
	}
	walkableCount, err = openExtra(grid, walkableCount, target, rng)
	if err != nil {
		return Layout{}, err
	}

	start := Point{X: 1, Y: 1}
	distanceByPoint := distances(grid, start)
	if len(distanceByPoint) != walkableCount {
		return Layout{}, fmt.Errorf("generated topology is not fully connected")
	}

	exit := start
	exitDistance := -1
	for point, distance := range distanceByPoint {
		if distance > exitDistance ||
			(distance == exitDistance &&
				(point.Y > exit.Y || (point.Y == exit.Y && point.X > exit.X))) {
			exit = point
			exitDistance = distance
		}
	}
	if exit == start || exitDistance < 4 {
		return Layout{}, fmt.Errorf("generated exit is too close to party start")
	}

	grid[start.Y][start.X] = 'P'
	grid[exit.Y][exit.X] = 'X'
	frozenGrid := make([]string, len(grid))
	for index, row := range grid {
		frozenGrid[index] = string(row)
	}

	var layout Layout
	layout.MapCode = mapCode
	layout.GeneratorVersion = GeneratorVersion
	layout.LayoutRevision = revision(mapCode, frozenGrid)
	layout.Grid = frozenGrid
	layout.PartyStart.X = start.X
	layout.PartyStart.Y = start.Y
	layout.PartyStart.Direction = 1
	layout.Exit.X = exit.X
	layout.Exit.Y = exit.Y
	layout.WalkableCount = walkableCount
	return layout, nil
}

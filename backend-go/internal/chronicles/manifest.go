// Package chronicles is the Chronicles Game Director of chronicles_api.py:
// repository-owned area manifests turned into seeded, validated and
// revisioned areas (content variation, seeded layout, topology quality,
// planner proposals, seeded exits and encounters, run routes and combat
// difficulty). Pinned by scripts/chronicles_area_parity_corpus.py.
package chronicles

import (
	"bytes"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"sort"
	"strings"
	"sync"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

const ManifestSchemaVersion = 1

//go:embed content/maps/*.json content/chronicles_entry_catalog.json
var content embed.FS

var (
	mapIDPattern  = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)
	contentGroups = []string{"triggers", "interactables", "treasures", "traps", "exits"}
)

// ErrMapNotFound is the routes' 404; ErrManifestInvalid their 500.
var (
	ErrMapNotFound     = errors.New("chronicles map not found")
	ErrManifestInvalid = errors.New("chronicles manifest failed validation")
)

// ManifestError is ChroniclesManifestError; GenerationError is
// ChroniclesMapGenerationError. Both reach the routes as unhandled errors.
type ManifestError struct{ msg string }

func (e *ManifestError) Error() string { return e.msg }

type GenerationError struct{ msg string }

func (e *GenerationError) Error() string { return e.msg }

func manifestErr(format string, args ...any) error {
	return &ManifestError{msg: fmt.Sprintf(format, args...)}
}

func get(d bson.D, key string) any {
	v, _ := pydoc.Get(d, key)
	return v
}

func has(d bson.D, key string) bool {
	_, ok := pydoc.Get(d, key)
	return ok
}

// deepCopy is copy.deepcopy for document values.
func deepCopy(v any) any {
	switch x := v.(type) {
	case bson.D:
		out := make(bson.D, len(x))
		for i, e := range x {
			out[i] = bson.E{Key: e.Key, Value: deepCopy(e.Value)}
		}
		return out
	case bson.A:
		out := make(bson.A, len(x))
		for i, item := range x {
			out[i] = deepCopy(item)
		}
		return out
	}
	return v
}

func copyDoc(d bson.D) bson.D { return deepCopy(d).(bson.D) }

func intValue(v any) (int64, bool) {
	switch x := v.(type) {
	case int32:
		return int64(x), true
	case int64:
		return x, true
	}
	return 0, false
}

func docs(v any) []bson.D {
	arr, _ := v.(bson.A)
	out := make([]bson.D, 0, len(arr))
	for _, item := range arr {
		if d, ok := item.(bson.D); ok {
			out = append(out, d)
		}
	}
	return out
}

func gridRows(manifest bson.D) []string {
	arr, _ := get(manifest, "grid").(bson.A)
	rows := make([]string, 0, len(arr))
	for _, r := range arr {
		s, _ := r.(string)
		rows = append(rows, s)
	}
	return rows
}

func walkable(grid []string, x, y any, label string) error {
	xi, okX := intValue(x)
	yi, okY := intValue(y)
	if !okX || !okY {
		return manifestErr("%s requires integer coordinates", label)
	}
	if yi < 0 || yi >= int64(len(grid)) || xi < 0 || xi >= int64(len([]rune(grid[0]))) {
		return manifestErr("%s is outside the grid", label)
	}
	if []rune(grid[yi])[xi] == '#' {
		return manifestErr("%s cannot occupy a wall", label)
	}
	return nil
}

// ValidateManifest mirrors _validate_manifest.
func ValidateManifest(payload any, mapID string) error {
	m, ok := payload.(bson.D)
	if !ok {
		return manifestErr("manifest must be an object")
	}
	if id, _ := get(m, "id").(string); id != mapID || !has(m, "id") {
		return manifestErr("manifest id does not match requested map")
	}
	if v, ok := intValue(get(m, "version")); !ok || v < 1 {
		return manifestErr("manifest version must be a positive integer")
	}
	if raw, present := pydoc.Get(m, "proceduralDifficulty"); present && raw != nil {
		if v, ok := intValue(raw); !ok || v < 1 || v > 5 {
			return manifestErr("proceduralDifficulty must be an integer between 1 and 5")
		}
	}
	rawGrid, ok := get(m, "grid").(bson.A)
	if !ok || len(rawGrid) == 0 {
		return manifestErr("manifest grid must be a non-empty string array")
	}
	grid := make([]string, 0, len(rawGrid))
	for _, r := range rawGrid {
		s, isString := r.(string)
		if !isString || s == "" {
			return manifestErr("manifest grid must be a non-empty string array")
		}
		grid = append(grid, s)
	}
	width := len([]rune(grid[0]))
	for _, row := range grid {
		if len([]rune(row)) != width {
			return manifestErr("manifest grid must be rectangular")
		}
	}
	start, ok := get(m, "partyStart").(bson.D)
	if !ok {
		return manifestErr("manifest partyStart must be an object")
	}
	if err := walkable(grid, get(start, "x"), get(start, "y"), "partyStart"); err != nil {
		return err
	}
	if d, ok := intValue(get(start, "direction")); !ok || d < 0 || d > 3 {
		return manifestErr("partyStart direction must be 0..3")
	}
	if raw, present := pydoc.Get(m, "initialFlags"); present {
		if _, ok := raw.(bson.D); !ok {
			return manifestErr("initialFlags must be an object")
		}
	}
	enemyIDs, hpKeys := map[string]bool{}, map[string]bool{}
	enemies := bson.A{}
	if raw, present := pydoc.Get(m, "enemies"); present {
		arr, ok := raw.(bson.A)
		if !ok {
			return manifestErr("enemies must be an array")
		}
		enemies = arr
	}
	for _, raw := range enemies {
		enemy, ok := raw.(bson.D)
		if !ok {
			return manifestErr("enemy entries must be objects")
		}
		id, isString := get(enemy, "id").(string)
		if !isString || id == "" || enemyIDs[id] {
			return manifestErr("enemy ids must be non-empty and unique")
		}
		hpKey, isString := get(enemy, "hpKey").(string)
		if !isString || hpKey == "" || hpKeys[hpKey] {
			return manifestErr("enemy hpKey values must be non-empty and unique")
		}
		enemyIDs[id], hpKeys[hpKey] = true, true
		if err := walkable(grid, get(enemy, "x"), get(enemy, "y"), "enemy "+id); err != nil {
			return err
		}
	}
	contentIDs := map[string]bool{}
	for _, group := range contentGroups {
		entries := bson.A{}
		if raw, present := pydoc.Get(m, group); present {
			arr, ok := raw.(bson.A)
			if !ok {
				return manifestErr("%s must be an array", group)
			}
			entries = arr
		}
		for _, raw := range entries {
			entry, ok := raw.(bson.D)
			if !ok {
				return manifestErr("%s entries must be objects", group)
			}
			id, isString := get(entry, "id").(string)
			if !isString || id == "" || contentIDs[id] {
				return manifestErr("content ids must be non-empty and unique")
			}
			contentIDs[id] = true
			hasX, hasY := has(entry, "x"), has(entry, "y")
			if hasX != hasY {
				return manifestErr("%s %s requires both x and y", group, id)
			}
			if hasX {
				if err := walkable(grid, get(entry, "x"), get(entry, "y"), group+" "+id); err != nil {
					return err
				}
			} else if tile, isString := get(entry, "tile").(string); !isString || len([]rune(tile)) != 1 {
				return manifestErr("%s %s requires coordinates or one tile marker", group, id)
			}
			if _, ok := get(entry, "action").(bson.D); !ok {
				return manifestErr("%s %s requires an action", group, id)
			}
		}
	}
	return nil
}

// canonicalRevision is sha256(_canonical_bytes(manifest)).
func canonicalRevision(v any) (string, error) {
	raw, err := pydoc.EncodeSorted(v, false)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:]), nil
}

type loadedManifest struct {
	manifest bson.D
	revision string
	err      error
}

var (
	manifestMu    sync.Mutex
	manifestCache = map[string]loadedManifest{}
)

// LoadManifest mirrors load_chronicles_manifest: a fresh copy each call.
func LoadManifest(mapID string) (bson.D, string, error) {
	if !mapIDPattern.MatchString(mapID) {
		return nil, "", ErrMapNotFound
	}
	manifestMu.Lock()
	hit, ok := manifestCache[mapID]
	if !ok {
		hit = loadManifest(mapID)
		manifestCache[mapID] = hit
	}
	manifestMu.Unlock()
	if hit.err != nil {
		return nil, "", hit.err
	}
	return copyDoc(hit.manifest), hit.revision, nil
}

func loadManifest(mapID string) loadedManifest {
	raw, err := content.ReadFile("content/maps/" + mapID + ".json")
	if err != nil {
		return loadedManifest{err: ErrMapNotFound}
	}
	decoded, err := pydoc.Decode(raw)
	if err != nil || ValidateManifest(decoded, mapID) != nil {
		return loadedManifest{err: ErrManifestInvalid}
	}
	revision, err := canonicalRevision(decoded)
	if err != nil {
		return loadedManifest{err: ErrManifestInvalid}
	}
	return loadedManifest{manifest: decoded.(bson.D), revision: revision}
}

var (
	shippedOnce sync.Once
	shippedIDs  []string
)

// ShippedMapIDs is chronicles_shipped_map_ids.
func ShippedMapIDs() []string {
	shippedOnce.Do(func() {
		entries, _ := fs.ReadDir(content, "content/maps")
		for _, e := range entries {
			if name := e.Name(); strings.HasSuffix(name, ".json") && !e.IsDir() {
				shippedIDs = append(shippedIDs, strings.TrimSuffix(name, ".json"))
			}
		}
		sort.Strings(shippedIDs)
	})
	return append([]string(nil), shippedIDs...)
}

func isShipped(mapID string) bool {
	for _, id := range ShippedMapIDs() {
		if id == mapID {
			return true
		}
	}
	return false
}

// Python's sorted() over bytes digests.
func lessBytes(a, b []byte) bool { return bytes.Compare(a, b) < 0 }

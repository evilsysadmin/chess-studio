// Package pawnslug serves Pawn Slug's versioned stage content, mirroring
// pawn_slug_api.py: repository-owned manifests (embedded here; a test keeps
// them byte-identical to backend-python/pawn_slug_manifests), validated,
// revisioned by the SHA-256 of their canonical JSON and wrapped in a
// deterministic per-seed envelope. The browser stays authoritative for the
// frame loop; this is content only.
package pawnslug

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sync"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

const (
	SchemaVersion = 1
	MaxSeed       = 2_147_483_647
)

//go:embed manifests/*.json
var manifests embed.FS

var stageIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// ErrNotFound is the route's 404; ErrInvalid its 500.
var (
	ErrNotFound = errors.New("pawn slug stage not found")
	ErrInvalid  = errors.New("pawn slug manifest failed validation")
)

type loaded struct {
	manifest bson.D
	revision string
	err      error
}

var (
	cacheMu sync.Mutex
	cache   = map[string]loaded{}
)

func number(v any, label string, positive, nonNegative bool) (float64, error) {
	var n float64
	switch x := v.(type) {
	case int32:
		n = float64(x)
	case int64:
		n = float64(x)
	case float64:
		n = x
	default:
		return 0, fmt.Errorf("%s must be finite", label)
	}
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return 0, fmt.Errorf("%s must be finite", label)
	}
	if positive && n <= 0 {
		return 0, fmt.Errorf("%s must be positive", label)
	}
	if nonNegative && n < 0 {
		return 0, fmt.Errorf("%s must be non-negative", label)
	}
	return n, nil
}

func get(d bson.D, key string) any {
	v, _ := pydoc.Get(d, key)
	return v
}

// Validate mirrors _validate_manifest.
func Validate(payload any, stageID string) error {
	m, ok := payload.(bson.D)
	if !ok {
		return errors.New("manifest must be an object")
	}
	if id, _ := get(m, "id").(string); id != stageID {
		return errors.New("manifest id does not match requested stage")
	}
	switch v := get(m, "version").(type) {
	case int32:
		if v < 1 {
			return errors.New("manifest version must be a positive integer")
		}
	case int64:
		if v < 1 {
			return errors.New("manifest version must be a positive integer")
		}
	default:
		return errors.New("manifest version must be a positive integer")
	}
	world, ok := get(m, "world").(bson.D)
	if !ok {
		return errors.New("world must be an object")
	}
	width, err := number(get(world, "width"), "world.width", true, false)
	if err != nil {
		return err
	}
	if _, err := number(get(world, "groundY"), "world.groundY", false, false); err != nil {
		return err
	}
	boss, err := number(get(world, "bossX"), "world.bossX", false, false)
	if err != nil {
		return err
	}
	extraction, err := number(get(world, "extractionX"), "world.extractionX", false, false)
	if err != nil {
		return err
	}
	if boss <= 0 || boss >= extraction {
		return errors.New("bossX must be inside the stage before extraction")
	}
	if extraction > width {
		return errors.New("extractionX must be inside the stage")
	}
	profiles, ok := get(m, "enemyProfiles").(bson.D)
	if !ok || len(profiles) == 0 {
		return errors.New("enemyProfiles must be a non-empty object")
	}
	for _, e := range profiles {
		profile, ok := e.Value.(bson.D)
		if e.Key == "" || !ok {
			return errors.New("enemy profiles require non-empty type keys and object values")
		}
		for _, f := range []struct {
			key                   string
			positive, nonNegative bool
		}{{"hp", true, false}, {"speed", false, true}, {"score", false, true}, {"xp", false, true}, {"width", true, false}, {"height", true, false}} {
			if _, err := number(get(profile, f.key), e.Key+"."+f.key, f.positive, f.nonNegative); err != nil {
				return err
			}
		}
		if raw, present := pydoc.Get(profile, "midBoss"); present {
			if _, isBool := raw.(bool); !isBool {
				return fmt.Errorf("%s.midBoss must be boolean", e.Key)
			}
		}
	}
	spawns, ok := get(m, "spawns").(bson.A)
	if !ok {
		return errors.New("spawns must be an array")
	}
	seen := map[string]bool{}
	for _, raw := range spawns {
		spawn, ok := raw.(bson.D)
		if !ok {
			return errors.New("spawn entries must be objects")
		}
		id, _ := get(spawn, "id").(string)
		if id == "" || seen[id] {
			return errors.New("spawn ids must be non-empty and unique")
		}
		enemy, isString := get(spawn, "type").(string)
		if _, known := pydoc.Get(profiles, enemy); !isString || !known {
			return fmt.Errorf("spawn %s references an unknown enemy type", id)
		}
		if _, err := number(get(spawn, "x"), "spawn "+id+".x", false, false); err != nil {
			return err
		}
		if y, present := pydoc.Get(spawn, "y"); present {
			if _, err := number(y, "spawn "+id+".y", false, false); err != nil {
				return err
			}
		}
		seen[id] = true
	}
	return nil
}

// Load mirrors load_pawn_slug_manifest: the validated manifest and its
// revision (SHA-256 of the canonical JSON).
func Load(stageID string) (bson.D, string, error) {
	if !stageIDPattern.MatchString(stageID) {
		return nil, "", ErrNotFound
	}
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if hit, ok := cache[stageID]; ok {
		return hit.manifest, hit.revision, hit.err
	}
	raw, err := manifests.ReadFile("manifests/" + stageID + ".json")
	if err != nil {
		return nil, "", ErrNotFound
	}
	result := loaded{err: ErrInvalid}
	if decoded, err := pydoc.Decode(raw); err == nil && Validate(decoded, stageID) == nil {
		if canonical, err := pydoc.EncodeSorted(decoded, false); err == nil {
			sum := sha256.Sum256(canonical)
			result = loaded{manifest: decoded.(bson.D), revision: hex.EncodeToString(sum[:])}
		}
	}
	cache[stageID] = result
	return result.manifest, result.revision, result.err
}

// Envelope mirrors pawn_slug_stage_envelope.
func Envelope(stageID string, seed int64) (bson.D, error) {
	manifest, revision, err := Load(stageID)
	if err != nil {
		return nil, err
	}
	version := get(manifest, "version")
	material := fmt.Sprintf("pawn-slug-stage-v%d:%s:%v:%d:%s", SchemaVersion, get(manifest, "id"), version, seed, revision)
	sum := sha256.Sum256([]byte(material))
	return bson.D{
		{Key: "schemaVersion", Value: int64(SchemaVersion)},
		{Key: "stageId", Value: get(manifest, "id")},
		{Key: "contentVersion", Value: version},
		{Key: "seed", Value: seed},
		{Key: "instanceId", Value: hex.EncodeToString(sum[:])[:24]},
		{Key: "manifestRevision", Value: revision},
		{Key: "manifest", Value: manifest},
	}, nil
}

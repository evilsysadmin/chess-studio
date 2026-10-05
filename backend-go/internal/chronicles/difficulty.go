package chronicles

import (
	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	DifficultyVersion = 1
	PartyLevelCap     = 12
	enemyLevelCap     = 20
	depthPressureCap  = 6
	abovePartyCap     = 1
	minAppliedDelta   = -2
	maxAppliedDelta   = 3
)

// boundedInt is _bounded_int.
func boundedInt(value any, lo, hi, fallback int64) int64 {
	if _, isBool := value.(bool); isBool {
		return fallback
	}
	n, err := pyval.Int(value)
	if err != nil {
		return fallback
	}
	return max(lo, min(hi, n))
}

// authoredDifficulty is chronicles_authored_difficulty.
func authoredDifficulty(manifest bson.D) (int64, error) {
	if explicit := get(manifest, "proceduralDifficulty"); explicit != nil {
		return boundedInt(explicit, 1, 5, 1), nil
	}
	enemies := docs(get(manifest, "enemies"))
	raw, _ := get(manifest, "enemies").(bson.A)
	if len(raw) == 0 {
		return 1, nil
	}
	total := int64(0)
	for _, enemy := range enemies {
		hp, err := maxHp(enemy)
		if err != nil {
			return 0, err
		}
		total += max(1, hp)
	}
	average := float64(total) / float64(len(raw))
	switch {
	case average <= 5:
		return 1, nil
	case average <= 7:
		return 2, nil
	case average <= 9:
		return 3, nil
	case average <= 11:
		return 4, nil
	}
	return 5, nil
}

// maxHp is int(enemy.get("maxHp", 1)).
func maxHp(enemy bson.D) (int64, error) {
	v, present := lookup(enemy, "maxHp")
	if !present {
		return 1, nil
	}
	return pyval.Int(v)
}

func lookup(d bson.D, key string) (any, bool) {
	for _, e := range d {
		if e.Key == key {
			return e.Value, true
		}
	}
	return nil, false
}

func damageDelta(applied int64) int64 {
	if applied < 0 {
		abs := -applied
		return -min(1, (abs+1)/2)
	}
	return min(1, applied/2)
}

// difficultyBand is chronicles_difficulty_band.
func difficultyBand(partyLevel, depth int64) bson.D {
	party := boundedInt(partyLevel, 1, PartyLevelCap, 1)
	d := boundedInt(depth, 0, 99, 0)
	depthPressure := min(depthPressureCap, d/2)
	progression := (party - 1) / 2
	target := min(PartyLevelCap, party+abovePartyCap, 1+depthPressure+progression)
	return bson.D{
		{Key: "partyLevel", Value: party},
		{Key: "depth", Value: d},
		{Key: "targetLevel", Value: target},
		{Key: "minLevel", Value: max(1, target-1)},
		{Key: "maxLevel", Value: min(PartyLevelCap, party+abovePartyCap, target+1)},
		{Key: "depthPressure", Value: depthPressure},
		{Key: "progressionPressure", Value: progression},
	}
}

// applyDifficulty mirrors apply_chronicles_combat_difficulty.
func applyDifficulty(manifest bson.D, partyLevel, depth int64) (bson.D, bson.D, error) {
	scaled := copyDoc(manifest)
	band := difficultyBand(partyLevel, depth)
	authored, err := authoredDifficulty(manifest)
	if err != nil {
		return nil, nil, err
	}
	target, _ := get(band, "targetLevel").(int64)
	requested := target - authored
	applied := max(minAppliedDelta, min(maxAppliedDelta, requested))
	dmg := damageDelta(applied)
	enemies, _ := get(scaled, "enemies").(bson.A)
	for i, raw := range enemies {
		enemy, ok := raw.(bson.D)
		if !ok {
			continue
		}
		hp, err := maxHp(enemy)
		if err != nil {
			return nil, nil, err
		}
		retaliation := int64(0)
		if v, present := lookup(enemy, "retaliation"); present {
			if retaliation, err = pyval.Int(v); err != nil {
				return nil, nil, err
			}
		}
		hp, retaliation = max(1, hp), max(0, retaliation)
		enemy = setKey(enemy, "maxHp", max(1, hp+applied))
		enemy = setKey(enemy, "retaliation", max(0, retaliation+dmg))
		current := authored
		build, isBuild := get(enemy, "enemyBuild").(bson.D)
		if isBuild {
			current = boundedInt(get(build, "level"), 1, enemyLevelCap, authored)
		}
		level := boundedInt(current+applied, 1, enemyLevelCap, authored)
		enemy = setKey(enemy, "difficultyLevel", level)
		if isBuild {
			enemy = setKey(enemy, "enemyBuild", setKey(copyDoc(build), "level", level))
		}
		enemies[i] = enemy
	}
	difficulty := append(bson.D{{Key: "version", Value: int64(DifficultyVersion)}}, band...)
	difficulty = append(difficulty,
		bson.E{Key: "authoredLevel", Value: authored},
		bson.E{Key: "requestedDelta", Value: requested},
		bson.E{Key: "appliedDelta", Value: applied},
	)
	generation, ok := get(scaled, "generation").(bson.D)
	if !ok {
		generation = bson.D{}
	}
	scaled = setKey(scaled, "generation", setKey(generation, "combatDifficulty", copyDoc(difficulty)))
	return scaled, difficulty, nil
}

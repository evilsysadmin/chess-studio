package chronicles

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	CompositionVersion       = 1
	TreasureVariationVersion = 1
	ModuleVariationVersion   = 1
)

var moduleGroups = []string{"enemies", "triggers", "interactables", "treasures", "traps", "exits"}

var safeOptionalDefeatEffects = map[string]bool{"grant-item": true, "heal-party": true, "refill-class-abilities": true}

// asciiJSON is json.dumps(value, sort_keys=True, separators=(",", ":"))
// with Python's default ensure_ascii=True, for the small plan payloads.
func asciiJSON(v any) string {
	var b strings.Builder
	var write func(v any)
	writeString := func(s string) {
		b.WriteByte('"')
		for _, r := range s {
			switch {
			case r == '"':
				b.WriteString(`\"`)
			case r == '\\':
				b.WriteString(`\\`)
			case r == '\n':
				b.WriteString(`\n`)
			case r == '\r':
				b.WriteString(`\r`)
			case r == '\t':
				b.WriteString(`\t`)
			case r == '\b':
				b.WriteString(`\b`)
			case r == '\f':
				b.WriteString(`\f`)
			case r < 0x20 || (r > 0x7e && r <= 0xffff):
				fmt.Fprintf(&b, `\u%04x`, r)
			case r > 0xffff:
				hi, lo := utf16.EncodeRune(r)
				fmt.Fprintf(&b, `\u%04x\u%04x`, hi, lo)
			default:
				b.WriteRune(r)
			}
		}
		b.WriteByte('"')
	}
	write = func(v any) {
		switch x := v.(type) {
		case nil:
			b.WriteString("null")
		case bool:
			b.WriteString(strconv.FormatBool(x))
		case int64:
			b.WriteString(strconv.FormatInt(x, 10))
		case int:
			b.WriteString(strconv.Itoa(x))
		case string:
			writeString(x)
		case []string:
			b.WriteByte('[')
			for i, s := range x {
				if i > 0 {
					b.WriteByte(',')
				}
				writeString(s)
			}
			b.WriteByte(']')
		case bson.D:
			sorted := append(bson.D(nil), x...)
			sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Key < sorted[j].Key })
			b.WriteByte('{')
			for i, e := range sorted {
				if i > 0 {
					b.WriteByte(',')
				}
				writeString(e.Key)
				b.WriteByte(':')
				write(e.Value)
			}
			b.WriteByte('}')
		case bson.A:
			b.WriteByte('[')
			for i, item := range x {
				if i > 0 {
					b.WriteByte(',')
				}
				write(item)
			}
			b.WriteByte(']')
		}
	}
	write(v)
	return b.String()
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func strOr(v any) string { return pyval.Str(pyval.Or(v, "")) }

// containsString is _contains_string (exact string equality anywhere).
func containsString(v any, needle string) bool {
	switch x := v.(type) {
	case string:
		return x == needle
	case bson.D:
		for _, e := range x {
			if containsString(e.Value, needle) {
				return true
			}
		}
	case bson.A:
		for _, item := range x {
			if containsString(item, needle) {
				return true
			}
		}
	}
	return false
}

func hpReferencedElsewhere(manifest, enemy bson.D) bool {
	hpKey := strOr(get(enemy, "hpKey"))
	if hpKey == "" {
		return true
	}
	enemyID := get(enemy, "id")
	for _, e := range manifest {
		value := e.Value
		if arr, ok := value.(bson.A); ok && e.Key == "enemies" {
			filtered := bson.A{}
			for _, entry := range arr {
				if d, isDoc := entry.(bson.D); isDoc && pyEqual(get(d, "id"), enemyID) {
					continue
				}
				filtered = append(filtered, entry)
			}
			value = filtered
		}
		if containsString(value, hpKey) {
			return true
		}
	}
	return false
}

func pyEqual(a, b any) bool {
	sa, okA := a.(string)
	sb, okB := b.(string)
	if okA && okB {
		return sa == sb
	}
	return a == nil && b == nil
}

func defeatIsSafe(enemy bson.D) bool {
	onDefeat, _ := get(enemy, "onDefeat").(bson.D)
	effects, _ := get(onDefeat, "effects").(bson.A)
	for _, raw := range effects {
		effect, ok := raw.(bson.D)
		if !ok {
			return false
		}
		t, _ := get(effect, "type").(string)
		if !safeOptionalDefeatEffects[t] {
			return false
		}
	}
	return true
}

// optionalEnemyIsVariable is chronicles_optional_enemy_is_variable.
func optionalEnemyIsVariable(manifest, enemy bson.D) bool {
	return get(enemy, "optional") == true && !hpReferencedElsewhere(manifest, enemy) && defeatIsSafe(enemy)
}

func strList(items []string) bson.A {
	out := bson.A{}
	for _, s := range items {
		out = append(out, s)
	}
	return out
}

type compositionPlan struct {
	active, omitted, protected []string
	revision                   string
}

func compositionFor(manifest bson.D, seed int64) compositionPlan {
	mapID := strOr(get(manifest, "id"))
	var active, omitted, protected []string
	for _, enemy := range docs(get(manifest, "enemies")) {
		if get(enemy, "optional") != true {
			continue
		}
		id := strOr(get(enemy, "id"))
		if !optionalEnemyIsVariable(manifest, enemy) {
			protected = append(protected, id)
			continue
		}
		if digest(fmt.Sprintf("chronicles-composition-v%d:%s:%d:%s", CompositionVersion, mapID, seed, id))[0] < 160 {
			active = append(active, id)
		} else {
			omitted = append(omitted, id)
		}
	}
	sort.Strings(active)
	sort.Strings(omitted)
	sort.Strings(protected)
	payload := bson.D{
		{Key: "version", Value: int64(CompositionVersion)}, {Key: "mapId", Value: mapID}, {Key: "seed", Value: seed},
		{Key: "active", Value: strList(active)}, {Key: "omitted", Value: strList(omitted)}, {Key: "protected", Value: strList(protected)},
	}
	return compositionPlan{active: active, omitted: omitted, protected: protected, revision: sha256Hex(asciiJSON(payload))}
}

func applyComposition(manifest bson.D, seed int64) (bson.D, compositionPlan) {
	plan := compositionFor(manifest, seed)
	omitted := map[string]bool{}
	for _, id := range plan.omitted {
		omitted[id] = true
	}
	composed := copyDoc(manifest)
	kept := bson.A{}
	enemies, _ := get(composed, "enemies").(bson.A)
	for _, raw := range enemies {
		if enemy, ok := raw.(bson.D); ok {
			if id, isString := get(enemy, "id").(string); isString && omitted[id] {
				continue
			}
		}
		kept = append(kept, raw)
	}
	return setKey(composed, "enemies", kept), plan
}

type treasureBoon struct{ treasureID, effectType string }

type treasurePlan struct {
	boons    []treasureBoon
	revision string
}

func boonDocs(boons []treasureBoon) bson.A {
	out := bson.A{}
	for _, b := range boons {
		out = append(out, bson.D{{Key: "treasureId", Value: b.treasureID}, {Key: "effectType", Value: b.effectType}})
	}
	return out
}

func treasureFor(manifest bson.D, seed int64) treasurePlan {
	mapID := strOr(get(manifest, "id"))
	var candidates []treasureBoon
	for _, treasure := range docs(get(manifest, "treasures")) {
		id := strOr(get(treasure, "id"))
		action, isDoc := get(treasure, "action").(bson.D)
		if id == "" || !isDoc {
			continue
		}
		existing := map[string]bool{}
		for _, effect := range docs(get(action, "effects")) {
			if t, ok := get(effect, "type").(string); ok {
				existing[t] = true
			}
		}
		if !existing["heal-party"] {
			candidates = append(candidates, treasureBoon{id, "heal-party"})
		}
		if !existing["refill-class-abilities"] {
			candidates = append(candidates, treasureBoon{id, "refill-class-abilities"})
		}
	}
	d := digest(fmt.Sprintf("chronicles-treasure-v%d:%s:%d", TreasureVariationVersion, mapID, seed))
	var selected []treasureBoon
	if len(candidates) > 0 && d[0] >= 96 {
		selected = []treasureBoon{candidates[binary.BigEndian.Uint32(d[1:5])%uint32(len(candidates))]}
	}
	payload := bson.D{{Key: "version", Value: int64(TreasureVariationVersion)}, {Key: "mapId", Value: mapID}, {Key: "seed", Value: seed}, {Key: "boons", Value: boonDocs(selected)}}
	return treasurePlan{boons: selected, revision: sha256Hex(asciiJSON(payload))}
}

func applyTreasure(manifest bson.D, seed int64) (bson.D, treasurePlan) {
	plan := treasureFor(manifest, seed)
	varied := copyDoc(manifest)
	treasures, _ := get(varied, "treasures").(bson.A)
	for _, boon := range plan.boons {
		for i, raw := range treasures {
			treasure, ok := raw.(bson.D)
			if !ok {
				continue
			}
			if id, _ := get(treasure, "id").(string); id != boon.treasureID {
				continue
			}
			action, isDoc := get(treasure, "action").(bson.D)
			if !isDoc {
				break
			}
			effects := bson.A{}
			if existing, ok := get(action, "effects").(bson.A); ok {
				effects = append(effects, existing...)
			}
			if boon.effectType == "heal-party" {
				effects = append(effects, bson.D{{Key: "type", Value: "heal-party"}, {Key: "amount", Value: int64(1)}})
			} else {
				effects = append(effects, bson.D{{Key: "type", Value: "refill-class-abilities"}})
			}
			treasures[i] = setKey(treasure, "action", setKey(action, "effects", effects))
			break
		}
	}
	return varied, plan
}

type modulePlan struct {
	active, omitted []string
	revision        string
}

func moduleFor(manifest bson.D, seed int64) modulePlan {
	mapID := strOr(get(manifest, "id"))
	ids := map[string]bool{}
	for _, group := range moduleGroups {
		for _, entry := range docs(get(manifest, group)) {
			if raw := get(entry, "proceduralModule"); pyval.Truthy(raw) {
				ids[pyval.Str(raw)] = true
			}
		}
	}
	var sorted []string
	for id := range ids {
		if id != "" {
			sorted = append(sorted, id)
		}
	}
	sort.Strings(sorted)
	var active, omitted []string
	for _, id := range sorted {
		if digest(fmt.Sprintf("chronicles-module-v%d:%s:%d:%s", ModuleVariationVersion, mapID, seed, id))[0] < 160 {
			active = append(active, id)
		} else {
			omitted = append(omitted, id)
		}
	}
	payload := bson.D{{Key: "version", Value: int64(ModuleVariationVersion)}, {Key: "mapId", Value: mapID}, {Key: "seed", Value: seed}, {Key: "active", Value: strList(active)}, {Key: "omitted", Value: strList(omitted)}}
	return modulePlan{active: active, omitted: omitted, revision: sha256Hex(asciiJSON(payload))}
}

func applyModules(manifest bson.D, seed int64) (bson.D, modulePlan) {
	plan := moduleFor(manifest, seed)
	varied := copyDoc(manifest)
	if len(plan.omitted) == 0 {
		return varied, plan
	}
	omitted := map[string]bool{}
	for _, id := range plan.omitted {
		omitted[id] = true
	}
	for _, group := range moduleGroups {
		entries, ok := get(varied, group).(bson.A)
		if !ok {
			continue
		}
		kept := bson.A{}
		for _, raw := range entries {
			if entry, isDoc := raw.(bson.D); isDoc {
				if m, isString := get(entry, "proceduralModule").(string); isString && omitted[m] {
					continue
				}
			}
			kept = append(kept, raw)
		}
		varied = setKey(varied, group, kept)
	}
	return varied, plan
}

// setKey is dict assignment (position kept, appended when new).
func setKey(doc bson.D, key string, value any) bson.D {
	for i := range doc {
		if doc[i].Key == key {
			doc[i].Value = value
			return doc
		}
	}
	return append(doc, bson.E{Key: key, Value: value})
}

func pyRound(x float64, digits int) float64 {
	v, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'f', digits, 64), 64)
	return v
}

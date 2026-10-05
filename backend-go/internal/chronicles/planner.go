package chronicles

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/chroniclesmap"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

// chronicles_map_planner.py: an external planner may only nudge verbs and
// difficulty; the local generator stays authoritative.
const (
	PlannerContractVersion = 1
	PlannerSnapshotVersion = 1
	plannerSourceMaxLength = 64
)

var (
	plannerFields   = map[string]bool{"version": true, "source": true, "verbs": true, "difficulty": true}
	plannerSourceRE = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,63}$`)
)

func strictInt(v any) (int64, bool) {
	// bson decoding keeps bools apart, so this is isinstance(int) and not bool.
	return intValue(v)
}

// NormalizePlannerProposal is normalize_chronicles_planner_proposal.
func NormalizePlannerProposal(raw any) (bson.D, error) {
	proposal, ok := raw.(bson.D)
	if !ok {
		return nil, errors.New("planner proposal must be an object")
	}
	var unknown []string
	for _, e := range proposal {
		if !plannerFields[e.Key] {
			unknown = append(unknown, e.Key)
		}
	}
	if len(unknown) > 0 {
		sort.Strings(unknown)
		return nil, fmt.Errorf("unsupported planner field: %s", unknown[0])
	}
	version, ok := strictInt(get(proposal, "version"))
	if !ok {
		return nil, errors.New("planner version must be an integer")
	}
	if version != PlannerContractVersion {
		return nil, fmt.Errorf("unsupported planner version: %d", version)
	}
	rawSource, ok := get(proposal, "source").(string)
	if !ok {
		return nil, errors.New("planner source must be a string")
	}
	source := strings.ToLower(pyval.Strip(rawSource))
	if source == "" || utf8.RuneCountInString(source) > plannerSourceMaxLength {
		return nil, errors.New("planner source length is invalid")
	}
	if !plannerSourceRE.MatchString(source) {
		return nil, errors.New("planner source contains unsupported characters")
	}
	normalized := bson.D{{Key: "version", Value: version}, {Key: "source", Value: source}}
	if raw, present := proposalField(proposal, "verbs"); present {
		verbs, isList := raw.(bson.A)
		if !isList || len(verbs) == 0 {
			return nil, errors.New("planner verbs must be a non-empty list")
		}
		if len(verbs) > 4 {
			return nil, errors.New("planner verbs must contain 1..4 strings")
		}
		out := bson.A{}
		for _, v := range verbs {
			s, isString := v.(string)
			if !isString {
				return nil, errors.New("planner verbs must contain 1..4 strings")
			}
			out = append(out, strings.ToLower(pyval.Strip(s)))
		}
		normalized = append(normalized, bson.E{Key: "verbs", Value: out})
	}
	if raw, present := proposalField(proposal, "difficulty"); present {
		difficulty, ok := strictInt(raw)
		if !ok {
			return nil, errors.New("planner difficulty must be an integer")
		}
		normalized = append(normalized, bson.E{Key: "difficulty", Value: difficulty})
	}
	if len(normalized) == 2 {
		return nil, errors.New("planner proposal must change topology intent")
	}
	return normalized, nil
}

func proposalField(d bson.D, key string) (any, bool) { return lookup(d, key) }

func proposalRevision(normalized bson.D) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("chronicles-planner-v%d\x00", PlannerContractVersion) + asciiJSON(normalized)))
	return hex.EncodeToString(sum[:])
}

// plannerDecision is ChroniclesPlannerDecision.
type plannerDecision struct {
	recipe           chroniclesmap.Recipe
	accepted         bool
	source, revision any // str | None
	reason           string
}

// resolvePlannerRecipe is resolve_chronicles_planner_recipe.
func resolvePlannerRecipe(base chroniclesmap.Recipe, proposal any) (plannerDecision, error) {
	base, err := chroniclesmap.Validate(base)
	if err != nil {
		return plannerDecision{}, err
	}
	if proposal == nil {
		return plannerDecision{recipe: base, reason: "no-proposal"}, nil
	}
	normalized, err := NormalizePlannerProposal(proposal)
	var candidate chroniclesmap.Recipe
	if err == nil {
		candidate = base
		if verbs, present := lookup(normalized, "verbs"); present {
			candidate.Verbs = nil
			for _, v := range verbs.(bson.A) {
				candidate.Verbs = append(candidate.Verbs, v.(string))
			}
		}
		if difficulty, present := lookup(normalized, "difficulty"); present {
			candidate.Difficulty = int(difficulty.(int64))
		}
		candidate, err = chroniclesmap.Validate(candidate)
	}
	if err != nil {
		return plannerDecision{recipe: base, reason: "invalid-proposal"}, nil
	}
	source := get(normalized, "source")
	revision := proposalRevision(normalized)
	if candidate.Equal(base) {
		return plannerDecision{recipe: base, source: source, revision: revision, reason: "no-change"}, nil
	}
	return plannerDecision{recipe: candidate, accepted: true, source: source, revision: revision, reason: "accepted"}, nil
}

// normalizePlannerSnapshot is _normalize_planner_snapshot: the per-area
// normalized proposals, or nil without a snapshot.
func normalizePlannerSnapshot(raw any) (map[string]bson.D, error) {
	if raw == nil {
		return nil, nil
	}
	snapshot, ok := raw.(bson.D)
	if !ok {
		return nil, manifestErr("planner snapshot must be an object")
	}
	keys := map[string]bool{}
	for _, e := range snapshot {
		keys[e.Key] = true
	}
	if len(keys) != 2 || !keys["version"] || !keys["areas"] {
		return nil, manifestErr("planner snapshot fields are invalid")
	}
	if version, ok := strictInt(get(snapshot, "version")); !ok || version != PlannerSnapshotVersion {
		return nil, manifestErr("planner snapshot version is invalid")
	}
	areas, ok := get(snapshot, "areas").(bson.D)
	if !ok || len(areas) == 0 {
		return nil, manifestErr("planner snapshot requires at least one area")
	}
	if len(areas) > len(ShippedMapIDs()) {
		return nil, manifestErr("planner snapshot contains too many areas")
	}
	sorted := append(bson.D(nil), areas...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Key < sorted[j].Key })
	out := map[string]bson.D{}
	for _, e := range sorted {
		if !mapIDPattern.MatchString(e.Key) || !isShipped(e.Key) {
			return nil, manifestErr("planner snapshot references an unknown map")
		}
		normalized, err := NormalizePlannerProposal(e.Value)
		if err != nil {
			return nil, manifestErr("planner snapshot proposal is invalid for %s", e.Key)
		}
		out[e.Key] = normalized
	}
	return out, nil
}

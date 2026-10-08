// Package chroniclesrun mirrors backend-python/chronicles_run_store.py: the
// authoritative identity and world binding of Chronicles runs (collection
// "chronicles_runs"). Mongo is the production store; Memory mirrors the
// Python in-memory mode and backs the parity tests.
package chroniclesrun

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const CollectionName = "chronicles_runs"

// Errors carry the Python ValueError strings / PersistentStorageUnavailable.
var (
	ErrIdempotencyConflict = errors.New("idempotency-conflict")
	ErrWorldVersion        = errors.New("world-version-conflict")
	ErrTerminal            = errors.New("run-terminal")
	ErrUnavailable         = errors.New("chronicles run storage unavailable")
)

// Store is the run store the routes use.
type Store interface {
	// Replay is replay_run_creation: nil when there is nothing to replay.
	Replay(ctx context.Context, runID, owner, fingerprint string) (bson.D, error)
	// Create is create_or_replay_run.
	Create(ctx context.Context, run NewRun) (bson.D, error)
	// Checkpoint is checkpoint_run: nil when the run is not the owner's.
	Checkpoint(ctx context.Context, c Checkpoint) (bson.D, error)
	// Get is get_run.
	Get(ctx context.Context, runID, owner string) (bson.D, error)
}

// NewRun are create_or_replay_run's arguments.
type NewRun struct {
	RunID, Owner, MapID, ManifestRevision, Fingerprint string
	Seed, ContentVersion                               int64
	Route                                              *Route
	PlannerSnapshot                                    any
	PartyLevel, DungeonLevel, PlacementVersion         *int64
	Now                                                time.Time
}

// Route is a normalized route snapshot.
type Route struct {
	PolicyVersion  int64
	MapIDs         []string
	PrimaryExitIDs bson.D
}

// Checkpoint are checkpoint_run's arguments (already normalized).
type Checkpoint struct {
	RunID, Owner, MapID, ManifestRevision string
	ExpectedWorldVersion, ContentVersion  int64
	WorldFlags, Inventory, Quests         bson.D
	ConsumedContentIDs, ClaimedRewards    []string
	TerminalStatus                        *string
	Now                                   time.Time
}

func get(d bson.D, key string) any {
	v, _ := pydoc.Get(d, key)
	return v
}

func has(d bson.D, key string) bool {
	_, ok := pydoc.Get(d, key)
	return ok
}

func strings(items []string) bson.A {
	out := bson.A{}
	for _, s := range items {
		out = append(out, s)
	}
	return out
}

// document is create_or_replay_run's insert document.
func document(run NewRun) bson.D {
	now := bson.NewDateTimeFromTime(run.Now)
	doc := bson.D{{Key: "_id", Value: run.RunID}, {Key: "owner", Value: run.Owner}, {Key: "seed", Value: pydoc.Int(run.Seed)}}
	if run.PartyLevel != nil {
		doc = append(doc, bson.E{Key: "partyLevel", Value: pydoc.Int(*run.PartyLevel)})
	}
	if run.DungeonLevel != nil {
		doc = append(doc, bson.E{Key: "dungeonLevel", Value: pydoc.Int(*run.DungeonLevel)})
	}
	if run.PlacementVersion != nil {
		doc = append(doc, bson.E{Key: "contentPlacementVersion", Value: pydoc.Int(*run.PlacementVersion)})
	}
	doc = append(doc,
		bson.E{Key: "currentMapId", Value: run.MapID},
		bson.E{Key: "contentVersion", Value: pydoc.Int(run.ContentVersion)},
		bson.E{Key: "manifestRevision", Value: run.ManifestRevision},
		bson.E{Key: "status", Value: "active"},
		bson.E{Key: "worldVersion", Value: pydoc.Int(0)},
		bson.E{Key: "consumedContentIds", Value: bson.A{}},
		bson.E{Key: "claimedRewards", Value: bson.A{}},
		bson.E{Key: "worldFlags", Value: bson.D{}},
		bson.E{Key: "inventory", Value: bson.D{}},
		bson.E{Key: "quests", Value: bson.D{}},
		bson.E{Key: "createdAt", Value: now},
		bson.E{Key: "updatedAt", Value: now},
		bson.E{Key: "createFingerprint", Value: run.Fingerprint},
	)
	if run.Route != nil {
		doc = append(doc,
			bson.E{Key: "routePolicyVersion", Value: pydoc.Int(run.Route.PolicyVersion)},
			bson.E{Key: "routeMapIds", Value: strings(run.Route.MapIDs)},
			bson.E{Key: "routePrimaryExitIds", Value: copyDoc(run.Route.PrimaryExitIDs)},
		)
	}
	if run.PlannerSnapshot != nil {
		doc = append(doc, bson.E{Key: "plannerSnapshot", Value: deepCopy(run.PlannerSnapshot)})
	}
	return doc
}

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

func copyDoc(d bson.D) bson.D {
	if d == nil {
		return bson.D{}
	}
	return deepCopy(d).(bson.D)
}

func orDoc(v any) bson.D {
	if d, ok := v.(bson.D); ok && pyval.Truthy(d) {
		return copyDoc(d)
	}
	return bson.D{}
}

func orList(v any) bson.A {
	if a, ok := v.(bson.A); ok {
		return deepCopy(a).(bson.A)
	}
	return bson.A{}
}

func intOf(v any) any {
	n, err := pyval.Int(v)
	if err != nil {
		return v
	}
	return n
}

func intOr(row bson.D, key string, fallback int64) any {
	if v, ok := pydoc.Get(row, key); ok {
		return intOf(v)
	}
	return fallback
}

// Public is _public.
func Public(row bson.D) bson.D {
	if len(row) == 0 {
		return nil
	}
	runID := get(row, "_id")
	if !pyval.Truthy(runID) {
		runID = get(row, "runId")
	}
	out := bson.D{{Key: "runId", Value: pyval.Str(runID)}, {Key: "seed", Value: intOf(get(row, "seed"))}}
	if v := get(row, "partyLevel"); v != nil {
		out = append(out, bson.E{Key: "partyLevel", Value: intOf(v)})
	}
	if v := get(row, "dungeonLevel"); v != nil {
		out = append(out, bson.E{Key: "dungeonLevel", Value: intOf(v)})
	}
	if v := get(row, "contentPlacementVersion"); v != nil {
		out = append(out, bson.E{Key: "contentPlacementVersion", Value: intOf(v)})
	}
	status := any("active")
	if v, ok := pydoc.Get(row, "status"); ok {
		status = v
	}
	out = append(out,
		bson.E{Key: "currentMapId", Value: get(row, "currentMapId")},
		bson.E{Key: "contentVersion", Value: intOf(get(row, "contentVersion"))},
		bson.E{Key: "manifestRevision", Value: get(row, "manifestRevision")},
		bson.E{Key: "status", Value: status},
		bson.E{Key: "worldVersion", Value: intOr(row, "worldVersion", 0)},
		bson.E{Key: "consumedContentIds", Value: orList(get(row, "consumedContentIds"))},
		bson.E{Key: "claimedRewards", Value: orList(get(row, "claimedRewards"))},
		bson.E{Key: "worldFlags", Value: orDoc(get(row, "worldFlags"))},
		bson.E{Key: "inventory", Value: orDoc(get(row, "inventory"))},
		bson.E{Key: "quests", Value: orDoc(get(row, "quests"))},
		bson.E{Key: "createdAt", Value: get(row, "createdAt")},
		bson.E{Key: "updatedAt", Value: get(row, "updatedAt")},
	)
	if mapIDs := orList(get(row, "routeMapIds")); len(mapIDs) > 0 {
		out = append(out, bson.E{Key: "route", Value: bson.D{
			{Key: "policyVersion", Value: intOr(row, "routePolicyVersion", 0)},
			{Key: "mapIds", Value: mapIDs},
			{Key: "primaryExitIds", Value: orDoc(get(row, "routePrimaryExitIds"))},
		}})
	}
	if v := get(row, "plannerSnapshot"); v != nil {
		out = append(out, bson.E{Key: "plannerSnapshot", Value: deepCopy(v)})
	}
	return out
}

func stringSet(v any) map[string]int {
	set := map[string]int{}
	list, _ := v.(bson.A)
	for _, item := range list {
		if s, ok := item.(string); ok {
			set[s]++
		} else {
			set["\x00"+pyval.Repr(item)]++
		}
	}
	return set
}

func sameSet(stored any, given []string) bool {
	a := stringSet(stored)
	b := stringSet(strings(given))
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if _, ok := b[k]; !ok {
			return false
		}
	}
	return true
}

func intEq(v any, want int64) bool {
	n, err := pyval.Int(v)
	return err == nil && n == want
}

// terminalReplayMatches is _terminal_checkpoint_replay_matches.
func terminalReplayMatches(row bson.D, c Checkpoint) bool {
	if c.TerminalStatus == nil || get(row, "status") != *c.TerminalStatus {
		return false
	}
	if !intEq(intOr(row, "worldVersion", 0), c.ExpectedWorldVersion+1) {
		return false
	}
	return get(row, "currentMapId") == c.MapID &&
		intEq(intOr(row, "contentVersion", 0), c.ContentVersion) &&
		get(row, "manifestRevision") == c.ManifestRevision &&
		pydoc.Equal(orDoc(get(row, "worldFlags")), c.WorldFlags) &&
		pydoc.Equal(orDoc(get(row, "inventory")), c.Inventory) &&
		pydoc.Equal(orDoc(get(row, "quests")), c.Quests) &&
		sameSet(get(row, "consumedContentIds"), c.ConsumedContentIDs) &&
		sameSet(get(row, "claimedRewards"), c.ClaimedRewards)
}

func statusOf(row bson.D) any {
	if v, ok := pydoc.Get(row, "status"); ok {
		return v
	}
	return "active"
}

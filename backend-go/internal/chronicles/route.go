package chronicles

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"sync"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
)

// RoutePolicy is the validated chronicles_entry_catalog.json.
type RoutePolicy struct {
	Version        int64
	MapIDs         []string
	MinRouteLength int64
	MaxRouteLength int64
	FinalMapID     string
	PrimaryExitIDs map[string]string
}

var (
	policyOnce sync.Once
	policy     RoutePolicy
	policyErr  error
)

// primaryExitRoutable reports whether exitID has exactly one transition.
func primaryExitRoutable(mapID, exitID string) (bool, error) {
	manifest, _, err := LoadManifest(mapID)
	if err != nil {
		return false, err
	}
	var exit bson.D
	for _, e := range docs(get(manifest, "exits")) {
		if id, _ := get(e, "id").(string); id == exitID {
			exit = e
			break
		}
	}
	action, _ := get(exit, "action").(bson.D)
	transitions := 0
	for _, effect := range docs(get(action, "effects")) {
		if get(effect, "type") == "transition-map" {
			transitions++
		}
	}
	return transitions == 1, nil
}

// Policy mirrors chronicles_route_policy.
func Policy() (RoutePolicy, error) {
	policyOnce.Do(func() { policy, policyErr = loadPolicy() })
	return policy, policyErr
}

func loadPolicy() (RoutePolicy, error) {
	fail := func(msg string) (RoutePolicy, error) { return RoutePolicy{}, fmt.Errorf("%s", msg) }
	raw, err := content.ReadFile("content/chronicles_entry_catalog.json")
	if err != nil {
		return fail("El catálogo de entrada de Chronicles no se puede leer.")
	}
	decoded, err := pydoc.Decode(raw)
	if err != nil {
		return fail("El catálogo de entrada de Chronicles no se puede leer.")
	}
	doc, _ := decoded.(bson.D)
	version, ok := intValue(get(doc, "version"))
	if !ok || version < 1 {
		return fail("El catálogo de entrada de Chronicles tiene una versión inválida.")
	}
	rawIDs, ok := get(doc, "mapIds").(bson.A)
	if !ok || len(rawIDs) < 2 {
		return fail("El catálogo de entrada de Chronicles necesita al menos dos mapas.")
	}
	seen := map[string]bool{}
	var mapIDs []string
	for _, r := range rawIDs {
		s, isString := r.(string)
		if !isString || !mapIDPattern.MatchString(s) {
			return fail("El catálogo de entrada de Chronicles contiene IDs inválidos.")
		}
		if seen[s] {
			return fail("El catálogo de entrada de Chronicles contiene mapas duplicados.")
		}
		seen[s] = true
		mapIDs = append(mapIDs, s)
	}
	minLen, okMin := intValue(get(doc, "minRouteLength"))
	maxLen, okMax := intValue(get(doc, "maxRouteLength"))
	if !okMin || !okMax || minLen < 2 || minLen > maxLen || maxLen > int64(len(mapIDs))+1 {
		return fail("El rango de longitud de ruta de Chronicles es inválido.")
	}
	final, isString := get(doc, "finalMapId").(string)
	if !isString || !mapIDPattern.MatchString(final) {
		return fail("El mapa final de Chronicles es inválido.")
	}
	if seen[final] {
		return fail("El mapa final de Chronicles no puede duplicar el pool previo.")
	}
	exits, ok := get(doc, "primaryExitIds").(bson.D)
	if !ok || len(exits) != len(mapIDs) {
		return fail("Chronicles necesita una salida principal para cada mapa de ruta.")
	}
	primary := map[string]any{}
	for _, e := range exits {
		if !seen[e.Key] {
			return fail("Chronicles necesita una salida principal para cada mapa de ruta.")
		}
		primary[e.Key] = e.Value
	}
	for _, id := range append(append([]string(nil), mapIDs...), final) {
		if !isShipped(id) {
			return fail("El catálogo de entrada de Chronicles referencia mapas ausentes.")
		}
	}
	exitIDs := map[string]string{}
	for _, id := range mapIDs {
		exitID, isString := primary[id].(string)
		if !isString || exitID == "" {
			return fail("Chronicles contiene una salida principal inválida.")
		}
		routable, err := primaryExitRoutable(id, exitID)
		if err != nil {
			return RoutePolicy{}, err
		}
		if !routable {
			return fail("La salida principal de Chronicles no tiene una transición única.")
		}
		exitIDs[id] = exitID
	}
	return RoutePolicy{Version: version, MapIDs: mapIDs, MinRouteLength: minLen, MaxRouteLength: maxLen, FinalMapID: final, PrimaryExitIDs: exitIDs}, nil
}

func digest(material string) []byte {
	sum := sha256.Sum256([]byte(material))
	return sum[:]
}

// EntryMapForSeed mirrors chronicles_entry_map_for_seed.
func EntryMapForSeed(seed int64) (string, error) {
	p, err := Policy()
	if err != nil {
		return "", err
	}
	d := digest(fmt.Sprintf("chronicles-entry-v%d:%d", p.Version, seed))
	return p.MapIDs[binary.BigEndian.Uint32(d[:4])%uint32(len(p.MapIDs))], nil
}

// RoutePlanForSeed preserves the legacy level-1 entry point.
func RoutePlanForSeed(seed int64) ([]string, error) {
	return RoutePlanForLevel(seed, 1)
}

// RoutePlanForLevel mirrors chronicles_route_plan_for_seed(seed, dungeon_level).
func RoutePlanForLevel(seed, dungeonLevel int64) ([]string, error) {
	p, err := Policy()
	if err != nil {
		return nil, err
	}
	ranked := append([]string(nil), p.MapIDs...)
	keys := map[string][]byte{}
	for _, id := range ranked {
		keys[id] = digest(fmt.Sprintf("chronicles-route-v%d:%d:%s", p.Version, seed, id))
	}
	sort.SliceStable(ranked, func(i, j int) bool { return lessBytes(keys[ranked[i]], keys[ranked[j]]) })
	if dungeonLevel < 1 {
		dungeonLevel = 1
	}
	length := p.MinRouteLength + dungeonLevel - 1
	if length > p.MaxRouteLength {
		length = p.MaxRouteLength
	}
	return append(ranked[:length-1:length-1], p.FinalMapID), nil
}

// RouteSnapshot is a run's normalized route.
type RouteSnapshot struct {
	PolicyVersion  int64
	MapIDs         []string
	PrimaryExitIDs map[string]string
}

// Doc is the snapshot as stored and answered.
func (r *RouteSnapshot) Doc() bson.D {
	ids := bson.A{}
	for _, id := range r.MapIDs {
		ids = append(ids, id)
	}
	exits := bson.D{}
	for _, id := range r.MapIDs[:len(r.MapIDs)-1] {
		exits = append(exits, bson.E{Key: id, Value: r.PrimaryExitIDs[id]})
	}
	return bson.D{{Key: "policyVersion", Value: r.PolicyVersion}, {Key: "mapIds", Value: ids}, {Key: "primaryExitIds", Value: exits}}
}

// RouteSnapshotForSeed mirrors chronicles_route_snapshot_for_seed.
func RouteSnapshotForSeed(seed int64) (*RouteSnapshot, error) {
	return RouteSnapshotForLevel(seed, 1)
}

func RouteSnapshotForLevel(seed, dungeonLevel int64) (*RouteSnapshot, error) {
	p, err := Policy()
	if err != nil {
		return nil, err
	}
	plan, err := RoutePlanForLevel(seed, dungeonLevel)
	if err != nil {
		return nil, err
	}
	exits := map[string]string{}
	for _, id := range plan[:len(plan)-1] {
		exits[id] = p.PrimaryExitIDs[id]
	}
	return &RouteSnapshot{PolicyVersion: p.Version, MapIDs: plan, PrimaryExitIDs: exits}, nil
}

// NormalizeRouteSnapshot mirrors _normalize_route_snapshot over a stored
// document (nil stays nil).
func NormalizeRouteSnapshot(raw any) (*RouteSnapshot, error) {
	if raw == nil {
		return nil, nil
	}
	doc, ok := raw.(bson.D)
	if !ok {
		return nil, manifestErr("route snapshot must be an object")
	}
	version, ok := intValue(get(doc, "policyVersion"))
	if !ok || version < 1 {
		return nil, manifestErr("route snapshot has invalid policy version")
	}
	rawIDs, ok := get(doc, "mapIds").(bson.A)
	if !ok || len(rawIDs) < 2 {
		return nil, manifestErr("route snapshot requires at least two maps")
	}
	seen := map[string]bool{}
	var ids []string
	for _, r := range rawIDs {
		s, isString := r.(string)
		if !isString || !mapIDPattern.MatchString(s) || seen[s] {
			return nil, manifestErr("route snapshot contains invalid map ids")
		}
		seen[s] = true
		ids = append(ids, s)
	}
	for _, id := range ids {
		if !isShipped(id) {
			return nil, manifestErr("route snapshot references missing maps")
		}
	}
	rawExits, ok := get(doc, "primaryExitIds").(bson.D)
	expected := map[string]bool{}
	for _, id := range ids[:len(ids)-1] {
		expected[id] = true
	}
	if !ok || len(rawExits) != len(expected) {
		return nil, manifestErr("route snapshot has invalid primary exits")
	}
	exits := map[string]string{}
	for _, e := range rawExits {
		if !expected[e.Key] {
			return nil, manifestErr("route snapshot has invalid primary exits")
		}
	}
	for _, id := range ids[:len(ids)-1] {
		exitID, isString := get(rawExits, id).(string)
		if !isString || exitID == "" {
			return nil, manifestErr("route snapshot has invalid primary exit")
		}
		routable, err := primaryExitRoutable(id, exitID)
		if err != nil {
			return nil, err
		}
		if !routable {
			return nil, manifestErr("route snapshot primary exit is not routable")
		}
		exits[id] = exitID
	}
	return &RouteSnapshot{PolicyVersion: version, MapIDs: ids, PrimaryExitIDs: exits}, nil
}

// Revision is _route_revision.
func (r *RouteSnapshot) Revision(seed int64) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("chronicles-route-v%d:%d:%s", r.PolicyVersion, seed, strings.Join(r.MapIDs, "|"))))
	return hex.EncodeToString(sum[:])
}

func (r *RouteSnapshot) index(mapID string) int {
	for i, id := range r.MapIDs {
		if id == mapID {
			return i
		}
	}
	return -1
}

// applyRoutePlan mirrors _apply_route_plan (mutates manifest's exit effect).
func applyRoutePlan(manifest bson.D, seed int64, route *RouteSnapshot) (bson.D, error) {
	if route == nil {
		return manifest, nil
	}
	id, _ := get(manifest, "id").(string)
	at := route.index(id)
	if at < 0 {
		return manifest, nil
	}
	var next any
	if at+1 < len(route.MapIDs) {
		nextID := route.MapIDs[at+1]
		next = nextID
		exitID, ok := route.PrimaryExitIDs[id]
		if !ok {
			return nil, manifestErr("route map has no configured primary exit")
		}
		var exit bson.D
		for _, e := range docs(get(manifest, "exits")) {
			if eid, _ := get(e, "id").(string); eid == exitID {
				exit = e
				break
			}
		}
		if exit == nil {
			return nil, manifestErr("route primary exit is missing")
		}
		action, _ := get(exit, "action").(bson.D)
		effects, _ := get(action, "effects").(bson.A)
		var transitions []int
		for i, raw := range effects {
			if effect, ok := raw.(bson.D); ok && get(effect, "type") == "transition-map" {
				transitions = append(transitions, i)
			}
		}
		if len(transitions) != 1 {
			return nil, manifestErr("route primary exit requires one transition")
		}
		// effects is shared with the manifest: replace the element in place.
		effects[transitions[0]] = bson.D{{Key: "type", Value: "transition-map"}, {Key: "mapId", Value: nextID}}
	}
	generation, ok := get(manifest, "generation").(bson.D)
	if !ok {
		generation = bson.D{}
	}
	generation = pydoc.Set(generation, "route", bson.D{
		{Key: "policyVersion", Value: route.PolicyVersion},
		{Key: "revision", Value: route.Revision(seed)},
		{Key: "index", Value: int64(at)},
		{Key: "length", Value: int64(len(route.MapIDs))},
		{Key: "nextMapId", Value: next},
	})
	return pydoc.Set(manifest, "generation", generation), nil
}

func (r *RouteSnapshot) depth(mapID string) int64 {
	if r == nil {
		return 0
	}
	if at := r.index(mapID); at >= 0 {
		return int64(at)
	}
	return 0
}

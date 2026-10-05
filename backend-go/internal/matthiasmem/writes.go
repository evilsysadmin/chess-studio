package matthiasmem

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	maxRecentAdvice          = 12
	maxRecentConsultationIDs = maxRecentAdvice
	maxResponseSignatures    = 12
	maxOpeningSnapshot       = 12
)

type incidentMeta struct {
	label, polarity string
	severity        int64
}

var episodeIncidents = map[string]incidentMeta{
	"human:MISSED_MATE":            {"Mate disponible ignorado", "shame", 92},
	"human:ALLOWED_MATE":           {"Mate permitido", "shame", 94},
	"human:QUEEN_EN_PRISE_TO_PAWN": {"Dama expuesta a un peón", "shame", 90},
	"human:STALEMATE_BLUNDER":      {"Ventaja convertida en ahogado", "shame", 88},
	"cpu:PAWN_TAKES_QUEEN":         {"Un peón de Matthias capturó la dama", "shame", 91},
	"cpu:KNIGHT_FORK":              {"Horquilla de caballo sufrida", "shame", 72},
	"cpu:PAWN_FORK":                {"Horquilla de peón sufrida", "shame", 74},
	"human:MATE_FOUND":             {"Mate encontrado", "fame", 86},
	"human:PAWN_TAKES_QUEEN":       {"Un peón humano capturó la dama", "fame", 82},
	"human:QUEEN_CAPTURE":          {"Captura decisiva de dama", "fame", 76},
}

// episodeIncidentCounts is matthias_episodes._incident_counts.
func episodeIncidentCounts(facts bson.D, c *collector) bson.D {
	rows, _ := list(get(facts, "noteworthy_incidents"))
	out := bson.D{}
	for _, raw := range rows {
		item, ok := dict(raw)
		if !ok {
			continue
		}
		key := text(get(item, "key"), 80)
		n, isNum := pyval.Number(get(item, "count"))
		if key == "" || !isNum || !(n.Float64() >= 0) {
			continue
		}
		count := c.numInt(n)
		previous, _ := get(out, key).(int64)
		out = pydoc.Set(out, key, max(previous, count))
	}
	return out
}

func openingSnapshotRows(facts bson.D, c *collector) bson.A {
	rows, _ := list(get(facts, "openings"))
	byName := bson.D{}
	for _, raw := range rows {
		item, ok := dict(raw)
		if !ok {
			continue
		}
		name := text(get(item, "name"), 100)
		if name == "" {
			continue
		}
		byName = pydoc.Set(byName, name, bson.D{
			{Key: "name", Value: name},
			{Key: "games", Value: c.nonNeg(get(item, "games"))},
			{Key: "wins", Value: c.nonNeg(get(item, "wins"))},
			{Key: "draws", Value: c.nonNeg(get(item, "draws"))},
			{Key: "losses", Value: c.nonNeg(get(item, "losses"))},
		})
	}
	values := make([]bson.D, 0, len(byName))
	for _, e := range byName {
		values = append(values, e.Value.(bson.D))
	}
	sort.SliceStable(values, func(i, j int) bool {
		gi, _ := get(values[i], "games").(int64)
		gj, _ := get(values[j], "games").(int64)
		if gi != gj {
			return gi > gj
		}
		return get(values[i], "name").(string) < get(values[j], "name").(string)
	})
	out := bson.A{}
	for i, v := range values {
		if i == maxOpeningSnapshot {
			break
		}
		out = append(out, v)
	}
	return out
}

// EpisodicSnapshot is episodic_observation_snapshot.
func episodicSnapshot(facts bson.D, c *collector) bson.D {
	return bson.D{
		{Key: "noteworthy_incidents", Value: episodeIncidentCounts(facts, c)},
		{Key: "cpu_rivalry", Value: episodeRivalry(get(facts, "cpu_rivalry"), c)},
		{Key: "openings", Value: openingSnapshotRows(facts, c)},
	}
}

func newEpisode(fingerprint, kind, label, polarity string, severity int64, evidence bson.D, at string) bson.D {
	if polarity != "fame" && polarity != "shame" && polarity != "neutral" {
		polarity = "neutral"
	}
	return bson.D{
		{Key: "schema_version", Value: int64(episodeSchemaVersion)},
		{Key: "fingerprint", Value: text(fingerprint, 160)},
		{Key: "kind", Value: text(kind, 40)},
		{Key: "label", Value: text(label, 180)},
		{Key: "polarity", Value: polarity},
		{Key: "severity", Value: max(0, min(100, severity))},
		{Key: "evidence", Value: evidence},
		{Key: "at", Value: at},
	}
}

func incidentEpisodes(previous, current bson.D, at string, c *collector) bson.A {
	before := dictOrEmpty(get(previous, "noteworthy_incidents"))
	after := dictOrEmpty(get(current, "noteworthy_incidents"))
	keys := make([]string, 0, len(after))
	for _, e := range after {
		keys = append(keys, e.Key)
	}
	sort.Strings(keys)
	out := bson.A{}
	for _, key := range keys {
		previousCount := c.nonNeg(get(before, key))
		currentCount := c.nonNeg(get(after, key))
		if currentCount <= previousCount {
			continue
		}
		meta, ok := episodeIncidents[key]
		if !ok {
			continue
		}
		out = append(out, newEpisode(fmt.Sprintf("incident:%s:%d", key, currentCount), "incident", meta.label, meta.polarity, meta.severity, bson.D{
			{Key: "source", Value: "noteworthy_incidents"},
			{Key: "key", Value: key},
			{Key: "previous_count", Value: previousCount},
			{Key: "count", Value: currentCount},
			{Key: "delta", Value: currentCount - previousCount},
		}, at))
	}
	return out
}

func rivalryEpisode(previous, current bson.D, at string, c *collector) bson.D {
	before := episodeRivalry(get(previous, "cpu_rivalry"), c)
	after := episodeRivalry(get(current, "cpu_rivalry"), c)
	n := func(d bson.D, k string) int64 { v, _ := get(d, k).(int64); return v }
	if n(after, "games")-n(before, "games") != 1 {
		return nil
	}
	var outcomes []string
	for _, key := range []string{"wins", "draws", "losses"} {
		delta := n(after, key) - n(before, key)
		if delta != 0 && delta != 1 {
			return nil
		}
		if delta == 1 {
			outcomes = append(outcomes, key)
		}
	}
	if len(outcomes) != 1 {
		return nil
	}
	outcome := map[string]string{"wins": "win", "draws": "draw", "losses": "loss"}[outcomes[0]]
	label := map[string]string{"win": "Victoria contra Matthias", "draw": "Tablas contra Matthias", "loss": "Derrota contra Matthias"}[outcome]
	polarity, severity := "neutral", int64(45)
	switch outcome {
	case "win":
		polarity, severity = "fame", 70
	case "loss":
		polarity, severity = "shame", 62
	}
	return newEpisode(fmt.Sprintf("rivalry:%d:%s", n(after, "games"), outcome), "rivalry_result", label, polarity, severity, bson.D{
		{Key: "source", Value: "cpu_rivalry"},
		{Key: "outcome", Value: outcome},
		{Key: "game_number", Value: n(after, "games")},
		{Key: "record", Value: after},
	}, at)
}

// iterate is Python's `for row in value` over a stored field.
func iterate(value any) ([]any, error) {
	switch v := value.(type) {
	case bson.A:
		return v, nil
	case []any:
		return v, nil
	case string:
		out := []any{}
		for _, r := range v {
			out = append(out, string(r))
		}
		return out, nil
	case bson.D:
		out := []any{}
		for _, e := range v {
			out = append(out, e.Key)
		}
		return out, nil
	}
	return nil, pyval.ErrType
}

func openingSetbacks(previous, current bson.D, at string, c *collector) bson.A {
	raw, present := pydoc.Get(previous, "openings")
	if !present {
		raw = bson.A{}
	}
	rows, err := iterate(raw)
	if err != nil {
		if c.err == nil {
			c.err = err
		}
		return nil
	}
	before := map[string]bson.D{}
	for _, item := range rows {
		row, ok := dict(item)
		if !ok || !pyval.Truthy(get(row, "name")) {
			continue
		}
		before[pyval.Str(get(row, "name"))] = row
	}
	out := bson.A{}
	afterRows, _ := list(get(current, "openings"))
	for _, item := range afterRows {
		after, ok := dict(item)
		if !ok || !pyval.Truthy(get(after, "name")) {
			continue
		}
		name := pyval.Str(get(after, "name"))
		prev, ok := before[name]
		if !ok {
			prev = bson.D{{Key: "games", Value: int64(0)}, {Key: "wins", Value: int64(0)}, {Key: "draws", Value: int64(0)}, {Key: "losses", Value: int64(0)}}
		}
		gameDelta := c.intOr(get(after, "games")) - c.intOr(get(prev, "games"))
		lossDelta := c.intOr(get(after, "losses")) - c.intOr(get(prev, "losses"))
		winDelta := c.intOr(get(after, "wins")) - c.intOr(get(prev, "wins"))
		drawDelta := c.intOr(get(after, "draws")) - c.intOr(get(prev, "draws"))
		if gameDelta != 1 || lossDelta != 1 || winDelta != 0 || drawDelta != 0 {
			continue
		}
		games := c.intOr(get(after, "games"))
		losses := c.intOr(get(after, "losses"))
		wins := c.intOr(get(after, "wins"))
		if games < 3 || losses < 2 || losses <= wins {
			continue
		}
		out = append(out, newEpisode(fmt.Sprintf("opening-setback:%s:%d:%d", name, games, losses), "opening_setback", "Nueva derrota con "+name, "shame", min(78, 48+losses*6), bson.D{
			{Key: "source", Value: "openings"},
			{Key: "opening", Value: name},
			{Key: "outcome", Value: "loss"},
			{Key: "games", Value: games},
			{Key: "wins", Value: wins},
			{Key: "draws", Value: c.intOr(get(after, "draws"))},
			{Key: "losses", Value: losses},
		}, at))
	}
	return out
}

func episodesToA(eps []*episode) bson.A {
	out := bson.A{}
	for _, ep := range eps {
		out = append(out, ep.doc)
	}
	return out
}

// ObserveEpisodes mirrors matthias_episode_store.observe: the update it
// sends and the result it returns.
func ObserveEpisodes(row, facts bson.D, now time.Time) (update, result bson.D, err error) {
	c := &collector{}
	existing := mergeEpisodes(get(row, "episodes"), now, c)
	var merged []*episode
	var snapshot bson.D
	created := bson.A{}
	if previous, ok := dict(get(row, "episodic_snapshot")); ok {
		current := episodicSnapshot(facts, c)
		at := episodeISO(nil, now)
		created = append(created, incidentEpisodes(previous, current, at, c)...)
		if rivalryEp := rivalryEpisode(previous, current, at, c); rivalryEp != nil {
			created = append(created, rivalryEp)
		}
		created = append(created, openingSetbacks(previous, current, at, c)...)
		merged = mergeEpisodes(append(episodesToA(existing), created...), now, c)
		snapshot = current
	} else {
		merged = existing
		snapshot = episodicSnapshot(facts, c)
	}
	callbacks := eligibleCallbacks(merged, now, c)
	if c.err != nil {
		return nil, nil, c.err
	}
	nowISO := pyval.ISOFormatUTC(now)
	update = bson.D{
		{Key: "$set", Value: bson.D{{Key: "episodic_snapshot", Value: snapshot}, {Key: "episodes", Value: episodesToA(merged)}}},
		{Key: "$setOnInsert", Value: bson.D{{Key: "created_at", Value: nowISO}, {Key: "consultation_count", Value: int64(0)}}},
	}
	result = bson.D{{Key: "created", Value: created}, {Key: "callbacks", Value: callbacks}, {Key: "episodeCount", Value: int64(len(merged))}}
	return update, result, nil
}

// EpisodicContext mirrors matthias_episode_store.context.
func EpisodicContext(row bson.D, now time.Time) (bson.D, error) {
	c := &collector{}
	merged := mergeEpisodes(get(row, "episodes"), now, c)
	callbacks := eligibleCallbacks(merged, now, c)
	if c.err != nil {
		return nil, c.err
	}
	return bson.D{{Key: "episode_count", Value: int64(len(merged))}, {Key: "callback_candidates", Value: callbacks}}, nil
}

func cleanCounts(v any) bson.D {
	src := dictOrEmpty(v)
	out := bson.D{}
	for i, e := range src {
		if i == 32 {
			break
		}
		if n, ok := pyval.Number(e.Value); ok {
			count, err := n.Int()
			if err != nil {
				continue
			}
			out = pydoc.Set(out, pyval.Prefix(e.Key, 48), max(0, count))
		}
	}
	return out
}

// Context mirrors matthias_memory_store._context_from_row.
func Context(row, facts bson.D, now time.Time) (bson.D, error) {
	c := &collector{}
	current := Snapshot(facts)
	recent, _ := list(get(row, "recent_advice"))
	prior := bson.A{}
	for _, raw := range tail(recent, 3) {
		item, ok := dict(raw)
		if !ok {
			continue
		}
		adviceText := text(get(item, "text"), advicePrefixLimit)
		if adviceText == "" {
			continue
		}
		prior = append(prior, bson.D{
			{Key: "question_kind", Value: text(get(item, "question_kind"), 32)},
			{Key: "text", Value: adviceText},
			{Key: "at", Value: text(get(item, "at"), 48)},
		})
	}
	var remembered any
	if fen := text(get(facts, "fen"), 128); fen != "" {
		positions := emblematic(get(row, "emblematic_positions"), c)
		for i := len(positions) - 1; i >= 0; i-- {
			p := positions[i].(bson.D)
			if get(p, "fen") == fen {
				remembered = p
				break
			}
		}
	}
	schema := int64(1)
	if raw := get(row, "schema_version"); pyval.Truthy(raw) {
		schema = c.intOr(raw)
	}
	ms := milestones(get(row, "milestones"))
	goalDocs := bson.A{}
	gs := goals(get(row, "active_goals"), c)
	for _, g := range gs {
		goalDocs = append(goalDocs, g.doc)
	}
	var obsession any
	if len(gs) > 0 {
		g := gs[0].doc
		obsession = bson.D{{Key: "id", Value: get(g, "id")}, {Key: "topic", Value: get(g, "topic")}, {Key: "label", Value: get(g, "label")}}
	}
	ch := cleanChallenge(get(row, "active_challenge"), c)
	openingDocs := bson.A{}
	for _, op := range openings(get(row, "opening_memory"), c) {
		openingDocs = append(openingDocs, op.doc)
	}
	rc := cleanReturnContext(get(row, "return_context"), now, c)
	positions := emblematic(get(row, "emblematic_positions"), c)
	f := adviceFollowup(row, current, c)
	debt := cleanOpenDebt(row, current, c)
	avoid := bson.A{}
	for _, raw := range tail(recent, 5) {
		item, ok := dict(raw)
		if !ok {
			continue
		}
		if phrase := text(get(item, "text"), 90); phrase != "" {
			avoid = append(avoid, phrase)
		}
	}
	out := bson.D{
		{Key: "schema_version", Value: schema},
		{Key: "consultation_count", Value: max(0, c.intOr(get(row, "consultation_count")))},
		{Key: "question_counts", Value: cleanCounts(get(row, "question_counts"))},
		{Key: "prior_advice", Value: prior},
		{Key: "progress_since_last", Value: progress(get(row, "facts_snapshot"), current)},
		{Key: "grounded_topic", Value: GroundedTopic(pyval.Str(pyval.Or(get(facts, "question_kind"), "")), facts)},
		{Key: "relationship", Value: relationship(get(row, "relationship"), c)},
		{Key: "respect", Value: respect(get(row, "respect"), c)},
		{Key: "mood", Value: textOr(get(row, "mood"), 24, defaultMood)},
		{Key: "active_goals", Value: goalDocs},
		{Key: "current_obsession", Value: obsession},
		{Key: "active_challenge", Value: optionalDoc(ch != nil, func() bson.D { return ch.doc })},
		{Key: "opening_memory", Value: openingDocs},
		{Key: "rivalry", Value: rivalry(get(row, "rivalry"), c)},
		{Key: "return_context", Value: optionalDoc(rc != nil, func() bson.D { return rc.doc })},
		{Key: "hall_of_fame", Value: milestoneDocs(ms, "fame", 3)},
		{Key: "hall_of_shame", Value: milestoneDocs(ms, "shame", 3)},
		{Key: "recent_milestones", Value: milestoneDocs(ms, "", 5)},
		{Key: "emblematic_positions", Value: tail(positions, 3)},
		{Key: "remembered_position", Value: remembered},
		{Key: "advice_followup", Value: optionalDoc(f != nil, func() bson.D { return f.doc })},
		{Key: "open_debt", Value: optionalDoc(debt != nil, func() bson.D { return debt.doc })},
		{Key: "avoid_phrases", Value: avoid},
	}
	if c.err != nil {
		return nil, c.err
	}
	return out, nil
}

// FallbackContext is the audience's context when the memory cannot be read.
func FallbackContext() bson.D {
	return bson.D{
		{Key: "consultation_count", Value: int64(0)},
		{Key: "question_counts", Value: bson.D{}},
		{Key: "prior_advice", Value: bson.A{}},
		{Key: "progress_since_last", Value: bson.D{}},
		{Key: "episodic", Value: bson.D{{Key: "episode_count", Value: int64(0)}, {Key: "callback_candidates", Value: bson.A{}}}},
	}
}

var consultationIDJunk = regexp.MustCompile(`[^A-Za-z0-9._:-]`)

// CleanConsultationID is _clean_consultation_id ("" for None).
func CleanConsultationID(v any) string {
	return pyval.Prefix(consultationIDJunk.ReplaceAllString(pyval.Str(pyval.Or(v, "")), ""), 80)
}

// Replay mirrors replay_consultation over the recent_advice of row.
func Replay(row bson.D, consultationID any) bson.D {
	id := CleanConsultationID(consultationID)
	if id == "" {
		return nil
	}
	recent, _ := list(get(row, "recent_advice"))
	for i := len(recent) - 1; i >= 0; i-- {
		item, ok := dict(recent[i])
		if !ok {
			continue
		}
		if stored, isStr := get(item, "consultation_id").(string); !isStr || stored != id {
			continue
		}
		adviceText := text(get(item, "text"), advicePrefixLimit)
		if adviceText == "" {
			return nil
		}
		return bson.D{
			{Key: "consultationId", Value: id},
			{Key: "questionKind", Value: text(get(item, "question_kind"), 32)},
			{Key: "text", Value: adviceText},
			{Key: "at", Value: get(item, "at")},
		}
	}
	return nil
}

var (
	kindJunk      = regexp.MustCompile(`[^A-Za-z0-9_-]`)
	signatureJunk = regexp.MustCompile(`[^a-z0-9áéíóúüñ ]+`)
)

func responseSignature(adviceText string) string {
	normalized := signatureJunk.ReplaceAllString(strings.ToLower(text(adviceText, advicePrefixLimit)), " ")
	normalized = strings.Join(pyval.Split(normalized), " ")
	if normalized == "" {
		return ""
	}
	sum := sha1.Sum([]byte(normalized))
	return hex.EncodeToString(sum[:])[:16]
}

// Consultation is one successful audience as record_consultation stores it.
type Consultation struct {
	ID        string
	entry     bson.D
	snapshot  bson.D
	kind      string
	topic     string
	signature string
	now       string
}

// NewConsultation mirrors record_consultation's preparation; nil when the
// text is empty (nothing is recorded).
func NewConsultation(questionKind, adviceText any, facts bson.D, consultationID any, now time.Time) *Consultation {
	clean := text(adviceText, advicePrefixLimit)
	if clean == "" {
		return nil
	}
	kind := pyval.Prefix(kindJunk.ReplaceAllString(text(questionKind, 32), "_"), 32)
	if kind == "" {
		kind = "unknown"
	}
	nowISO := pyval.ISOFormatUTC(now)
	topic := GroundedTopic(kind, facts)
	id := CleanConsultationID(consultationID)
	entry := bson.D{{Key: "question_kind", Value: kind}, {Key: "topic", Value: topic}, {Key: "text", Value: clean}, {Key: "at", Value: nowISO}}
	if id != "" {
		entry = append(entry, bson.E{Key: "consultation_id", Value: id})
	}
	return &Consultation{ID: id, entry: entry, snapshot: Snapshot(facts), kind: kind, topic: topic, signature: responseSignature(clean), now: nowISO}
}

// Known is `clean_id in recent_consultation_ids`.
func (c *Consultation) Known(ids any) bool {
	if c.ID == "" {
		return false
	}
	list, _ := list(ids)
	for _, v := range list {
		if pydoc.Equal(v, c.ID) {
			return true
		}
	}
	return false
}

// NewRow is _new_row.
func (c *Consultation) NewRow(username string) bson.D {
	ids, signatures := bson.A{}, bson.A{}
	if c.ID != "" {
		ids = append(ids, c.ID)
	}
	if c.signature != "" {
		signatures = append(signatures, c.signature)
	}
	return bson.D{
		{Key: "_id", Value: username},
		{Key: "schema_version", Value: int64(memorySchemaVersion)},
		{Key: "consultation_count", Value: int64(1)},
		{Key: "question_counts", Value: bson.D{{Key: c.kind, Value: int64(1)}}},
		{Key: "topic_counts", Value: bson.D{{Key: c.topic, Value: int64(1)}}},
		{Key: "recent_advice", Value: bson.A{c.entry}},
		{Key: "recent_consultation_ids", Value: ids},
		{Key: "recent_response_signatures", Value: signatures},
		{Key: "created_at", Value: c.now},
		{Key: "last_consulted_at", Value: c.now},
		{Key: "main_advice", Value: c.entry},
		{Key: "facts_snapshot", Value: c.snapshot},
		{Key: "updated_at", Value: c.now},
	}
}

// Filter is the guarded update filter.
func (c *Consultation) Filter(username string) bson.D {
	filter := bson.D{{Key: "_id", Value: username}}
	if c.ID != "" {
		filter = append(filter, bson.E{Key: "recent_consultation_ids", Value: bson.D{{Key: "$ne", Value: c.ID}}})
	}
	return filter
}

// Update is _mongo_update.
func (c *Consultation) Update() bson.D {
	push := bson.D{{Key: "recent_advice", Value: bson.D{{Key: "$each", Value: bson.A{c.entry}}, {Key: "$slice", Value: -maxRecentAdvice}}}}
	if c.ID != "" {
		push = append(push, bson.E{Key: "recent_consultation_ids", Value: bson.D{{Key: "$each", Value: bson.A{c.ID}}, {Key: "$slice", Value: -maxRecentConsultationIDs}}})
	}
	if c.signature != "" {
		push = append(push, bson.E{Key: "recent_response_signatures", Value: bson.D{{Key: "$each", Value: bson.A{c.signature}}, {Key: "$slice", Value: -maxResponseSignatures}}})
	}
	return bson.D{
		{Key: "$inc", Value: bson.D{{Key: "consultation_count", Value: int64(1)}, {Key: "question_counts." + c.kind, Value: int64(1)}, {Key: "topic_counts." + c.topic, Value: int64(1)}}},
		{Key: "$set", Value: bson.D{
			{Key: "schema_version", Value: int64(memorySchemaVersion)},
			{Key: "last_consulted_at", Value: c.now},
			{Key: "main_advice", Value: c.entry},
			{Key: "facts_snapshot", Value: c.snapshot},
			{Key: "updated_at", Value: c.now},
		}},
		{Key: "$setOnInsert", Value: bson.D{{Key: "created_at", Value: c.now}}},
		{Key: "$push", Value: push},
	}
}

func positionLabel(loss int64, played string) string {
	if played == "" {
		played = "la jugada"
	}
	switch {
	case loss >= 500:
		return fmt.Sprintf("Posición emblemática: %s, catástrofe de %d cp", played, loss)
	case loss >= 250:
		return fmt.Sprintf("Posición emblemática: %s, error grave de %d cp", played, loss)
	}
	return fmt.Sprintf("Posición crítica recordada: %s, %d cp", played, loss)
}

// EmblematicUpdate mirrors record_emblematic_position: the update for the
// stored positions, or nil when the position is not worth remembering.
func EmblematicUpdate(storedPositions any, facts bson.D, now time.Time) (bson.D, error) {
	c := &collector{}
	fen := text(get(facts, "fen"), 128)
	loss := c.nonNeg(get(facts, "loss_cp"))
	severity := strings.ToLower(text(get(facts, "severity"), 24))
	if c.err != nil {
		return nil, c.err
	}
	if fen == "" || (loss < 180 && severity != "mistake" && severity != "blunder" && severity != "grave" && severity != "critical") {
		return nil, nil
	}
	played := text(get(facts, "played"), 24)
	suggested := text(get(facts, "suggested"), 24)
	sum := sha1.Sum([]byte(fen + "|" + played + "|" + suggested))
	fingerprint := hex.EncodeToString(sum[:])[:20]
	nowISO := pyval.ISOFormatUTC(now)
	entry := bson.D{
		{Key: "fingerprint", Value: fingerprint},
		{Key: "label", Value: positionLabel(loss, played)},
		{Key: "fen", Value: fen},
		{Key: "opening", Value: text(get(facts, "opening"), 100)},
		{Key: "move_number", Value: pyval.NumberValue(get(facts, "move_number"))},
		{Key: "played", Value: played},
		{Key: "suggested", Value: suggested},
		{Key: "loss_cp", Value: loss},
		{Key: "severity", Value: severity},
		{Key: "at", Value: nowISO},
	}
	positions := bson.A{}
	for _, p := range emblematic(storedPositions, c) {
		if fingerprintOf(p) != fingerprint {
			positions = append(positions, p)
		}
	}
	if c.err != nil {
		return nil, c.err
	}
	positions = append(positions, entry)
	return bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "schema_version", Value: int64(memorySchemaVersion)},
			{Key: "emblematic_positions", Value: tail(positions, maxEmblematic)},
			{Key: "updated_at", Value: nowISO},
		}},
		{Key: "$setOnInsert", Value: bson.D{{Key: "created_at", Value: nowISO}, {Key: "consultation_count", Value: int64(0)}}},
	}, nil
}

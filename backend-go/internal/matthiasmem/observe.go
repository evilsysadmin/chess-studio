package matthiasmem

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

var topicLabels = map[string]string{
	"mate_awareness":      "Ver mates antes de que sea demasiado tarde",
	"queen_safety":        "Seguridad de la dama",
	"forks":               "Horquillas y dobles ataques",
	"conversion":          "Convertir ventajas sin regalar el final",
	"openings":            "Aperturas recurrentes",
	"tactics":             "Táctica y cálculo",
	"strengths":           "Consolidar fortalezas reales",
	"decision_process":    "Proceso de decisión antes de mover",
	"general_improvement": "Reducir el error recurrente principal",
}

var incidentTopics = map[string]string{
	"human:MISSED_MATE":            "mate_awareness",
	"human:ALLOWED_MATE":           "mate_awareness",
	"human:QUEEN_EN_PRISE_TO_PAWN": "queen_safety",
	"cpu:PAWN_TAKES_QUEEN":         "queen_safety",
	"cpu:KNIGHT_FORK":              "forks",
	"cpu:PAWN_FORK":                "forks",
	"human:STALEMATE_BLUNDER":      "conversion",
}

func topicLabelOr(topic string) string {
	if label, ok := topicLabels[topic]; ok {
		return label
	}
	return topic
}

// pyRound is Python's round(x, digits) for floats.
func pyRound(x float64, digits int) float64 {
	v, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'f', digits, 64), 64)
	return v
}

// Snapshot is _snapshot(facts).
func Snapshot(facts any) bson.D {
	f := dictOrEmpty(facts)
	snap := bson.D{}
	for _, key := range numericSnapshotKeys {
		if n, ok := pyval.Number(get(f, key)); ok {
			snap = append(snap, bson.E{Key: key, Value: n.Value()})
		}
	}
	record := dictOrEmpty(get(f, "record"))
	clean := bson.D{}
	for _, key := range recordKeys {
		if n, ok := pyval.Number(get(record, key)); ok {
			clean = append(clean, bson.E{Key: key, Value: n.Value()})
		}
	}
	if len(clean) > 0 {
		snap = append(snap, bson.E{Key: "record", Value: clean})
	}
	return snap
}

type incidentCount struct {
	key   string
	count int64
}

// incidentCounts is _incident_counts_from_facts (insertion order kept).
func incidentCounts(facts bson.D, c *collector) []incidentCount {
	rows, _ := list(get(facts, "noteworthy_incidents"))
	var out []incidentCount
	index := map[string]int{}
	for _, raw := range rows {
		item, ok := dict(raw)
		if !ok {
			continue
		}
		key := text(get(item, "key"), 80)
		n, isNum := pyval.Number(get(item, "count"))
		if key == "" || !isNum || !(n.Float64() > 0) {
			continue
		}
		count := max(0, c.numInt(n))
		if i, seen := index[key]; seen {
			out[i].count = count
			continue
		}
		index[key] = len(out)
		out = append(out, incidentCount{key: key, count: count})
	}
	return out
}

func incidentLookup(rows []incidentCount, key string) int64 {
	for _, r := range rows {
		if r.key == key {
			return r.count
		}
	}
	return 0
}

// rankedIncidents is sorted(((count, key, topic) ...), reverse=True).
func rankedIncidents(rows []incidentCount, positiveOnly bool) []incidentCount {
	var ranked []incidentCount
	for _, r := range rows {
		if _, ok := incidentTopics[r.key]; !ok {
			continue
		}
		if positiveOnly && r.count <= 0 {
			continue
		}
		ranked = append(ranked, r)
	}
	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].count != ranked[j].count {
			return ranked[i].count > ranked[j].count
		}
		if ranked[i].key != ranked[j].key {
			return ranked[i].key > ranked[j].key
		}
		return incidentTopics[ranked[i].key] > incidentTopics[ranked[j].key]
	})
	return ranked
}

// dominantIncidentTopic is _dominant_incident_topic.
func dominantIncidentTopic(facts bson.D) string {
	rows, _ := list(get(facts, "noteworthy_incidents"))
	best, bestTopic := int64(0), ""
	found := false
	for _, raw := range rows {
		item, ok := dict(raw)
		if !ok {
			continue
		}
		key := pyval.Prefix(pyval.Str(pyval.Or(get(item, "key"), "")), 80)
		topic, known := incidentTopics[key]
		n, isNum := pyval.Number(get(item, "count"))
		if !known || !isNum || !(n.Float64() > 0) {
			continue
		}
		count, err := n.Int()
		if err != nil {
			continue
		}
		// max(..., key=(count, topic)) keeps the first maximum.
		if !found || count > best || (count == best && topic > bestTopic) {
			best, bestTopic, found = count, topic, true
		}
	}
	return bestTopic
}

// GroundedTopic is _grounded_topic.
func GroundedTopic(kind string, facts bson.D) string {
	if incident := dominantIncidentTopic(facts); incident != "" && (kind == "improve" || kind == "tactics" || kind == "action") {
		return incident
	}
	switch kind {
	case "openings":
		return "openings"
	case "tactics":
		return "tactics"
	case "strengths":
		return "strengths"
	case "action":
		return "decision_process"
	}
	return "general_improvement"
}

// openingMemory is _opening_memory_from_facts.
func openingMemory(facts bson.D, c *collector) []opening {
	rows := openings(get(facts, "openings"), c)
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].games != rows[j].games {
			return rows[i].games > rows[j].games
		}
		return rows[i].name < rows[j].name
	})
	if len(rows) > maxOpeningMemory {
		rows = rows[:maxOpeningMemory]
	}
	return rows
}

func relationshipFor(row, facts bson.D, c *collector) bson.D {
	games := c.nonNeg(get(facts, "total_games"))
	consultations := max(0, c.intOr(get(row, "consultation_count")))
	tier, label := "newcomer", "Recién llegado"
	switch {
	case games >= 50 || consultations >= 12:
		tier, label = "veteran", "Viejo conocido"
	case games >= 15 || consultations >= 5:
		tier, label = "regular", "Habitual del despacho"
	case games >= 3 || consultations >= 1:
		tier, label = "acquainted", "Ya nos conocemos"
	}
	return bson.D{{Key: "tier", Value: tier}, {Key: "label", Value: label}, {Key: "games_seen", Value: games}}
}

func respectFor(facts bson.D, milestones bson.A, c *collector) bson.D {
	games := c.nonNeg(get(facts, "total_games"))
	puzzles := c.nonNeg(get(facts, "puzzles_solved"))
	streak := c.nonNeg(get(facts, "longest_win_streak"))
	rivalryWins := c.nonNeg(get(dictOrEmpty(get(facts, "cpu_rivalry")), "wins"))
	// _rivalry_from_facts cleans every key; keep its failures.
	_ = rivalry(get(facts, "cpu_rivalry"), c)
	completed := int64(0)
	for _, raw := range milestones {
		m, _ := dict(raw)
		if kind, _ := get(m, "kind").(string); kind == "goal_completed" || kind == "challenge_completed" {
			completed++
		}
	}
	rating := dictOrEmpty(get(facts, "rating_trend"))
	ratingGain := c.nonNeg(get(rating, "delta"))
	score := min(100, min(40, games)+min(18, rivalryWins*3)+min(12, puzzles/3)+min(18, completed*6)+min(6, streak)+min(12, ratingGain/25))
	tier, label := "recruit", "Recluta bajo observación"
	switch {
	case score >= 65:
		tier, label = "formidable", "Rival respetado"
	case score >= 40:
		tier, label = "respected", "Respeto ganado"
	case score >= 18:
		tier, label = "proven", "Ya no eres recluta"
	}
	return bson.D{{Key: "tier", Value: tier}, {Key: "label", Value: label}, {Key: "score", Value: score}}
}

func returnContextFor(row bson.D, now time.Time, c *collector) any {
	nowISO := pyval.ISOFormatUTC(now)
	previous, okPrev := parseISO(get(row, "last_observed_at"))
	current, okCur := parseISO(nowISO)
	if okPrev && okCur {
		gap := floorDiv(current.Sub(previous).Microseconds(), usPerDay)
		if gap >= returnAfterDays {
			if tier, _ := get(relationship(get(row, "relationship"), c), "tier").(string); tier != "newcomer" {
				return bson.D{{Key: "days", Value: gap}, {Key: "returned_at", Value: nowISO}}
			}
		}
	}
	if rc := cleanReturnContext(get(row, "return_context"), current, c); rc != nil {
		return rc.doc
	}
	return nil
}

func challengeFromFacts(existing any, facts bson.D, now time.Time, c *collector) (bson.D, bson.D) {
	incidents := incidentCounts(facts, c)
	games := c.nonNeg(get(facts, "total_games"))
	if ch := cleanChallenge(existing, c); ch != nil {
		doc := ch.doc
		key, _ := get(doc, "incident_key").(string)
		count := incidentLookup(incidents, key)
		doc = setKey(doc, "current_games", games)
		doc = setKey(doc, "current_count", count)
		baselineCount, _ := get(doc, "baseline_count").(int64)
		if count > baselineCount {
			setbacks, _ := get(doc, "setbacks").(int64)
			doc = setKey(doc, "baseline_count", count)
			doc = setKey(doc, "baseline_games", games)
			doc = setKey(doc, "setbacks", setbacks+1)
			return doc, nil
		}
		if games >= ch.baselineGames+ch.target {
			return nil, doc
		}
		return doc, nil
	}
	ranked := rankedIncidents(incidents, true)
	if len(ranked) == 0 {
		return nil, nil
	}
	top := ranked[0]
	topic := incidentTopics[top.key]
	return bson.D{
		{Key: "id", Value: "clean-run:" + top.key},
		{Key: "topic", Value: topic},
		{Key: "incident_key", Value: top.key},
		{Key: "label", Value: fmt.Sprintf("%d partidas sin repetir: %s", activeChallengeGames, topicLabelOr(topic))},
		{Key: "baseline_games", Value: games},
		{Key: "current_games", Value: games},
		{Key: "baseline_count", Value: top.count},
		{Key: "current_count", Value: top.count},
		{Key: "target_games", Value: int64(activeChallengeGames)},
		{Key: "setbacks", Value: int64(0)},
		{Key: "created_at", Value: pyval.ISOFormatUTC(now)},
	}, nil
}

func setKey(doc bson.D, key string, value any) bson.D {
	for i := range doc {
		if doc[i].Key == key {
			out := append(bson.D(nil), doc...)
			out[i].Value = value
			return out
		}
	}
	return append(append(bson.D(nil), doc...), bson.E{Key: key, Value: value})
}

func moodFor(previous any, facts bson.D, previousMood any, c *collector) string {
	delta := progress(previous, Snapshot(facts))
	record := dictOrEmpty(get(delta, "record"))
	wins := c.intOr(get(record, "wins"))
	losses := c.intOr(get(record, "losses"))
	puzzles := c.intOr(get(delta, "puzzles_solved"))
	prior := textOr(previousMood, 24, defaultMood)
	switch {
	case wins >= 3 && wins >= losses+2:
		return "impressed"
	case losses >= 3 && losses >= wins+2:
		return "annoyed"
	case puzzles >= 5 || (wins >= 2 && losses == 0):
		return "pleased"
	case losses >= 2 && losses > wins:
		return "skeptical"
	case puzzles >= 3:
		return "satisfied"
	}
	if wins > losses && wins > 0 && (prior == "annoyed" || prior == "skeptical") {
		return defaultMood
	}
	if losses > wins && losses > 0 && (prior == "pleased" || prior == "impressed" || prior == "satisfied") {
		return defaultMood
	}
	switch prior {
	case "observant", "impressed", "skeptical", "satisfied", "pleased", "annoyed":
		return prior
	}
	return defaultMood
}

func milestoneDoc(fingerprint, kind, polarity, label, at string) bson.D {
	return bson.D{{Key: "fingerprint", Value: fingerprint}, {Key: "kind", Value: kind}, {Key: "polarity", Value: polarity}, {Key: "label", Value: label}, {Key: "at", Value: at}}
}

func candidateMilestones(facts bson.D, now string, c *collector) []bson.D {
	record := dictOrEmpty(get(facts, "record"))
	rivalryRow := dictOrEmpty(get(facts, "cpu_rivalry"))
	incidents := incidentCounts(facts, c)
	var out []bson.D
	add := func(fingerprint, kind, polarity, label string) {
		out = append(out, milestoneDoc(fingerprint, kind, polarity, label, now))
	}
	if c.numberInt(get(record, "wins")) >= 1 {
		add("first-win", "first_win", "fame", "Primera victoria registrada")
	}
	if c.numberInt(get(rivalryRow, "wins")) >= 1 {
		add("first-win-vs-matthias", "rivalry", "fame", "Primera victoria contra Matthias")
	}
	streak := c.numberInt(get(facts, "longest_win_streak"))
	if streak >= 3 {
		add("win-streak-3", "streak", "fame", "Primera racha de 3 victorias")
	}
	if streak >= 5 {
		add("win-streak-5", "streak", "fame", "Racha de 5 victorias")
	}
	if c.numberInt(get(facts, "puzzles_solved")) >= 10 {
		add("puzzles-10", "training", "fame", "10 puzzles resueltos")
	}
	if delta, ok := pyval.Number(get(dictOrEmpty(get(facts, "rating_trend")), "delta")); ok && delta.Float64() >= 100 {
		add("rating-plus-100", "rating", "fame", "+100 de rating respecto al inicio registrado")
	}
	if incidentLookup(incidents, "human:QUEEN_EN_PRISE_TO_PAWN") > 0 || incidentLookup(incidents, "cpu:PAWN_TAKES_QUEEN") > 0 {
		add("queen-lost-to-pawn", "queen_safety", "shame", "Una dama acabó en manos de un peón")
	}
	if incidentLookup(incidents, "human:MISSED_MATE") > 0 {
		add("missed-mate", "mate_awareness", "shame", "Hubo un mate disponible que pasó de largo")
	}
	if incidentLookup(incidents, "human:STALEMATE_BLUNDER") > 0 {
		add("stalemate-blunder", "conversion", "shame", "Una ventaja terminó en ahogado")
	}
	return out
}

func fingerprintOf(doc any) string {
	d, _ := dict(doc)
	s, _ := get(d, "fingerprint").(string)
	return s
}

func mergeMilestones(existing any, facts bson.D, now string, c *collector) bson.A {
	rows := bson.A{}
	seen := map[string]bool{}
	for _, m := range milestones(existing) {
		rows = append(rows, m.doc)
		seen[fingerprintOf(m.doc)] = true
	}
	for _, item := range candidateMilestones(facts, now, c) {
		if fp := fingerprintOf(item); !seen[fp] {
			rows = append(rows, item)
			seen[fp] = true
		}
	}
	return tail(rows, maxMilestones)
}

type goalRow struct {
	id     string
	metric string
	label  string
	doc    bson.D
}

func goalCandidates(facts bson.D, now string, c *collector) []goalRow {
	games := int64(1)
	if n, ok := pyval.Number(get(facts, "total_games")); ok && !n.Zero() {
		games = c.numInt(n)
	}
	games = max(1, games)
	var out []goalRow
	ranked := rankedIncidents(incidentCounts(facts, c), false)
	for i, r := range ranked {
		if i == 2 {
			break
		}
		topic := incidentTopics[r.key]
		rate := pyRound(float64(r.count)/float64(games), 4)
		id := "incident:" + r.key
		out = append(out, goalRow{id: id, metric: "incidents_per_game", label: topicLabelOr(topic), doc: bson.D{
			{Key: "id", Value: id}, {Key: "topic", Value: topic}, {Key: "label", Value: topicLabelOr(topic)},
			{Key: "metric", Value: "incidents_per_game"}, {Key: "baseline", Value: rate}, {Key: "current", Value: rate},
			{Key: "baseline_games", Value: games}, {Key: "current_games", Value: games}, {Key: "created_at", Value: now},
		}})
	}
	var weak *opening
	ops := openingMemory(facts, c)
	for i := range ops {
		op := &ops[i]
		if op.games < 3 {
			continue
		}
		if weak == nil || nemesisLess(op, weak) {
			weak = op
		}
	}
	if weak != nil && weak.winPct < 50 {
		id := "opening:" + weak.name
		out = append(out, goalRow{id: id, metric: "opening_win_pct", label: "Levantar " + weak.name, doc: bson.D{
			{Key: "id", Value: id}, {Key: "topic", Value: "openings"}, {Key: "label", Value: "Levantar " + weak.name},
			{Key: "metric", Value: "opening_win_pct"}, {Key: "baseline", Value: weak.winPct}, {Key: "current", Value: weak.winPct},
			{Key: "baseline_games", Value: weak.games}, {Key: "current_games", Value: weak.games}, {Key: "created_at", Value: now},
		}})
	}
	if len(out) > maxActiveGoals {
		out = out[:maxActiveGoals]
	}
	return out
}

func afterColon(id string) string {
	if _, rest, ok := strings.Cut(id, ":"); ok {
		return rest
	}
	return ""
}

func numFloat(v any) (float64, bool) {
	if n, ok := pyval.Number(v); ok {
		return n.Float64(), true
	}
	return 0, false
}

func refreshGoals(existing any, facts bson.D, now string, c *collector) (bson.A, []bson.D) {
	currentGames := c.nonNeg(get(facts, "total_games"))
	incidents := incidentCounts(facts, c)
	openingsByName := map[string]opening{}
	for _, op := range openingMemory(facts, c) {
		openingsByName[op.name] = op
	}
	candidates := goalCandidates(facts, now, c)
	candidateOrder := []string{}
	candidateMap := map[string]bson.D{}
	for _, cand := range candidates {
		if _, seen := candidateMap[cand.id]; !seen {
			candidateOrder = append(candidateOrder, cand.id)
		}
		candidateMap[cand.id] = cand.doc
	}
	active := bson.A{}
	var completed []bson.D
	for _, g := range goals(existing, c) {
		doc := g.doc
		id, _ := get(doc, "id").(string)
		metric, _ := get(doc, "metric").(string)
		baselineGames, _ := get(doc, "baseline_games").(int64)
		baseline, hasBaseline := numFloat(get(doc, "baseline"))
		switch metric {
		case "incidents_per_game":
			count := incidentLookup(incidents, afterColon(id))
			current := pyRound(float64(count)/float64(max(1, currentGames)), 4)
			doc = setKey(doc, "current", current)
			doc = setKey(doc, "current_games", currentGames)
			if currentGames >= baselineGames+3 && hasBaseline && current <= baseline*0.70 {
				completed = append(completed, doc)
				continue
			}
		case "opening_win_pct":
			if op, ok := openingsByName[afterColon(id)]; ok {
				doc = setKey(doc, "current", op.winPct)
				doc = setKey(doc, "current_games", op.games)
				if op.games >= baselineGames+3 && hasBaseline && op.winPct >= baseline+15 {
					completed = append(completed, doc)
					continue
				}
			}
		}
		active = append(active, doc)
		delete(candidateMap, id)
	}
	for _, id := range candidateOrder {
		doc, ok := candidateMap[id]
		if !ok {
			continue
		}
		if len(active) >= maxActiveGoals {
			break
		}
		active = append(active, doc)
	}
	return head(active, maxActiveGoals), completed
}

// ObserveFacts mirrors observe_facts: the $set and $setOnInsert it sends.
func ObserveFacts(row, facts bson.D, now time.Time) (bson.D, error) {
	c := &collector{}
	nowISO := pyval.ISOFormatUTC(now)
	activeGoals, completed := refreshGoals(get(row, "active_goals"), facts, nowISO, c)
	merged := mergeMilestones(get(row, "milestones"), facts, nowISO, c)
	seen := map[string]bool{}
	for _, m := range merged {
		seen[fingerprintOf(m)] = true
	}
	for _, g := range completed {
		id, _ := get(g, "id").(string)
		baselineGames := get(g, "baseline_games")
		label, _ := get(g, "label").(string)
		item := milestoneDoc(fmt.Sprintf("goal-complete:%s:%s", id, pyval.Str(baselineGames)), "goal_completed", "fame", "Objetivo superado: "+label, nowISO)
		if fp := fingerprintOf(item); !seen[fp] {
			merged = append(merged, item)
			seen[fp] = true
		}
	}
	activeChallenge, completedChallenge := challengeFromFacts(get(row, "active_challenge"), facts, now, c)
	if completedChallenge != nil {
		item := milestoneDoc(
			fmt.Sprintf("challenge-complete:%s:%s", pyval.Str(get(completedChallenge, "id")), pyval.Str(get(completedChallenge, "baseline_games"))),
			"challenge_completed", "fame", "Expediente cerrado: "+pyval.Str(get(completedChallenge, "label")), nowISO)
		if fp := fingerprintOf(item); !seen[fp] {
			merged = append(merged, item)
		}
	}
	merged = tail(merged, maxMilestones)
	openingDocs := bson.A{}
	for _, op := range openingMemory(facts, c) {
		openingDocs = append(openingDocs, op.doc)
	}
	var challenge any
	if activeChallenge != nil {
		challenge = activeChallenge
	}
	set := bson.D{
		{Key: "schema_version", Value: int64(memorySchemaVersion)},
		{Key: "relationship", Value: relationshipFor(row, facts, c)},
		{Key: "respect", Value: respectFor(facts, merged, c)},
		{Key: "mood", Value: moodFor(get(row, "latest_observed_snapshot"), facts, get(row, "mood"), c)},
		{Key: "active_goals", Value: activeGoals},
		{Key: "active_challenge", Value: challenge},
		{Key: "opening_memory", Value: openingDocs},
		{Key: "rivalry", Value: rivalry(get(facts, "cpu_rivalry"), c)},
		{Key: "return_context", Value: returnContextFor(row, now, c)},
		{Key: "milestones", Value: merged},
		{Key: "latest_observed_snapshot", Value: Snapshot(facts)},
		{Key: "last_observed_at", Value: nowISO},
		{Key: "updated_at", Value: nowISO},
	}
	if c.err != nil {
		return nil, c.err
	}
	return bson.D{
		{Key: "$set", Value: set},
		{Key: "$setOnInsert", Value: bson.D{{Key: "created_at", Value: nowISO}, {Key: "consultation_count", Value: int64(0)}}},
	}, nil
}

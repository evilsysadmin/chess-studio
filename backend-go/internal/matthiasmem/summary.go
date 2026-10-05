// Package matthiasmem is the read side of Matthias' memory: the summary,
// episodic summary and briefing that GET /api/matthias/daily and
// GET /api/matthias/briefing serve from one matthias_memory document,
// mirroring matthias_memory_store.py and matthias_episodes.py, dynamic
// cleaning rules included (pinned by scripts/matthias_memory_parity_corpus.py).
//
// Every function that Python could make raise returns an error instead, so
// callers fall back exactly where the routes catch exceptions.
package matthiasmem

import (
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	memorySchemaVersion   = 5
	maxActiveGoals        = 3
	maxMilestones         = 10
	maxOpeningMemory      = 6
	maxEmblematic         = 8
	activeChallengeGames  = 3
	returnAfterDays       = 14
	returnContextTTLDays  = 3
	errValue, errType     = "ValueError", "TypeError"
	defaultMood           = "observant"
	defaultRelationTier   = "newcomer"
	defaultRelationLabel  = "Recién llegado"
	defaultRespectTier    = "recruit"
	defaultRespectLabel   = "Recluta"
	advicePrefixLimit     = 900
	numericSnapshotKeyLen = 4
)

var (
	numericSnapshotKeys = [numericSnapshotKeyLen]string{"total_games", "puzzles_solved", "personal_training_positions", "achievements_unlocked"}
	recordKeys          = [3]string{"wins", "losses", "draws"}
)

func get(doc bson.D, key string) any {
	v, _ := pydoc.Get(doc, key)
	return v
}

func dict(v any) (bson.D, bool) {
	d, ok := v.(bson.D)
	return d, ok
}

func list(v any) (bson.A, bool) {
	switch a := v.(type) {
	case bson.A:
		return a, true
	case []any:
		return bson.A(a), true
	}
	return nil, false
}

// dictOrEmpty is `value if isinstance(value, dict) else {}`.
func dictOrEmpty(v any) bson.D {
	d, _ := dict(v)
	return d
}

func text(v any, limit int) string { return pyval.BoundedText(v, limit) }

func textOr(v any, limit int, fallback string) string {
	if s := text(v, limit); s != "" {
		return s
	}
	return fallback
}

// collector keeps the first error so cleaning code reads like Python.
type collector struct{ err error }

func (c *collector) nonNeg(v any) int64 {
	n, err := pyval.NonNegInt(v)
	if err != nil && c.err == nil {
		c.err = err
	}
	return n
}

func (c *collector) numberInt(v any) int64 {
	n, err := pyval.NumberInt(v)
	if err != nil && c.err == nil {
		c.err = err
	}
	return n
}

func (c *collector) intOr(v any) int64 {
	n, err := pyval.IntOr(v)
	if err != nil && c.err == nil {
		c.err = err
	}
	return n
}

func (c *collector) numInt(n pyval.Num) int64 {
	v, err := n.Int()
	if err != nil && c.err == nil {
		c.err = err
	}
	return v
}

// parseISO is matthias_memory_store._parse_iso.
func parseISO(v any) (time.Time, bool) {
	s := pyval.Strip(pyval.Str(pyval.Or(v, "")))
	if s == "" {
		return time.Time{}, false
	}
	t, _, ok := pyval.FromISOFormat(strings.ReplaceAll(s, "Z", "+00:00"))
	return t, ok
}

func relationship(v any, c *collector) bson.D {
	row := dictOrEmpty(v)
	return bson.D{
		{Key: "tier", Value: textOr(get(row, "tier"), 20, defaultRelationTier)},
		{Key: "label", Value: textOr(get(row, "label"), 48, defaultRelationLabel)},
		{Key: "games_seen", Value: c.nonNeg(get(row, "games_seen"))},
	}
}

func respect(v any, c *collector) bson.D {
	row := dictOrEmpty(v)
	score := max(0, min(100, c.numberInt(get(row, "score"))))
	return bson.D{
		{Key: "tier", Value: textOr(get(row, "tier"), 24, defaultRespectTier)},
		{Key: "label", Value: textOr(get(row, "label"), 48, defaultRespectLabel)},
		{Key: "score", Value: score},
	}
}

func rivalry(v any, c *collector) bson.D {
	row := dictOrEmpty(v)
	out := bson.D{}
	for _, key := range []string{"games", "wins", "draws", "losses", "best_human_streak", "best_cpu_streak"} {
		out = append(out, bson.E{Key: key, Value: c.nonNeg(get(row, key))})
	}
	return out
}

type challenge struct {
	doc                                 bson.D
	label                               string
	baselineGames, currentGames, target int64
}

func cleanChallenge(v any, c *collector) *challenge {
	row, ok := dict(v)
	if !ok || len(row) == 0 {
		return nil
	}
	id := text(get(row, "id"), 96)
	label := text(get(row, "label"), 160)
	if id == "" || label == "" {
		return nil
	}
	ch := &challenge{label: label}
	ch.baselineGames = c.nonNeg(get(row, "baseline_games"))
	ch.currentGames = c.nonNeg(get(row, "current_games"))
	baselineCount := c.nonNeg(get(row, "baseline_count"))
	currentCount := c.nonNeg(get(row, "current_count"))
	target := int64(activeChallengeGames)
	if n, isNum := pyval.Number(get(row, "target_games")); isNum && !n.Zero() {
		target = c.numInt(n)
	}
	ch.target = max(1, target)
	setbacks := c.nonNeg(get(row, "setbacks"))
	ch.doc = bson.D{
		{Key: "id", Value: id},
		{Key: "topic", Value: text(get(row, "topic"), 48)},
		{Key: "incident_key", Value: text(get(row, "incident_key"), 80)},
		{Key: "label", Value: label},
		{Key: "baseline_games", Value: ch.baselineGames},
		{Key: "current_games", Value: ch.currentGames},
		{Key: "baseline_count", Value: baselineCount},
		{Key: "current_count", Value: currentCount},
		{Key: "target_games", Value: ch.target},
		{Key: "setbacks", Value: setbacks},
		{Key: "created_at", Value: get(row, "created_at")},
	}
	return ch
}

func tail(items bson.A, n int) bson.A {
	if len(items) > n {
		return items[len(items)-n:]
	}
	return items
}

func head(items bson.A, n int) bson.A {
	if len(items) > n {
		return items[:n]
	}
	return items
}

func emblematic(v any, c *collector) bson.A {
	rows, _ := list(v)
	out := bson.A{}
	for _, raw := range tail(rows, maxEmblematic) {
		item, ok := dict(raw)
		if !ok {
			continue
		}
		fingerprint := text(get(item, "fingerprint"), 48)
		fen := text(get(item, "fen"), 128)
		if fingerprint == "" || fen == "" {
			continue
		}
		out = append(out, bson.D{
			{Key: "fingerprint", Value: fingerprint},
			{Key: "label", Value: text(get(item, "label"), 180)},
			{Key: "fen", Value: fen},
			{Key: "opening", Value: text(get(item, "opening"), 100)},
			{Key: "move_number", Value: pyval.NumberValue(get(item, "move_number"))},
			{Key: "played", Value: text(get(item, "played"), 24)},
			{Key: "suggested", Value: text(get(item, "suggested"), 24)},
			{Key: "loss_cp", Value: c.nonNeg(get(item, "loss_cp"))},
			{Key: "severity", Value: text(get(item, "severity"), 24)},
			{Key: "at", Value: get(item, "at")},
		})
	}
	return out
}

type returnContext struct {
	days int64
	doc  bson.D
}

func cleanReturnContext(v any, now time.Time, c *collector) *returnContext {
	row, ok := dict(v)
	if !ok || len(row) == 0 {
		return nil
	}
	returnedAt, ok := parseISO(get(row, "returned_at"))
	if !ok || now.Sub(returnedAt).Seconds() > returnContextTTLDays*86400 {
		return nil
	}
	days := c.nonNeg(get(row, "days"))
	if days < returnAfterDays {
		return nil
	}
	return &returnContext{days: days, doc: bson.D{{Key: "days", Value: days}, {Key: "returned_at", Value: get(row, "returned_at")}}}
}

// snapshot is _snapshot over facts; only the empty-facts case is needed here.
func emptySnapshot() bson.D { return bson.D{} }

// progress is _progress.
func progress(previous any, current bson.D) bson.D {
	prev := dictOrEmpty(previous)
	delta := bson.D{}
	for _, key := range numericSnapshotKeys {
		before, okBefore := pyval.Number(get(prev, key))
		after, okAfter := pyval.Number(get(current, key))
		if okBefore && okAfter && !after.Equal(before) {
			delta = append(delta, bson.E{Key: key, Value: after.Sub(before).Value()})
		}
	}
	beforeRecord := dictOrEmpty(get(prev, "record"))
	afterRecord := dictOrEmpty(get(current, "record"))
	record := bson.D{}
	for _, key := range recordKeys {
		before, okBefore := pyval.Number(get(beforeRecord, key))
		after, okAfter := pyval.Number(get(afterRecord, key))
		if okBefore && okAfter && !after.Equal(before) {
			record = append(record, bson.E{Key: key, Value: after.Sub(before).Value()})
		}
	}
	if len(record) > 0 {
		delta = append(delta, bson.E{Key: "record", Value: record})
	}
	return delta
}

type followup struct {
	status     string
	gamesSince int64
	doc        bson.D
}

func adviceFollowup(row bson.D, current bson.D, c *collector) *followup {
	advice, ok := dict(get(row, "main_advice"))
	if !ok || len(advice) == 0 {
		return nil
	}
	delta := progress(get(row, "facts_snapshot"), current)
	gamesSince := c.intOr(get(delta, "total_games"))
	topic := text(get(advice, "topic"), 48)
	if gamesSince < 3 {
		return &followup{status: "waiting", gamesSince: max(0, gamesSince), doc: bson.D{
			{Key: "status", Value: "waiting"},
			{Key: "games_since", Value: max(0, gamesSince)},
			{Key: "games_needed", Value: max(0, 3-gamesSince)},
			{Key: "topic", Value: topic},
		}}
	}
	record := dictOrEmpty(get(delta, "record"))
	wins := c.intOr(get(record, "wins"))
	losses := c.intOr(get(record, "losses"))
	puzzleGain := c.intOr(get(delta, "puzzles_solved"))
	status := "mixed"
	switch {
	case wins > losses || puzzleGain >= 3:
		status = "improving"
	case losses >= wins+2:
		status = "struggling"
	}
	return &followup{status: status, gamesSince: gamesSince, doc: bson.D{
		{Key: "status", Value: status},
		{Key: "games_since", Value: gamesSince},
		{Key: "games_needed", Value: int64(0)},
		{Key: "topic", Value: topic},
		{Key: "progress", Value: delta},
	}}
}

type openDebt struct {
	status string
	doc    bson.D
}

func cleanOpenDebt(row bson.D, current bson.D, c *collector) *openDebt {
	f := adviceFollowup(row, current, c)
	advice, ok := dict(get(row, "main_advice"))
	if f == nil || !ok || len(advice) == 0 || f.status == "improving" {
		return nil
	}
	return &openDebt{status: f.status, doc: bson.D{
		{Key: "topic", Value: text(get(advice, "topic"), 48)},
		{Key: "advice", Value: text(get(advice, "text"), 240)},
		{Key: "status", Value: f.status},
		{Key: "games_since", Value: f.gamesSince},
	}}
}

type goal struct {
	label string
	doc   bson.D
}

func goals(v any, c *collector) []goal {
	rows, _ := list(v)
	var out []goal
	for _, raw := range head(rows, maxActiveGoals) {
		item, ok := dict(raw)
		if !ok {
			continue
		}
		id := text(get(item, "id"), 96)
		label := text(get(item, "label"), 120)
		if id == "" || label == "" {
			continue
		}
		out = append(out, goal{label: label, doc: bson.D{
			{Key: "id", Value: id},
			{Key: "topic", Value: text(get(item, "topic"), 48)},
			{Key: "label", Value: label},
			{Key: "metric", Value: text(get(item, "metric"), 48)},
			{Key: "baseline", Value: pyval.NumberValue(get(item, "baseline"))},
			{Key: "current", Value: pyval.NumberValue(get(item, "current"))},
			{Key: "baseline_games", Value: c.nonNeg(get(item, "baseline_games"))},
			{Key: "current_games", Value: c.nonNeg(get(item, "current_games"))},
			{Key: "created_at", Value: get(item, "created_at")},
		}})
	}
	return out
}

type opening struct {
	name   string
	games  int64
	winPct float64
	doc    bson.D
}

func openings(v any, c *collector) []opening {
	rows, _ := list(v)
	var out []opening
	for _, raw := range head(rows, maxOpeningMemory) {
		item, ok := dict(raw)
		if !ok {
			continue
		}
		name := text(get(item, "name"), 100)
		if name == "" {
			continue
		}
		games := c.nonNeg(get(item, "games"))
		wins := c.nonNeg(get(item, "wins"))
		draws := c.nonNeg(get(item, "draws"))
		losses := c.nonNeg(get(item, "losses"))
		pct := 0.0
		if n, isNum := pyval.Number(get(item, "win_pct")); isNum && !n.Zero() {
			pct = n.Float64()
		}
		// max(0.0, min(100.0, pct)) with Python's argument order (NaN-safe).
		if !(pct < 100.0) {
			pct = 100.0
		}
		if !(pct > 0.0) {
			pct = 0.0
		}
		out = append(out, opening{name: name, games: games, winPct: pct, doc: bson.D{
			{Key: "name", Value: name}, {Key: "games", Value: games}, {Key: "wins", Value: wins},
			{Key: "draws", Value: draws}, {Key: "losses", Value: losses}, {Key: "win_pct", Value: pct},
		}})
	}
	return out
}

type milestone struct {
	polarity string
	doc      bson.D
}

func milestones(v any) []milestone {
	rows, _ := list(v)
	var out []milestone
	for _, raw := range tail(rows, maxMilestones) {
		item, ok := dict(raw)
		if !ok {
			continue
		}
		fingerprint := text(get(item, "fingerprint"), 96)
		label := text(get(item, "label"), 160)
		if fingerprint == "" || label == "" {
			continue
		}
		polarity := "fame"
		if s, isStr := get(item, "polarity").(string); isStr && s == "shame" {
			polarity = "shame"
		}
		out = append(out, milestone{polarity: polarity, doc: bson.D{
			{Key: "fingerprint", Value: fingerprint},
			{Key: "kind", Value: text(get(item, "kind"), 48)},
			{Key: "polarity", Value: polarity},
			{Key: "label", Value: label},
			{Key: "at", Value: get(item, "at")},
		}})
	}
	return out
}

func milestoneDocs(items []milestone, polarity string, last int) bson.A {
	out := bson.A{}
	for _, m := range items {
		if polarity == "" || m.polarity == polarity {
			out = append(out, m.doc)
		}
	}
	return tail(out, last)
}

// Summary is the typed result of user_summary plus its JSON document.
type Summary struct {
	Doc bson.D

	relationTier string
	respectTier  string
	mood         string
	goals        []goal
	challenge    *challenge
	debt         *openDebt
	nemesis      *opening
	reunion      *returnContext
}

// UserSummary mirrors matthias_memory_store.user_summary for one document
// (nil when the user has none).
func UserSummary(row bson.D, now time.Time) (*Summary, error) {
	c := &collector{}
	s := &Summary{}

	schema := int64(memorySchemaVersion)
	if raw := get(row, "schema_version"); pyval.Truthy(raw) {
		schema = c.intOr(raw)
	}
	consultations := max(0, c.intOr(get(row, "consultation_count")))
	ms := milestones(get(row, "milestones"))
	ops := openings(get(row, "opening_memory"), c)
	for i := range ops {
		op := &ops[i]
		if op.games < 3 {
			continue
		}
		if s.nemesis == nil || nemesisLess(op, s.nemesis) {
			s.nemesis = op
		}
	}
	rel := relationship(get(row, "relationship"), c)
	s.relationTier, _ = get(rel, "tier").(string)
	resp := respect(get(row, "respect"), c)
	s.respectTier, _ = get(resp, "tier").(string)
	s.mood = textOr(get(row, "mood"), 24, defaultMood)
	s.goals = goals(get(row, "active_goals"), c)
	var obsession any
	if len(s.goals) > 0 {
		g := s.goals[0].doc
		obsession = bson.D{{Key: "id", Value: get(g, "id")}, {Key: "topic", Value: get(g, "topic")}, {Key: "label", Value: get(g, "label")}}
	}
	s.challenge = cleanChallenge(get(row, "active_challenge"), c)
	openingDocs := bson.A{}
	for _, op := range ops {
		openingDocs = append(openingDocs, op.doc)
	}
	s.reunion = cleanReturnContext(get(row, "return_context"), now, c)
	positions := emblematic(get(row, "emblematic_positions"), c)
	current, ok := dict(get(row, "latest_observed_snapshot"))
	if !ok {
		current = emptySnapshot()
	}
	f := adviceFollowup(row, current, c)
	s.debt = cleanOpenDebt(row, current, c)

	var mainAdvice any
	if advice, isDict := dict(get(row, "main_advice")); isDict && len(advice) > 0 {
		if adviceText := text(get(advice, "text"), advicePrefixLimit); adviceText != "" {
			mainAdvice = bson.D{
				{Key: "text", Value: adviceText},
				{Key: "questionKind", Value: text(get(advice, "question_kind"), 32)},
				{Key: "topic", Value: text(get(advice, "topic"), 48)},
				{Key: "at", Value: get(advice, "at")},
			}
		}
	}
	if c.err != nil {
		return nil, c.err
	}

	goalDocs := bson.A{}
	for _, g := range s.goals {
		goalDocs = append(goalDocs, g.doc)
	}
	s.Doc = bson.D{
		{Key: "schemaVersion", Value: schema},
		{Key: "consultations", Value: consultations},
		{Key: "lastConsultedAt", Value: get(row, "last_consulted_at")},
		{Key: "lastObservedAt", Value: get(row, "last_observed_at")},
		{Key: "relationship", Value: rel},
		{Key: "respect", Value: resp},
		{Key: "mood", Value: s.mood},
		{Key: "activeGoals", Value: goalDocs},
		{Key: "currentObsession", Value: obsession},
		{Key: "activeChallenge", Value: optionalDoc(s.challenge != nil, func() bson.D { return s.challenge.doc })},
		{Key: "openingMemory", Value: openingDocs},
		{Key: "nemesisOpening", Value: optionalDoc(s.nemesis != nil, func() bson.D { return s.nemesis.doc })},
		{Key: "rivalry", Value: rivalryDoc(get(row, "rivalry"), c)},
		{Key: "returnContext", Value: optionalDoc(s.reunion != nil, func() bson.D { return s.reunion.doc })},
		{Key: "hallOfFame", Value: milestoneDocs(ms, "fame", 5)},
		{Key: "hallOfShame", Value: milestoneDocs(ms, "shame", 5)},
		{Key: "recentMilestones", Value: milestoneDocs(ms, "", 5)},
		{Key: "emblematicPositions", Value: positions},
		{Key: "adviceFollowup", Value: optionalDoc(f != nil, func() bson.D { return f.doc })},
		{Key: "openDebt", Value: optionalDoc(s.debt != nil, func() bson.D { return s.debt.doc })},
		{Key: "mainAdvice", Value: mainAdvice},
	}
	if c.err != nil {
		return nil, c.err
	}
	return s, nil
}

func rivalryDoc(v any, c *collector) bson.D { return rivalry(v, c) }

func optionalDoc(present bool, doc func() bson.D) any {
	if !present {
		return nil
	}
	return doc()
}

// nemesisLess is min()'s key (win_pct, -games, name).
func nemesisLess(a, b *opening) bool {
	if a.winPct != b.winPct {
		return a.winPct < b.winPct
	}
	if a.games != b.games {
		return a.games > b.games
	}
	return a.name < b.name
}

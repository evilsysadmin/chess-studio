package matthiasmem

import (
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

const (
	episodeSchemaVersion  = 1
	maxEpisodes           = 24
	maxCallbackCandidates = 3
	usPerDay              = int64(86400) * 1_000_000
)

// episodeISO is matthias_episodes._iso: a parseable string comes back as an
// aware UTC isoformat, anything else becomes "now".
func episodeISO(v any, now time.Time) string {
	if s, ok := v.(string); ok {
		if trimmed := pyval.Strip(s); trimmed != "" {
			if t, _, ok := pyval.FromISOFormat(strings.ReplaceAll(trimmed, "Z", "+00:00")); ok {
				return pyval.ISOFormatUTC(t)
			}
		}
	}
	return pyval.ISOFormatUTC(now)
}

// episodeParse is matthias_episodes._parse_iso (no strip).
func episodeParse(v any) (time.Time, bool) {
	t, _, ok := pyval.FromISOFormat(strings.ReplaceAll(pyval.Str(pyval.Or(v, "")), "Z", "+00:00"))
	return t, ok
}

func episodeRivalry(v any, c *collector) bson.D {
	row := dictOrEmpty(v)
	out := bson.D{}
	for _, key := range []string{"games", "wins", "draws", "losses"} {
		out = append(out, bson.E{Key: key, Value: c.nonNeg(get(row, key))})
	}
	return out
}

func cleanEvidence(v any, c *collector) bson.D {
	row := dictOrEmpty(v)
	source := text(get(row, "source"), 40)
	switch source {
	case "noteworthy_incidents":
		return bson.D{
			{Key: "source", Value: source},
			{Key: "key", Value: text(get(row, "key"), 80)},
			{Key: "previous_count", Value: c.nonNeg(get(row, "previous_count"))},
			{Key: "count", Value: c.nonNeg(get(row, "count"))},
			{Key: "delta", Value: c.nonNeg(get(row, "delta"))},
		}
	case "cpu_rivalry":
		return bson.D{
			{Key: "source", Value: source},
			{Key: "outcome", Value: text(get(row, "outcome"), 8)},
			{Key: "game_number", Value: c.nonNeg(get(row, "game_number"))},
			{Key: "record", Value: episodeRivalry(get(row, "record"), c)},
		}
	case "openings":
		return bson.D{
			{Key: "source", Value: source},
			{Key: "opening", Value: text(get(row, "opening"), 100)},
			{Key: "outcome", Value: text(get(row, "outcome"), 8)},
			{Key: "games", Value: c.nonNeg(get(row, "games"))},
			{Key: "wins", Value: c.nonNeg(get(row, "wins"))},
			{Key: "draws", Value: c.nonNeg(get(row, "draws"))},
			{Key: "losses", Value: c.nonNeg(get(row, "losses"))},
		}
	}
	return nil
}

type episode struct {
	fingerprint string
	kind        string
	severity    int64
	at          string
	evidence    bson.D
	doc         bson.D
}

func cleanEpisode(v any, now time.Time, c *collector) *episode {
	row, ok := dict(v)
	if !ok || len(row) == 0 {
		return nil
	}
	fingerprint := text(get(row, "fingerprint"), 160)
	kind := text(get(row, "kind"), 40)
	label := text(get(row, "label"), 180)
	evidence := cleanEvidence(get(row, "evidence"), c)
	if fingerprint == "" || kind == "" || label == "" || len(evidence) == 0 {
		return nil
	}
	polarity := "neutral"
	switch p := get(row, "polarity").(type) {
	case string:
		if p == "fame" || p == "shame" || p == "neutral" {
			polarity = p
		}
	case bson.D, bson.A, []any:
		// `value in {...}` hashes value: a dict or list is a TypeError.
		if c.err == nil {
			c.err = pyval.ErrType
		}
	}
	severity := max(0, min(100, c.numberInt(get(row, "severity"))))
	at := episodeISO(get(row, "at"), now)
	return &episode{fingerprint: fingerprint, kind: kind, severity: severity, at: at, evidence: evidence, doc: bson.D{
		{Key: "schema_version", Value: int64(episodeSchemaVersion)},
		{Key: "fingerprint", Value: fingerprint},
		{Key: "kind", Value: kind},
		{Key: "label", Value: label},
		{Key: "polarity", Value: polarity},
		{Key: "severity", Value: severity},
		{Key: "evidence", Value: evidence},
		{Key: "at", Value: at},
	}}
}

// mergeEpisodes is merge_episodes(existing, []).
func mergeEpisodes(v any, now time.Time, c *collector) []*episode {
	rows, _ := list(v)
	var merged []*episode
	index := map[string]int{}
	for _, raw := range rows {
		ep := cleanEpisode(raw, now, c)
		if ep == nil {
			continue
		}
		if i, seen := index[ep.fingerprint]; seen {
			merged[i] = ep
			continue
		}
		index[ep.fingerprint] = len(merged)
		merged = append(merged, ep)
	}
	sort.SliceStable(merged, func(i, j int) bool {
		a, _ := episodeParse(merged[i].at)
		b, _ := episodeParse(merged[j].at)
		if !a.Equal(b) {
			return a.Before(b)
		}
		return merged[i].fingerprint < merged[j].fingerprint
	})
	if len(merged) > maxEpisodes {
		merged = merged[len(merged)-maxEpisodes:]
	}
	return merged
}

func floorDiv(a, b int64) int64 {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

func ageDays(at string, now time.Time) int64 {
	t, ok := episodeParse(at)
	if !ok {
		return 9999
	}
	return max(0, floorDiv(now.Sub(t).Microseconds(), usPerDay))
}

// eligibleCallbacks is eligible_callbacks(merged) at now.
func eligibleCallbacks(merged []*episode, now time.Time, c *collector) bson.A {
	type ranked struct {
		score       int64
		fingerprint string
		doc         bson.D
	}
	var rows []ranked
	for _, raw := range merged {
		// Python cleans the already clean episodes once more.
		ep := cleanEpisode(raw.doc, now, c)
		if ep == nil {
			continue
		}
		age := ageDays(ep.at, now)
		recency := int64(0)
		switch {
		case age <= 3:
			recency = 24
		case age <= 14:
			recency = 12
		}
		count, _ := get(ep.evidence, "count").(int64)
		losses, _ := get(ep.evidence, "losses").(int64)
		incidents := get(ep.evidence, "source") == "noteworthy_incidents"
		recurring := int64(0)
		if incidents {
			switch {
			case count >= 5:
				recurring = 18
			case count >= 3:
				recurring = 10
			}
		}
		if ep.kind == "opening_setback" && losses >= 3 {
			recurring = max(recurring, 12)
		}
		score := ep.severity + recency + recurring
		if score < 78 {
			continue
		}
		reasons := bson.A{}
		if age <= 14 {
			reasons = append(reasons, "recent")
		}
		if ep.severity >= 85 {
			reasons = append(reasons, "severe")
		}
		if incidents && count >= 3 {
			reasons = append(reasons, "recurring")
		}
		if ep.kind == "opening_setback" && losses >= 3 {
			reasons = append(reasons, "recurring")
		}
		if len(reasons) == 0 {
			reasons = bson.A{"notable"}
		}
		rows = append(rows, ranked{score: score, fingerprint: ep.fingerprint, doc: bson.D{{Key: "episode", Value: ep.doc}, {Key: "reasons", Value: reasons}}})
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].score != rows[j].score {
			return rows[i].score > rows[j].score
		}
		return rows[i].fingerprint < rows[j].fingerprint
	})
	out := bson.A{}
	for i, r := range rows {
		if i == maxCallbackCandidates {
			break
		}
		out = append(out, r.doc)
	}
	return out
}

// EpisodicSummary mirrors matthias_episode_store.summary for one document.
func EpisodicSummary(row bson.D, now time.Time) (bson.D, error) {
	c := &collector{}
	merged := mergeEpisodes(get(row, "episodes"), now, c)
	recent := bson.A{}
	start := max(0, len(merged)-5)
	for _, ep := range merged[start:] {
		recent = append(recent, ep.doc)
	}
	callbacks := eligibleCallbacks(merged, now, c)
	if c.err != nil {
		return nil, c.err
	}
	return bson.D{
		{Key: "episodeCount", Value: int64(len(merged))},
		{Key: "recentEpisodes", Value: recent},
		{Key: "callbackCandidates", Value: callbacks},
	}, nil
}

// EmptyEpisodic is the routes' fallback when the episodic summary fails.
func EmptyEpisodic() bson.D {
	return bson.D{{Key: "episodeCount", Value: int64(0)}, {Key: "recentEpisodes", Value: bson.A{}}, {Key: "callbackCandidates", Value: bson.A{}}}
}

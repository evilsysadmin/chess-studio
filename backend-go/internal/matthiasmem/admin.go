package matthiasmem

import (
	"sort"
	"strconv"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pydoc"
	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

// AdminProjection is the fields admin_status reads.
var AdminProjection = bson.D{
	{Key: "consultation_count", Value: 1}, {Key: "question_counts", Value: 1}, {Key: "topic_counts", Value: 1},
	{Key: "schema_version", Value: 1}, {Key: "active_goals", Value: 1}, {Key: "relationship", Value: 1},
	{Key: "milestones", Value: 1}, {Key: "respect", Value: 1}, {Key: "mood", Value: 1},
	{Key: "active_challenge", Value: 1}, {Key: "emblematic_positions", Value: 1},
}

func incKey(doc bson.D, key string, by int64) bson.D {
	current, _ := pydoc.Get(doc, key)
	n, _ := current.(int64)
	return pydoc.Set(doc, key, n+by)
}

// topByCount is max(d.items(), key=lambda kv: (kv[1], kv[0]))[0].
func topByCount(doc bson.D) string {
	best, bestCount, found := "", int64(0), false
	for _, e := range doc {
		n, _ := e.Value.(int64)
		if !found || n > bestCount || (n == bestCount && e.Key > best) {
			best, bestCount, found = e.Key, n, true
		}
	}
	return best
}

// AdminStatus mirrors matthias_memory_store.admin_status over the rows.
func AdminStatus(rows []bson.D, storage string) (bson.D, error) {
	c := &collector{}
	total := int64(0)
	schemaVersions := map[int64]int64{}
	questionCounts, topicCounts, topicUsers := bson.D{}, bson.D{}, bson.D{}
	for _, row := range rows {
		total += max(0, c.intOr(get(row, "consultation_count")))
		version := int64(1)
		if raw := get(row, "schema_version"); pyval.Truthy(raw) {
			version = c.intOr(raw)
		}
		schemaVersions[version]++
		for _, e := range cleanCounts(get(row, "question_counts")) {
			questionCounts = incKey(questionCounts, e.Key, e.Value.(int64))
		}
		for _, e := range cleanCounts(get(row, "topic_counts")) {
			value := e.Value.(int64)
			topicCounts = incKey(topicCounts, e.Key, value)
			if value > 0 {
				topicUsers = incKey(topicUsers, e.Key, 1)
			}
		}
	}
	var topKind, dominant any
	if len(questionCounts) > 0 {
		topKind = topByCount(questionCounts)
	}
	if len(topicCounts) > 0 {
		topic := topByCount(topicCounts)
		consultations, _ := pydoc.Get(topicCounts, topic)
		users, _ := pydoc.Get(topicUsers, topic)
		if users == nil {
			users = int64(0)
		}
		dominant = bson.D{{Key: "topic", Value: topic}, {Key: "label", Value: topicLabelOr(topic)}, {Key: "consultations", Value: consultations}, {Key: "usersAffected", Value: users}}
	}
	goalCounts, relationshipCounts, respectCounts, moodCounts := bson.D{}, bson.D{}, bson.D{}, bson.D{}
	milestoneCount, activeChallenges, emblematicCount := int64(0), int64(0), int64(0)
	for _, row := range rows {
		for _, g := range goals(get(row, "active_goals"), c) {
			topic, _ := get(g.doc, "topic").(string)
			if topic == "" {
				topic = "other"
			}
			goalCounts = incKey(goalCounts, topic, 1)
		}
		tier, _ := get(relationship(get(row, "relationship"), c), "tier").(string)
		relationshipCounts = incKey(relationshipCounts, tier, 1)
		respectTier, _ := get(respect(get(row, "respect"), c), "tier").(string)
		respectCounts = incKey(respectCounts, respectTier, 1)
		moodCounts = incKey(moodCounts, textOr(get(row, "mood"), 24, defaultMood), 1)
		milestoneCount += int64(len(milestones(get(row, "milestones"))))
		if cleanChallenge(get(row, "active_challenge"), c) != nil {
			activeChallenges++
		}
		emblematicCount += int64(len(emblematic(get(row, "emblematic_positions"), c)))
	}
	var topGoal any
	if len(goalCounts) > 0 {
		topic := topByCount(goalCounts)
		users, _ := pydoc.Get(goalCounts, topic)
		topGoal = bson.D{{Key: "topic", Value: topic}, {Key: "label", Value: topicLabelOr(topic)}, {Key: "users", Value: users}}
	}
	usersWithMemory := int64(0)
	for _, row := range rows {
		if c.intOr(get(row, "consultation_count")) > 0 {
			usersWithMemory++
		}
	}
	if c.err != nil {
		return nil, c.err
	}
	versions := make([]int64, 0, len(schemaVersions))
	for v := range schemaVersions {
		versions = append(versions, v)
	}
	sort.Slice(versions, func(i, j int) bool { return versions[i] < versions[j] })
	versionDoc := bson.D{}
	for _, v := range versions {
		versionDoc = append(versionDoc, bson.E{Key: strconv.FormatInt(v, 10), Value: schemaVersions[v]})
	}
	return bson.D{
		{Key: "ok", Value: true},
		{Key: "storage", Value: storage},
		{Key: "memorySchemaVersion", Value: int64(memorySchemaVersion)},
		{Key: "schemaVersions", Value: versionDoc},
		{Key: "recentAdviceCap", Value: int64(maxRecentAdvice)},
		{Key: "activeGoalCap", Value: int64(maxActiveGoals)},
		{Key: "milestoneCap", Value: int64(maxMilestones)},
		{Key: "openingMemoryCap", Value: int64(maxOpeningMemory)},
		{Key: "emblematicPositionCap", Value: int64(maxEmblematic)},
		{Key: "responseSignatureCap", Value: int64(maxResponseSignatures)},
		{Key: "consultations", Value: total},
		{Key: "usersWithMemory", Value: usersWithMemory},
		{Key: "topQuestionKind", Value: topKind},
		{Key: "questionCounts", Value: questionCounts},
		{Key: "dominantAdvice", Value: dominant},
		{Key: "activeGoalCounts", Value: goalCounts},
		{Key: "topActiveGoal", Value: topGoal},
		{Key: "relationshipCounts", Value: relationshipCounts},
		{Key: "respectCounts", Value: respectCounts},
		{Key: "moodCounts", Value: moodCounts},
		{Key: "milestonesRemembered", Value: milestoneCount},
		{Key: "activeChallenges", Value: activeChallenges},
		{Key: "emblematicPositions", Value: emblematicCount},
	}, nil
}

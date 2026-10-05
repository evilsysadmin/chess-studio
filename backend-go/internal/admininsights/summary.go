package admininsights

import (
	"math"
	"strconv"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/evilsysadmin/chess-studio/backend-go/internal/pyval"
)

var pieceValues = map[string]int64{"p": 1, "n": 3, "b": 3, "r": 5, "q": 9, "k": 0}

var modeLabels = map[string]string{
	"tournament": "Torneo", "practice": "Partida de práctica", "ghost": "Rival fantasma",
	"nemesis-training": "Némesis", "sudden": "Muerte súbita", "casual": "Rápida",
}

var sinLabels = map[string]string{
	"human:MISSED_MATE": "mates ignorados", "human:ALLOWED_MATE": "mates regalados",
	"human:QUEEN_EN_PRISE_TO_PAWN": "damas expuestas a peón", "human:STALEMATE_BLUNDER": "ahogados criminales",
	"cpu:PAWN_TAKES_QUEEN": "damas perdidas contra peón", "cpu:KNIGHT_FORK": "horquillas de caballo sufridas",
	"cpu:PAWN_FORK": "horquillas de peón sufridas",
}

func dictOr(v any) bson.D {
	if d, ok := v.(bson.D); ok {
		return d
	}
	return bson.D{}
}

func eq(v any, s string) bool {
	got, ok := v.(string)
	return ok && got == s
}

// recentModeLabel is the nested recent_mode_label.
func recentModeLabel(row bson.D) (string, string, error) {
	variant := get(row, "variant")
	if unhashable(variant) {
		return "", "", ErrRaised
	}
	if eq(variant, "combat") || eq(variant, "roguelike") || get(row, "roguelikeMode") != nil {
		mode := get(row, "roguelikeMode")
		if eq(mode, "campaign") {
			return "Combat Chess · Campaña", "combat", nil
		}
		if unhashable(mode) {
			return "", "", ErrRaised
		}
		if eq(mode, "tower") || eq(mode, "endless") {
			return "Combat Chess · Torre", "combat", nil
		}
		return "Combat Chess", "combat", nil
	}
	mode := pyval.Str(pyval.Or(get(row, "mode"), "casual"))
	if label, ok := modeLabels[mode]; ok {
		return label, mode, nil
	}
	return "Rápida", mode, nil
}

func idSet(rows []bson.D, keep func(bson.D) bool) map[string]bool {
	set := map[string]bool{}
	for _, row := range rows {
		if id := get(row, "gameId"); pyval.Truthy(id) && keep(row) {
			set[pyval.Str(id)] = true
		}
	}
	return set
}

func detailOrNone(parts []string) any {
	if len(parts) == 0 {
		return nil
	}
	return strings.Join(parts, " · ")
}

// SummaryStats is _extract_summary_stats.
func SummaryStats(profile bson.D) (bson.D, error) {
	data, err := profileData(profile)
	if err != nil {
		return nil, err
	}
	tournament := profileDict(data, "chess-study-tournament")
	ratingData := profileDict(data, "chess-study-player-rating")
	ratingHistory := profileList(data, "chess-study-rating-history")
	gameHistory := profileList(data, "chess-study-game-history")
	gameActivity := profileList(data, "chess-study-game-activity")
	lifecycleRows := dicts(gameActivity)
	adaptive := idSet(lifecycleRows, func(row bson.D) bool {
		return eq(get(row, "state"), "started") && eq(get(row, "detail"), "adaptive-difficulty")
	})
	combatHistory := profileList(data, "chess-study-combat-history")
	worstCache := profileDict(data, "chess-study-worst-move-cache")
	achievements := profileList(data, "chess-study-achievements")
	puzzlesSolved := profileJSON(data, "chess-study-puzzles-solved", int64(0))
	puzzleBestStreak := profileJSON(data, "chess-study-puzzle-best-streak", int64(0))
	personalPuzzles := profileList(data, "chess-study-personal-puzzles")
	rivalry := profileDict(data, "chess-study-cpu-rivalry")
	dailyChallenge := profileDict(data, "chess-study-daily-challenge")
	seriesHistory := profileList(data, "chess-study-series-history")

	careerMeta, ok := profileJSON(data, "chess-study-career", nil).(bson.D)
	if !ok {
		careerMeta = profileDict(data, "chess-study-career-meta")
	}
	var careerActivity bson.A
	if list, ok := get(careerMeta, "milestones").(bson.A); ok {
		careerActivity = list
	} else if list, ok := get(careerMeta, "activity").(bson.A); ok {
		careerActivity = list
	}
	currentSeason, _ := get(careerMeta, "season").(bson.D)
	puzzleRush := dictOr(get(careerMeta, "puzzleRush"))
	runRecords := dictOr(get(careerMeta, "runRecords"))
	careerRecords := dictOr(get(careerMeta, "records"))
	contractStats, ok := get(careerMeta, "contracts").(bson.D)
	if !ok {
		contractStats = dictOr(get(careerMeta, "contractStats"))
	}

	var analysisRows []bson.D
	for _, e := range profileDict(data, "chess-study-analysis-archive") {
		if row, ok := e.Value.(bson.D); ok {
			analysisRows = append(analysisRows, row)
		}
	}
	var accuracy []float64
	var pressureMoves, pressureIncidents, missedConversions, desperateSaves int64
	for _, row := range analysisRows {
		if acc, ok := pyFloat(get(row, "accuracy")); ok && !math.IsInf(acc, 0) && !math.IsNaN(acc) {
			accuracy = append(accuracy, acc)
		}
		for _, f := range []struct {
			key string
			dst *int64
		}{{"pressureMoves", &pressureMoves}, {"pressureIncidents", &pressureIncidents}} {
			n, ok, err := pyInt(pyval.Or(get(row, f.key), int64(0)))
			if err != nil {
				return nil, err
			}
			if ok {
				*f.dst += n
			}
		}
		outcome := get(row, "outcome")
		if peak, ok := pyFloat(get(row, "peakPerspectiveEval")); ok && !math.IsInf(peak, 0) && !math.IsNaN(peak) && peak >= 300 {
			if !unhashable(outcome) && outcome != nil && !eq(outcome, "win") {
				missedConversions++
			}
		}
		if trough, ok := pyFloat(get(row, "troughPerspectiveEval")); ok && !math.IsInf(trough, 0) && !math.IsNaN(trough) && trough <= -300 {
			if !unhashable(outcome) && (eq(outcome, "win") || eq(outcome, "draw")) {
				desperateSaves++
			}
		}
	}
	var seriesWon, seriesLost int64
	for _, row := range dicts(seriesHistory) {
		switch {
		case eq(get(row, "winner"), "human"):
			seriesWon++
		case eq(get(row, "winner"), "cpu"):
			seriesLost++
		}
	}

	allRecords := append(dicts(gameHistory), dicts(combatHistory)...)
	var wins, draws, losses int64
	for _, r := range allRecords {
		switch {
		case eq(get(r, "outcome"), "win"):
			wins++
		case eq(get(r, "outcome"), "draw"):
			draws++
		case eq(get(r, "outcome"), "loss"):
			losses++
		}
	}
	totalGames := len(allRecords)

	var bestDifficultyWin any
	for _, record := range allRecords {
		if !eq(get(record, "outcome"), "win") {
			continue
		}
		difficulty, ok, err := roundFloatInt(get(record, "difficulty"))
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		if best, has := bestDifficultyWin.(int64); !has || difficulty > best {
			bestDifficultyWin = difficulty
		}
	}

	var humanCaptures, queensCaptured, queensLost, materialDonated, whiteGames, blackGames int64
	for _, record := range dicts(gameHistory) {
		humanColor := get(record, "humanColor")
		if eq(humanColor, "w") {
			whiteGames++
		} else if eq(humanColor, "b") {
			blackGames++
		}
		moves, err := iterate(pyval.Or(get(record, "moves"), nil))
		if err != nil {
			return nil, err
		}
		for index, raw := range moves {
			move, ok := raw.(bson.D)
			if !ok {
				continue
			}
			mover := historyMoverColor(record, index)
			captured := get(move, "captured")
			if !pyval.Truthy(captured) {
				continue
			}
			capturedPiece := pyval.Or(get(move, "capturedPiece"), captured)
			if eq(humanColor, mover) {
				humanCaptures++
				if eq(capturedPiece, "q") {
					queensCaptured++
				}
				continue
			}
			if unhashable(capturedPiece) {
				return nil, ErrRaised
			}
			if s, isString := capturedPiece.(string); isString {
				materialDonated += pieceValues[s]
			}
			if eq(capturedPiece, "q") || eq(captured, "q") {
				queensLost++
			}
		}
	}

	var worstMove bson.D
	var worstLoss int64
	analyzedGames := int64(0)
	for _, e := range worstCache {
		cached, ok := e.Value.(bson.D)
		if !ok {
			continue
		}
		worst, ok := get(cached, "worst").(bson.D)
		if !ok {
			continue
		}
		analyzedGames++
		loss, ok, err := pyInt(get(worst, "loss"))
		if err != nil {
			return nil, err
		}
		if !ok {
			continue
		}
		if worstMove == nil || loss > worstLoss {
			worstLoss = loss
			worstMove = bson.D{{Key: "gameId", Value: e.Key}}
			for _, key := range []string{"index", "played", "playedFrom", "playedTo", "playedPiece", "suggested", "suggestedFrom", "suggestedTo", "suggestedPiece"} {
				worstMove = append(worstMove, bson.E{Key: key, Value: get(worst, key)})
			}
			worstMove = append(worstMove, bson.E{Key: "loss", Value: loss})
			for _, key := range []string{"moveNumber", "severity", "evalAfterSuggested", "evalAfterPlayed"} {
				worstMove = append(worstMove, bson.E{Key: key, Value: get(worst, key)})
			}
			worstMove = append(worstMove, bson.E{Key: "analyzedAt", Value: get(cached, "analyzedAt")})
		}
	}

	var ratingValues []int64
	for _, point := range dicts(ratingHistory) {
		n, ok, err := roundFloatInt(get(point, "rating"))
		if err != nil {
			return nil, err
		}
		if ok {
			ratingValues = append(ratingValues, n)
		}
	}
	var currentRating any
	if raw := get(ratingData, "rating"); raw != nil {
		n, ok, err := roundFloatInt(raw)
		if err != nil {
			return nil, err
		}
		if ok {
			currentRating = n
			ratingValues = append(ratingValues, n)
		}
	}

	recent := sortedByDate(allRecords, true)
	if len(recent) > 5 {
		recent = recent[:5]
	}
	historyByGameID := map[string]bson.D{}
	for _, record := range dicts(gameHistory) {
		if source := pyval.Or(get(record, "sourceGameId"), get(record, "gameId")); pyval.Truthy(source) {
			historyByGameID[pyval.Str(source)] = record
		}
	}
	state := func(row bson.D, want string) bool { return eq(get(row, "state"), want) }
	started := idSet(lifecycleRows, func(row bson.D) bool { return state(row, "started") })
	finished := idSet(lifecycleRows, func(row bson.D) bool { return state(row, "finished") })
	cancelled := idSet(lifecycleRows, func(row bson.D) bool { return state(row, "cancelled") })

	var recentGameActivity []bson.D
	byDate := sortedByDate(lifecycleRows, true)
	if len(byDate) > 12 {
		byDate = byDate[:12]
	}
	for _, row := range byDate {
		rowState := strings.ToLower(pyval.Str(pyval.Or(get(row, "state"), "")))
		if rowState != "started" && rowState != "cancelled" && rowState != "finished" {
			continue
		}
		modeLabel, isString := get(row, "modeLabel").(string)
		if !isString || pyval.Strip(modeLabel) == "" {
			label, _, err := recentModeLabel(bson.D{{Key: "mode", Value: get(row, "mode")}})
			if err != nil {
				return nil, err
			}
			modeLabel = label
		}
		activityType := pyval.Str(pyval.Or(get(row, "mode"), "casual"))
		if strings.HasPrefix(modeLabel, "Combat Chess") {
			activityType = "combat"
		}
		outcome := get(row, "outcome")
		var text string
		switch rowState {
		case "started":
			text = "Partida iniciada"
		case "cancelled":
			text = "Partida cancelada"
		default:
			if unhashable(outcome) {
				return nil, ErrRaised
			}
			text = "Partida finalizada"
			if result, ok := map[string]string{"win": "Victoria", "loss": "Derrota", "draw": "Tablas"}[stringOf(outcome)]; ok && isString2(outcome) {
				text += " · " + result
			}
		}
		matched := historyByGameID[pyval.Str(pyval.Or(get(row, "gameId"), ""))]
		var parts []string
		difficulty := get(row, "difficulty")
		if difficulty == nil {
			difficulty = get(matched, "difficulty")
		}
		label, err := difficultyLabel(difficulty)
		if err != nil {
			return nil, err
		}
		if s, ok := label.(string); ok {
			parts = append(parts, s)
		}
		tc := dictOr(get(matched, "timeControl"))
		if l := get(tc, "label"); pyval.Truthy(l) {
			parts = append(parts, pyval.Str(l))
		}
		if raw, ok := get(row, "detail").(string); ok && pyval.Strip(raw) != "" && raw != "adaptive-difficulty" {
			parts = append(parts, pyval.Strip(raw))
		}
		recentGameActivity = append(recentGameActivity, bson.D{
			{Key: "date", Value: get(row, "date")}, {Key: "text", Value: text}, {Key: "detail", Value: detailOrNone(parts)},
			{Key: "type", Value: activityType}, {Key: "modeLabel", Value: modeLabel},
		})
	}
	if len(recentGameActivity) == 0 {
		for _, row := range recent {
			outcome := get(row, "outcome")
			if unhashable(outcome) {
				return nil, ErrRaised
			}
			resultLabel := pyval.Or(outcome, "partida")
			if s, ok := map[string]string{"win": "victoria", "loss": "derrota", "draw": "tablas"}[stringOf(outcome)]; ok && isString2(outcome) {
				resultLabel = s
			}
			label, ok := resultLabel.(string)
			if !ok {
				return nil, ErrRaised // .capitalize() on a non-string
			}
			modeLabel, activityType, err := recentModeLabel(row)
			if err != nil {
				return nil, err
			}
			var details []string
			if get(row, "difficulty") != nil {
				level, err := difficultyLabel(get(row, "difficulty"))
				if err != nil {
					return nil, err
				}
				if s, ok := level.(string); ok {
					details = append(details, s)
				}
			}
			tc := dictOr(get(row, "timeControl"))
			if l := get(tc, "label"); pyval.Truthy(l) {
				details = append(details, pyval.Str(l))
			} else if id := get(tc, "id"); pyval.Truthy(id) && !eq(id, "none") {
				details = append(details, pyval.Str(id))
			}
			recentGameActivity = append(recentGameActivity, bson.D{
				{Key: "date", Value: get(row, "date")}, {Key: "text", Value: capitalize(label)}, {Key: "detail", Value: detailOrNone(details)},
				{Key: "type", Value: activityType}, {Key: "modeLabel", Value: modeLabel},
			})
		}
	}

	rivalryGames := int64(0)
	if record, ok := get(rivalry, "record").(bson.D); ok {
		n, ok, err := pyInt(pyval.Or(pyval.Or(get(record, "games"), get(rivalry, "totalGames")), int64(0)))
		if err != nil {
			return nil, err
		}
		if ok {
			rivalryGames = n
		}
	} else {
		byPersona := pyval.Or(get(rivalry, "byPersona"), bson.D{})
		personas, ok := byPersona.(bson.D)
		if !ok {
			return nil, ErrRaised // .values() on a non-dict
		}
		for _, e := range personas {
			row, ok := e.Value.(bson.D)
			if !ok {
				continue
			}
			n, ok, err := pyInt(pyval.Or(get(row, "games"), int64(0)))
			if err != nil {
				return nil, err
			}
			if ok {
				rivalryGames += n
			}
		}
	}

	var mostCommonSin any
	if incidents, ok := pyval.Or(get(rivalry, "incidents"), bson.D{}).(bson.D); ok {
		found := false
		var bestCount int64
		var bestKey string
		for _, e := range incidents {
			if _, known := sinLabels[e.Key]; !known {
				continue
			}
			count, ok, err := pyInt(e.Value)
			if err != nil {
				return nil, err
			}
			if !ok {
				continue
			}
			if !found || count > bestCount || (count == bestCount && e.Key > bestKey) {
				found, bestCount, bestKey = true, count, e.Key
			}
		}
		if found {
			mostCommonSin = bson.D{{Key: "label", Value: sinLabels[bestKey]}, {Key: "count", Value: bestCount}}
		}
	}

	recentForm := bson.A{}
	for _, r := range recent {
		outcome := get(r, "outcome")
		if unhashable(outcome) {
			return nil, ErrRaised
		}
		if eq(outcome, "win") || eq(outcome, "draw") || eq(outcome, "loss") {
			recentForm = append(recentForm, outcome)
		}
	}
	activity := append([]bson.D(nil), recentGameActivity...)
	head := careerActivity
	if len(head) > 8 {
		head = head[:8]
	}
	for _, row := range dicts(head) {
		activity = append(activity, bson.D{
			{Key: "date", Value: get(row, "date")}, {Key: "text", Value: normalizeCareerText(get(row, "text"))},
			{Key: "detail", Value: get(row, "detail")}, {Key: "type", Value: get(row, "type")},
		})
	}
	activity = sortedByDate(activity, true)
	if len(activity) > 8 {
		activity = activity[:8]
	}
	recentActivity := bson.A{}
	for _, row := range activity {
		recentActivity = append(recentActivity, row)
	}

	var season any
	if len(currentSeason) > 0 {
		games := get(currentSeason, "games")
		if !isNumber(games) {
			n, err := pyLen(games)
			if err != nil {
				return nil, err
			}
			games = int64(n)
		}
		season = bson.D{
			{Key: "number", Value: pyval.Or(get(currentSeason, "id"), get(currentSeason, "number"))},
			{Key: "games", Value: games},
			{Key: "target", Value: getOr(currentSeason, "targetGames", int64(20))},
		}
	}

	var ratingPeak any = currentRating
	if len(ratingValues) > 0 {
		peak := ratingValues[0]
		for _, v := range ratingValues[1:] {
			peak = max(peak, v)
		}
		ratingPeak = peak
	}
	percent := func(n, d int) any {
		if d == 0 {
			return nil
		}
		return pyRound(ratio(n, d) * 100)
	}
	numberOr0 := func(v any) any {
		if isNumber(v) {
			return v
		}
		return int64(0)
	}
	adaptiveFinished := 0
	for id := range adaptive {
		if finished[id] {
			adaptiveFinished++
		}
	}
	var avgAccuracy any
	if len(accuracy) > 0 {
		sum := 0.0
		for _, v := range accuracy {
			sum += v
		}
		avgAccuracy = pyRound(sum / float64(len(accuracy)))
	}
	var pressurePct any
	if pressureMoves != 0 {
		pressurePct = pyRound(float64(pressureIncidents) / float64(pressureMoves) * 100)
	}
	return bson.D{
		{Key: "tournamentPoints", Value: get(tournament, "points")},
		{Key: "tournamentWins", Value: get(tournament, "wins")},
		{Key: "rating", Value: currentRating},
		{Key: "ratingGames", Value: get(ratingData, "games")},
		{Key: "ratingPeak", Value: ratingPeak},
		{Key: "gamesPlayed", Value: int64(len(gameHistory))},
		{Key: "combatBattles", Value: int64(len(combatHistory))},
		{Key: "totalGames", Value: int64(totalGames)},
		{Key: "funnelStarted", Value: int64(len(started))},
		{Key: "funnelFinished", Value: int64(len(finished))},
		{Key: "funnelCancelled", Value: int64(len(cancelled))},
		{Key: "funnelCompletionPct", Value: percent(len(finished), len(started))},
		{Key: "adaptiveStarted", Value: int64(len(adaptive))},
		{Key: "adaptiveFinished", Value: int64(adaptiveFinished)},
		{Key: "wins", Value: wins},
		{Key: "draws", Value: draws},
		{Key: "losses", Value: losses},
		{Key: "winPct", Value: percent(int(wins), totalGames)},
		{Key: "longestWinStreak", Value: longestWinStreak(allRecords)},
		{Key: "bestDifficultyWin", Value: bestDifficultyWin},
		{Key: "humanCaptures", Value: humanCaptures},
		{Key: "queensCaptured", Value: queensCaptured},
		{Key: "queensLost", Value: queensLost},
		{Key: "whiteGames", Value: whiteGames},
		{Key: "blackGames", Value: blackGames},
		{Key: "analyzedGames", Value: analyzedGames},
		{Key: "worstMove", Value: docOrNil(worstMove)},
		{Key: "achievements", Value: int64(len(achievements))},
		{Key: "puzzlesSolved", Value: numberOr0(puzzlesSolved)},
		{Key: "puzzleBestStreak", Value: numberOr0(puzzleBestStreak)},
		{Key: "personalPuzzles", Value: int64(len(personalPuzzles))},
		{Key: "rivalryGames", Value: rivalryGames},
		{Key: "mostCommonSin", Value: mostCommonSin},
		{Key: "dailyBestStreak", Value: getOr(dailyChallenge, "bestStreak", int64(0))},
		{Key: "seriesPlayed", Value: int64(len(seriesHistory))},
		{Key: "seriesWon", Value: seriesWon},
		{Key: "seriesLost", Value: seriesLost},
		{Key: "recentForm", Value: recentForm},
		{Key: "recentActivity", Value: recentActivity},
		{Key: "currentSeason", Value: season},
		{Key: "puzzleRushBest", Value: getOr(careerRecords, "puzzleRushBest", getOr(puzzleRush, "bestScore", int64(0)))},
		{Key: "streakRunBest", Value: getOr(careerRecords, "bestStreakRun", getOr(runRecords, "streakBest", int64(0)))},
		{Key: "bossBestStage", Value: getOr(careerRecords, "bestBossStage", getOr(runRecords, "bossBestStage", int64(0)))},
		{Key: "cupBestScore", Value: getOr(careerRecords, "bestCupScore", int64(0))},
		{Key: "suddenDeathWins", Value: getOr(careerRecords, "suddenDeathWins", int64(0))},
		{Key: "avgAccuracy", Value: avgAccuracy},
		{Key: "analysisArchiveGames", Value: int64(len(analysisRows))},
		{Key: "pressureMoves", Value: pressureMoves},
		{Key: "pressureIncidents", Value: pressureIncidents},
		{Key: "pressureIncidentPct", Value: pressurePct},
		{Key: "missedConversions", Value: missedConversions},
		{Key: "desperateSaves", Value: desperateSaves},
		{Key: "materialDonated", Value: materialDonated},
		{Key: "contractsCompleted", Value: getOr(contractStats, "completed", int64(0))},
		{Key: "contractsOffered", Value: getOr(contractStats, "offered", int64(0))},
	}, nil
}

func docOrNil(d bson.D) any {
	if d == nil {
		return nil
	}
	return d
}

func stringOf(v any) string {
	s, _ := v.(string)
	return s
}

func isString2(v any) bool {
	_, ok := v.(string)
	return ok
}

// InsightsPayload is _extract_admin_insights_payload.
func InsightsPayload(profile bson.D) (bson.D, error) {
	data, err := profileData(profile)
	if err != nil {
		return nil, err
	}
	puzzlesSolved := profileJSON(data, "chess-study-puzzles-solved", int64(0))
	if !isNumber(puzzlesSolved) {
		puzzlesSolved = int64(0)
	}
	summary, err := SummaryStats(profile)
	if err != nil {
		return nil, err
	}
	worst, _ := summaryValue(summary, "worstMove")
	return bson.D{
		{Key: "gameHistory", Value: profileList(data, "chess-study-game-history")},
		{Key: "combatHistory", Value: profileList(data, "chess-study-combat-history")},
		{Key: "ratingHistory", Value: profileList(data, "chess-study-rating-history")},
		{Key: "rivalry", Value: profileDict(data, "chess-study-cpu-rivalry")},
		{Key: "extras", Value: bson.D{
			{Key: "achievementsUnlocked", Value: int64(len(profileList(data, "chess-study-achievements")))},
			{Key: "puzzlesSolved", Value: puzzlesSolved},
			{Key: "personalPuzzles", Value: int64(len(profileList(data, "chess-study-personal-puzzles")))},
			{Key: "worstMove", Value: worst},
		}},
	}, nil
}

func summaryValue(summary bson.D, key string) (any, bool) {
	for _, e := range summary {
		if e.Key == key {
			return e.Value, true
		}
	}
	return nil, false
}

// AggregateMatchmaking is aggregate_matchmaking_telemetry over the profiles
// (nil entries are users without a profile).
func AggregateMatchmaking(profiles []bson.D) (bson.D, error) {
	var samples []bson.D
	usersWithData := int64(0)
	for _, profile := range profiles {
		data, err := profileData(profile)
		if err != nil {
			return nil, err
		}
		payload, ok := profileJSON(data, "chess-study-matchmaking-telemetry-v1", bson.D{}).(bson.D)
		if !ok {
			continue
		}
		rows, ok := get(payload, "samples").(bson.A)
		if !ok || len(rows) == 0 {
			continue
		}
		usersWithData++
		samples = append(samples, dicts(rows)...)
	}
	outcomes := map[string]int64{"win": 0, "draw": 0, "loss": 0}
	for _, row := range samples {
		outcome := get(row, "outcome")
		if unhashable(outcome) {
			return nil, ErrRaised
		}
		if s, ok := outcome.(string); ok {
			if _, counted := outcomes[s]; counted {
				outcomes[s]++
			}
		}
	}
	count := len(samples)
	flagged := func(key string) int64 {
		n := int64(0)
		for _, row := range samples {
			if v, ok := get(row, key).(bool); ok && v {
				n++
			}
		}
		return n
	}
	rate := func(key string) any {
		if count == 0 {
			return nil
		}
		v, _ := strconv.ParseFloat(strconv.FormatFloat(float64(flagged(key))/float64(count), 'f', 4, 64), 64)
		return v
	}
	return bson.D{
		{Key: "sampleCount", Value: int64(count)},
		{Key: "usersWithData", Value: usersWithData},
		{Key: "outcomes", Value: bson.D{{Key: "win", Value: outcomes["win"]}, {Key: "draw", Value: outcomes["draw"]}, {Key: "loss", Value: outcomes["loss"]}}},
		{Key: "closeGames", Value: flagged("closeGame")},
		{Key: "escapedWins", Value: flagged("decisiveAdvantageEscaped")},
		{Key: "winningStalemates", Value: flagged("stalemateFromWinning")},
		{Key: "rematches", Value: flagged("rematch")},
		{Key: "closeGameRate", Value: rate("closeGame")},
		{Key: "escapedWinRate", Value: rate("decisiveAdvantageEscaped")},
		{Key: "winningStalemateRate", Value: rate("stalemateFromWinning")},
		{Key: "rematchRate", Value: rate("rematch")},
	}, nil
}

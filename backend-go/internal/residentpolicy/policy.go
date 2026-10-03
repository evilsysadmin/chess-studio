package residentpolicy

import "math"

type DifficultyBand struct {
	TargetElo      int
	MaxLossCP      float64
	MistakeChance  float64
	CandidateLimit int
	MaxDepth       int
	BudgetSeconds  float64
}

type anchor struct {
	Level float64
	Elo   float64
}

var eloAnchors = [...]anchor{
	{Level: 0, Elo: 350},
	{Level: 20, Elo: 850},
	{Level: 45, Elo: 1200},
	{Level: 60, Elo: 1375},
	{Level: 70, Elo: 1450},
	{Level: 90, Elo: 1600},
	{Level: 100, Elo: 1800},
}

type point struct {
	X int
	Y float64
}

var maxLossPoints = [...]point{
	{350, 450},
	{700, 340},
	{900, 250},
	{1100, 175},
	{1300, 125},
	{1500, 90},
	{1650, 65},
	{1800, 45},
}

var mistakePoints = [...]point{
	{350, 0.74},
	{700, 0.62},
	{900, 0.49},
	{1100, 0.38},
	{1300, 0.28},
	{1500, 0.19},
	{1650, 0.12},
	{1800, 0.07},
}

var candidatePoints = [...]point{
	{350, 8},
	{900, 7},
	{1300, 6},
	{1600, 5},
	{1800, 4},
}

func EloForLevel(raw float64) int {
	level := clamp(raw, 0, 100)
	for i := 1; i < len(eloAnchors); i++ {
		right := eloAnchors[i]
		left := eloAnchors[i-1]
		if level <= right.Level {
			span := right.Level - left.Level
			if span == 0 {
				span = 1
			}
			progress := (level - left.Level) / span
			value := left.Elo + ((right.Elo - left.Elo) * progress)
			return int(math.RoundToEven(value))
		}
	}
	return int(eloAnchors[len(eloAnchors)-1].Elo)
}

func Band(raw float64) DifficultyBand {
	level := math.RoundToEven(clamp(raw, 0, 100))
	targetElo := EloForLevel(level)
	maxDepth, baseBudget := searchSettings(level)

	candidateLimit := int(math.RoundToEven(interpolate(targetElo, candidatePoints[:])))
	if candidateLimit < 2 {
		candidateLimit = 2
	}
	budget := baseBudget * 0.45
	if budget < 0.12 {
		budget = 0.12
	}
	if budget > 0.85 {
		budget = 0.85
	}
	if maxDepth > 4 {
		maxDepth = 4
	}

	return DifficultyBand{
		TargetElo:      targetElo,
		MaxLossCP:      interpolate(targetElo, maxLossPoints[:]),
		MistakeChance:  interpolate(targetElo, mistakePoints[:]),
		CandidateLimit: candidateLimit,
		MaxDepth:       maxDepth,
		BudgetSeconds:  budget,
	}
}

// SearchSettings mirrors chess_ai.settings_for_level for deterministic
// fallback searches that are not subject to the human-Elo policy budget cap.
func SearchSettings(raw float64) (maxDepth int, budgetSeconds float64) {
	return searchSettings(math.RoundToEven(clamp(raw, 0, 100)))
}

func EffectiveLossCap(band DifficultyBand, complexity float64) float64 {
	c := clamp(complexity, 0, 1)
	return band.MaxLossCP * (1 + (0.22 * c))
}

func EffectiveMistakeChance(band DifficultyBand, complexity float64) float64 {
	c := clamp(complexity, 0, 1)
	value := band.MistakeChance * (0.82 + (0.38 * c))
	if value > 0.85 {
		return 0.85
	}
	return value
}

func ImperfectCandidateWeights(
	bestScore float64,
	alternativeScores []float64,
	maximizing bool,
	band DifficultyBand,
	complexity float64,
) []float64 {
	if len(alternativeScores) == 0 {
		return nil
	}
	c := clamp(complexity, 0, 1)
	strength := clamp((float64(band.TargetElo)-350)/1450, 0, 1)
	temperature := band.MaxLossCP * (0.64 - (0.38 * strength)) * (1 + (0.20 * c))
	if temperature < 14 {
		temperature = 14
	}

	weights := make([]float64, 0, len(alternativeScores))
	for _, score := range alternativeScores {
		loss := LossFromBest(bestScore, score, maximizing)
		weight := math.Exp(-loss / temperature)
		if weight < 1e-6 {
			weight = 1e-6
		}
		weights = append(weights, weight)
	}
	return weights
}

func LossFromBest(bestScore, candidateScore float64, maximizing bool) float64 {
	raw := candidateScore - bestScore
	if maximizing {
		raw = bestScore - candidateScore
	}
	if raw < 0 {
		return 0
	}
	return raw
}

func searchSettings(level float64) (maxDepth int, timeBudgetSeconds float64) {
	rounded := int(math.RoundToEven(clamp(level, 0, 100)))
	switch {
	case rounded < 20:
		maxDepth = 2
	case rounded < 70:
		maxDepth = 3
	case rounded < 90:
		maxDepth = 4
	case rounded < 98:
		maxDepth = 5
	default:
		maxDepth = 6
	}
	t := float64(rounded) / 100
	timeBudgetSeconds = 0.12 + (2.38 * math.Pow(t, 1.65))
	return maxDepth, timeBudgetSeconds
}

func interpolate(target int, points []point) float64 {
	if len(points) == 0 {
		return 0
	}
	elo := target
	if elo < points[0].X {
		elo = points[0].X
	}
	if elo > points[len(points)-1].X {
		elo = points[len(points)-1].X
	}
	for i := 1; i < len(points); i++ {
		right := points[i]
		left := points[i-1]
		if elo <= right.X {
			span := right.X - left.X
			if span == 0 {
				span = 1
			}
			progress := float64(elo-left.X) / float64(span)
			return left.Y + ((right.Y - left.Y) * progress)
		}
	}
	return points[len(points)-1].Y
}

func clamp(value, low, high float64) float64 {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}

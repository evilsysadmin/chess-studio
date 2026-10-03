package residentpolicy

import (
	"math"
	"testing"
)

func closeEnough(got, want float64) bool {
	return math.Abs(got-want) <= 1e-12
}

func TestResidentDifficultyBandsMatchPythonPolicy(t *testing.T) {
	tests := []struct {
		name       string
		level      float64
		elo        int
		maxLoss    float64
		mistake    float64
		candidates int
		depth      int
		budget     float64
	}{
		{"otto", 20, 850, 272.5, 0.5225, 7, 3, 0.12924696081188783},
		{"marta", 45, 1200, 150.0, 0.33, 6, 3, 0.3408072455092982},
		{"viktor", 70, 1450, 98.75, 0.21250000000000002, 6, 4, 0.6485675966009897},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Band(tc.level)
			if got.TargetElo != tc.elo || got.CandidateLimit != tc.candidates || got.MaxDepth != tc.depth {
				t.Fatalf("band=%#v", got)
			}
			if !closeEnough(got.MaxLossCP, tc.maxLoss) ||
				!closeEnough(got.MistakeChance, tc.mistake) ||
				!closeEnough(got.BudgetSeconds, tc.budget) {
				t.Fatalf("band=%#v", got)
			}
		})
	}
}

func TestEloForLevelMatchesPythonAnchorsAndClamps(t *testing.T) {
	tests := map[float64]int{
		-10:  350,
		0:    350,
		20:   850,
		32.5: 1025,
		45:   1200,
		60:   1375,
		70:   1450,
		90:   1600,
		100:  1800,
		120:  1800,
	}
	for level, want := range tests {
		if got := EloForLevel(level); got != want {
			t.Fatalf("level=%v got=%d want=%d", level, got, want)
		}
	}
}

func TestBandUsesPythonBankersRoundingForLevel(t *testing.T) {
	if got, want := Band(44.5), Band(44); got != want {
		t.Fatalf("44.5 should round-to-even 44: got=%#v want=%#v", got, want)
	}
	if got, want := Band(45.5), Band(46); got != want {
		t.Fatalf("45.5 should round-to-even 46: got=%#v want=%#v", got, want)
	}
}

func TestEffectiveErrorPolicyMatchesPythonFormula(t *testing.T) {
	band := Band(45)
	if got, want := EffectiveLossCap(band, 0.5), band.MaxLossCP*1.11; !closeEnough(got, want) {
		t.Fatalf("loss cap=%v want=%v", got, want)
	}
	if got, want := EffectiveMistakeChance(band, 0.5), band.MistakeChance*1.01; !closeEnough(got, want) {
		t.Fatalf("mistake=%v want=%v", got, want)
	}
	if got := EffectiveLossCap(band, 2); !closeEnough(got, band.MaxLossCP*1.22) {
		t.Fatalf("complexity clamp loss=%v", got)
	}
}

func TestLossFromBestMatchesMaximizingAndMinimizing(t *testing.T) {
	if got := LossFromBest(100, 40, true); got != 60 {
		t.Fatalf("maximizing loss=%v", got)
	}
	if got := LossFromBest(-100, -40, false); got != 60 {
		t.Fatalf("minimizing loss=%v", got)
	}
	if got := LossFromBest(100, 140, true); got != 0 {
		t.Fatalf("better maximizing candidate must not have loss: %v", got)
	}
}

func TestImperfectWeightsPreferSmallerErrors(t *testing.T) {
	band := Band(20)
	weights := ImperfectCandidateWeights(100, []float64{90, 50, -100}, true, band, 0.4)
	if len(weights) != 3 {
		t.Fatalf("weights=%#v", weights)
	}
	if !(weights[0] > weights[1] && weights[1] > weights[2]) {
		t.Fatalf("weights must decay with loss: %#v", weights)
	}
	for _, weight := range weights {
		if weight < 1e-6 {
			t.Fatalf("weight below Python floor: %#v", weights)
		}
	}
}

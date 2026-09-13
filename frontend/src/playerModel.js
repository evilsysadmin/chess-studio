import { buildRecurringErrorPatterns } from './insightsRecurringErrors.js';
import { personalTrainingDebtSummary } from './trainingDebt.js';

export const PLAYER_MODEL_VERSION = 2;

function nonNegativeInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export function evidenceConfidence(sampleSize, { mediumAt = 3, highAt = 8 } = {}) {
  const sample = nonNegativeInt(sampleSize);
  if (sample === 0) return 'none';
  if (sample < mediumAt) return 'low';
  if (sample < highAt) return 'medium';
  return 'high';
}

function openingFacts(insights) {
  return (Array.isArray(insights?.openingDossier) ? insights.openingDossier : [])
    .filter((row) => row?.name && nonNegativeInt(row.games) > 0)
    .map((row) => {
      const sampleSize = nonNegativeInt(row.games);
      return {
        name: row.name,
        games: sampleSize,
        wins: nonNegativeInt(row.wins),
        draws: nonNegativeInt(row.draws),
        losses: nonNegativeInt(row.losses),
        white: nonNegativeInt(row.white),
        black: nonNegativeInt(row.black),
        winPct: Number.isFinite(Number(row.winPct)) ? Number(row.winPct) : null,
        confidence: evidenceConfidence(sampleSize, { mediumAt: 4, highAt: 8 }),
      };
    });
}

export function buildPlayerModel({ insights = null, personalPuzzles = [] } = {}) {
  const puzzles = Array.isArray(personalPuzzles) ? personalPuzzles.filter(Boolean) : [];
  const totalGames = nonNegativeInt(insights?.totalGames);
  const recurringErrors = buildRecurringErrorPatterns(puzzles).map((pattern) => ({
    ...pattern,
    confidence: evidenceConfidence(pattern.positions, { mediumAt: 3, highAt: 5 }),
  }));
  const trainingDebt = personalTrainingDebtSummary(puzzles);

  return {
    version: PLAYER_MODEL_VERSION,
    samples: {
      games: totalGames,
      personalPositions: puzzles.length,
    },
    confidence: {
      games: evidenceConfidence(totalGames, { mediumAt: 5, highAt: 15 }),
      personalTraining: evidenceConfidence(puzzles.length, { mediumAt: 3, highAt: 8 }),
    },
    outcomes: insights?.overall ? { ...insights.overall } : null,
    colorPreference: insights?.colorPreference ? { ...insights.colorPreference } : null,
    ratingTrend: insights?.ratingTrend ? { ...insights.ratingTrend } : null,
    openings: openingFacts(insights),
    recurringErrors,
    trainingDebt,
  };
}
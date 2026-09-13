import {
  CLEAN_GAME_INCIDENT_COVERAGE_VERSION,
  CLEAN_GAME_POSITIVE_EVIDENCE_VERSION,
  cleanGameSummary,
} from './cleanGames.js';
import { buildRecurringErrorPatterns } from './insightsRecurringErrors.js';
import { isPersonalPuzzleCurrentlyClean, personalSpacedReviewSummary } from './spacedReview.js';
import { personalTrainingDebtSummary } from './trainingDebt.js';

export const PLAYER_MODEL_VERSION = 7;
export const PATTERN_IMPROVEMENT_PROBABLE_OBSERVATIONS = 2;
export const PATTERN_IMPROVEMENT_CORRECTED_OBSERVATIONS = 5;
export const PATTERN_IMPROVEMENT_STATES = Object.freeze({
  NO_SAMPLE: 'no-sample',
  STILL_OCCURRING: 'still-occurring',
  PROBABLE_IMPROVEMENT: 'probable-improvement',
  CORRECTED_WITH_SUFFICIENT_SAMPLE: 'corrected-with-sufficient-sample',
});

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

function isoOrNull(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function latestIso(puzzles, fields) {
  let latest = null;
  for (const puzzle of puzzles) {
    for (const field of fields) {
      const parsed = Date.parse(puzzle?.[field] || '');
      if (!Number.isFinite(parsed)) continue;
      if (latest === null || parsed > latest) latest = parsed;
    }
  }
  return latest === null ? null : new Date(latest).toISOString();
}

function trainingProgressFacts(puzzles, trainingDebt) {
  const retention = personalSpacedReviewSummary(puzzles);
  return {
    attempts: puzzles.reduce((sum, puzzle) => sum + nonNegativeInt(puzzle?.attempts), 0),
    solves: puzzles.reduce((sum, puzzle) => sum + nonNegativeInt(puzzle?.solves), 0),
    cleanSolves: puzzles.reduce((sum, puzzle) => sum + nonNegativeInt(puzzle?.cleanSolves), 0),
    attemptedPositions: puzzles.filter((puzzle) => nonNegativeInt(puzzle?.attempts) > 0).length,
    solvedPositions: puzzles.filter((puzzle) => (
      nonNegativeInt(puzzle?.solves) > 0
      || nonNegativeInt(puzzle?.cleanSolves) > 0
      || Boolean(puzzle?.masteredAt)
    )).length,
    currentlyCleanPositions: puzzles.filter(isPersonalPuzzleCurrentlyClean).length,
    retentionCompletedPositions: retention.completedCount,
    retentionDuePositions: retention.dueCount,
    activeDebts: trainingDebt.activeCount,
    paidDebts: trainingDebt.paidCount,
    lastAttemptAt: latestIso(puzzles, ['lastAttemptAt']),
    lastSolvedAt: latestIso(puzzles, ['lastSolvedAt', 'masteredAt']),
    lastCleanAt: latestIso(puzzles, ['lastCleanAt', 'retentionCompletedAt']),
  };
}

function cleanPlayFacts(records) {
  const source = records && typeof records === 'object' && !Array.isArray(records) ? records : {};
  const summary = cleanGameSummary(source);
  return {
    eligibleGames: summary.eligible,
    cleanGames: summary.clean,
    cleanRate: summary.rate,
    currentStreak: summary.currentStreak,
    bestStreak: summary.bestStreak,
    latestEligibleClean: summary.latest ? summary.latest.clean === true : null,
    latestEligibleAt: isoOrNull(summary.latest?.date),
    latestCleanAt: isoOrNull(summary.latestClean?.date),
  };
}

function positiveDecisionFacts(records) {
  const source = records && typeof records === 'object' && !Array.isArray(records) ? records : {};
  const eligible = Object.values(source)
    .filter((row) => (
      row?.version === 1
      && row?.sufficientSample === true
      && row?.positiveEvidenceVersion === CLEAN_GAME_POSITIVE_EVIDENCE_VERSION
      && nonNegativeInt(row?.positiveComparedMoves) > 0
    ))
    .sort((a, b) => new Date(a?.date || 0) - new Date(b?.date || 0));
  const comparedMoves = eligible.reduce((sum, row) => sum + nonNegativeInt(row?.positiveComparedMoves), 0);
  const enginePreferredMoves = eligible.reduce((sum, row) => (
    sum + Math.min(nonNegativeInt(row?.enginePreferredMoves), nonNegativeInt(row?.positiveComparedMoves))
  ), 0);
  const gamesWithPreferredMoves = eligible.filter((row) => nonNegativeInt(row?.enginePreferredMoves) > 0).length;

  return {
    eligibleGames: eligible.length,
    comparedMoves,
    enginePreferredMoves,
    preferredRate: comparedMoves ? Math.round(enginePreferredMoves / comparedMoves * 100) : null,
    gamesWithPreferredMoves,
    latestEvidenceAt: isoOrNull(eligible.at(-1)?.date),
  };
}

function hasIncident(row, incidentKey) {
  return Array.isArray(row?.incidentKeys) && row.incidentKeys.includes(incidentKey);
}

function patternPostTrainingObservationBundle(puzzles, records, incidentKey) {
  const relevantPuzzles = puzzles.filter((puzzle) => (
    Array.isArray(puzzle?.incidentKeys) && puzzle.incidentKeys.includes(incidentKey)
  ));
  const latestCleanTrainingAt = latestIso(relevantPuzzles, ['lastCleanAt', 'retentionCompletedAt']);
  const empty = {
    latestCleanTrainingAt,
    observedGames: 0,
    recurrenceGames: 0,
    noRecurrenceGames: 0,
    latestObservationAt: null,
    latestRecurrenceAt: null,
    latestNoRecurrenceAt: null,
  };
  if (!latestCleanTrainingAt) return { facts: empty, currentNoRecurrenceStreak: 0 };

  const anchorMs = Date.parse(latestCleanTrainingAt);
  const sourceGameIds = new Set(relevantPuzzles
    .map((puzzle) => puzzle?.sourceGameId)
    .filter(Boolean)
    .map(String));
  const source = records && typeof records === 'object' && !Array.isArray(records) ? records : {};
  const observations = Object.values(source)
    .filter((row) => (
      row?.version === 1
      && row?.sufficientSample === true
      && row?.incidentCoverageVersion === CLEAN_GAME_INCIDENT_COVERAGE_VERSION
      && row?.incidentCoverageSufficient === true
      && !sourceGameIds.has(String(row?.gameId || ''))
    ))
    .map((row) => ({ row, atMs: Date.parse(row?.date || '') }))
    .filter(({ atMs }) => Number.isFinite(atMs) && atMs > anchorMs)
    .sort((a, b) => a.atMs - b.atMs);

  const recurrence = observations.filter(({ row }) => hasIncident(row, incidentKey));
  const noRecurrence = observations.filter(({ row }) => !hasIncident(row, incidentKey));
  let currentNoRecurrenceStreak = 0;
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    if (hasIncident(observations[index].row, incidentKey)) break;
    currentNoRecurrenceStreak += 1;
  }

  return {
    facts: {
      latestCleanTrainingAt,
      observedGames: observations.length,
      recurrenceGames: recurrence.length,
      noRecurrenceGames: noRecurrence.length,
      latestObservationAt: observations.length ? new Date(observations.at(-1).atMs).toISOString() : null,
      latestRecurrenceAt: recurrence.length ? new Date(recurrence.at(-1).atMs).toISOString() : null,
      latestNoRecurrenceAt: noRecurrence.length ? new Date(noRecurrence.at(-1).atMs).toISOString() : null,
    },
    currentNoRecurrenceStreak,
  };
}

function patternImprovementState(pattern, currentNoRecurrenceStreak) {
  const observations = pattern?.postTrainingObservations;
  if (!pattern?.debt || !observations?.latestCleanTrainingAt) {
    return PATTERN_IMPROVEMENT_STATES.NO_SAMPLE;
  }
  if (
    pattern.debt.paid === true
    && currentNoRecurrenceStreak >= PATTERN_IMPROVEMENT_CORRECTED_OBSERVATIONS
  ) {
    return PATTERN_IMPROVEMENT_STATES.CORRECTED_WITH_SUFFICIENT_SAMPLE;
  }
  if (currentNoRecurrenceStreak >= PATTERN_IMPROVEMENT_PROBABLE_OBSERVATIONS) {
    return PATTERN_IMPROVEMENT_STATES.PROBABLE_IMPROVEMENT;
  }
  if (observations.recurrenceGames > 0) {
    return PATTERN_IMPROVEMENT_STATES.STILL_OCCURRING;
  }
  return PATTERN_IMPROVEMENT_STATES.NO_SAMPLE;
}

export function buildPlayerModel({ insights = null, personalPuzzles = [], cleanGameRecords = {} } = {}) {
  const puzzles = Array.isArray(personalPuzzles) ? personalPuzzles.filter(Boolean) : [];
  const totalGames = nonNegativeInt(insights?.totalGames);
  const recurringErrors = buildRecurringErrorPatterns(puzzles).map((pattern) => {
    const observationBundle = patternPostTrainingObservationBundle(
      puzzles,
      cleanGameRecords,
      pattern.incidentKey,
    );
    const enriched = {
      ...pattern,
      confidence: evidenceConfidence(pattern.positions, { mediumAt: 3, highAt: 5 }),
      postTrainingObservations: observationBundle.facts,
    };
    return {
      ...enriched,
      improvementState: patternImprovementState(enriched, observationBundle.currentNoRecurrenceStreak),
    };
  });
  const trainingDebt = personalTrainingDebtSummary(puzzles);
  const cleanPlay = cleanPlayFacts(cleanGameRecords);
  const positiveDecisions = positiveDecisionFacts(cleanGameRecords);

  return {
    version: PLAYER_MODEL_VERSION,
    samples: {
      games: totalGames,
      personalPositions: puzzles.length,
      cleanAutopsies: cleanPlay.eligibleGames,
      positiveDecisionGames: positiveDecisions.eligibleGames,
    },
    confidence: {
      games: evidenceConfidence(totalGames, { mediumAt: 5, highAt: 15 }),
      personalTraining: evidenceConfidence(puzzles.length, { mediumAt: 3, highAt: 8 }),
      cleanPlay: evidenceConfidence(cleanPlay.eligibleGames, { mediumAt: 3, highAt: 8 }),
      positiveDecisions: evidenceConfidence(positiveDecisions.eligibleGames, { mediumAt: 3, highAt: 8 }),
    },
    outcomes: insights?.overall ? { ...insights.overall } : null,
    colorPreference: insights?.colorPreference ? { ...insights.colorPreference } : null,
    ratingTrend: insights?.ratingTrend ? { ...insights.ratingTrend } : null,
    openings: openingFacts(insights),
    recurringErrors,
    trainingDebt,
    trainingProgress: trainingProgressFacts(puzzles, trainingDebt),
    cleanPlay,
    positiveDecisions,
  };
}

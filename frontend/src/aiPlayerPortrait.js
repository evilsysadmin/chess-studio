import { finiteNumber } from './numberUtils.js';
import {
  AI_NARRATIVE_MANUAL_COOLDOWN_MS,
  createAiNarrativeCache,
  formatAiNarrativeCooldown,
} from './aiNarrativeCache.js';
import { buildPlayerModel } from './playerModel.js';

export const AI_PLAYER_PORTRAIT_CACHE_KEY = 'chess-study-ai-player-portrait-v1';
const PORTRAIT_SCHEMA = 9;
const GAMES_PER_AUTOMATIC_REFRESH = 1;
export const PLAYER_PORTRAIT_MAX_CHARS = 900;

const playerPortraitCache = createAiNarrativeCache({
  cacheKey: AI_PLAYER_PORTRAIT_CACHE_KEY,
  schema: PORTRAIT_SCHEMA,
  maxChars: PLAYER_PORTRAIT_MAX_CHARS,
  manualRequestKind: 'portrait_manual',
  cooldownMs: AI_NARRATIVE_MANUAL_COOLDOWN_MS,
});

function nonNegativeInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function compactModeStats(byMode = {}) {
  const out = {};
  for (const [mode, stats] of Object.entries(byMode || {})) {
    if (!stats || Number(stats.total || 0) < 3) continue;
    out[mode] = {
      games: Number(stats.total || 0),
      wins: Number(stats.wins || 0),
      draws: Number(stats.draws || 0),
      losses: Number(stats.losses || 0),
      win_pct: Number(stats.winPct || 0),
    };
  }
  return out;
}

function compactPlayerModelTimeControls(timeControls = []) {
  return Object.fromEntries((Array.isArray(timeControls) ? timeControls : [])
    .filter((row) => Number(row?.games || 0) >= 3)
    .map((row) => [row.id, {
      games: Number(row.games || 0),
      wins: Number(row.wins || 0),
      draws: Number(row.draws || 0),
      losses: Number(row.losses || 0),
      win_pct: Number(row.winPct || 0),
      evidence_strength: row.confidence,
    }]));
}

function compactRecurringPatterns(patterns = []) {
  return (Array.isArray(patterns) ? patterns : [])
    .filter((pattern) => pattern?.incidentKey && nonNegativeInt(pattern?.positions) > 0)
    .slice(0, 5)
    .map((pattern) => {
      const row = {
        incident_key: String(pattern.incidentKey).slice(0, 80),
        label: String(pattern.label || pattern.incidentKey).slice(0, 120),
        positions: nonNegativeInt(pattern.positions),
        evidence_strength: String(pattern.confidence || 'none').slice(0, 24),
        improvement_state: String(pattern.improvementState || 'no-sample').slice(0, 64),
      };
      const debt = pattern.debt;
      if (debt && (debt.active === true || debt.paid === true || nonNegativeInt(debt.target) > 0)) {
        row.training_debt = {
          active: debt.active === true,
          paid: debt.paid === true,
          progress: nonNegativeInt(debt.progress),
          target: nonNegativeInt(debt.target),
        };
      }
      const observations = pattern.postTrainingObservations;
      if (observations?.latestCleanTrainingAt) {
        row.post_training = {
          observed_games: nonNegativeInt(observations.observedGames),
          recurrence_games: nonNegativeInt(observations.recurrenceGames),
          no_recurrence_games: nonNegativeInt(observations.noRecurrenceGames),
          latest_clean_training_at: String(observations.latestCleanTrainingAt).slice(0, 40),
          latest_observation_at: observations.latestObservationAt ? String(observations.latestObservationAt).slice(0, 40) : null,
        };
      }
      return row;
    });
}

function compactLearningEvidence(model) {
  const learning = {};
  const recurringPatterns = compactRecurringPatterns(model?.recurringErrors);
  if (recurringPatterns.length) learning.recurring_patterns = recurringPatterns;

  const progress = model?.trainingProgress;
  if (progress && (
    nonNegativeInt(progress.attempts) > 0
    || nonNegativeInt(progress.cleanSolves) > 0
    || nonNegativeInt(progress.activeDebts) > 0
    || nonNegativeInt(progress.paidDebts) > 0
  )) {
    learning.training_progress = {
      attempts: nonNegativeInt(progress.attempts),
      solves: nonNegativeInt(progress.solves),
      clean_solves: nonNegativeInt(progress.cleanSolves),
      attempted_positions: nonNegativeInt(progress.attemptedPositions),
      solved_positions: nonNegativeInt(progress.solvedPositions),
      currently_clean_positions: nonNegativeInt(progress.currentlyCleanPositions),
      retention_completed_positions: nonNegativeInt(progress.retentionCompletedPositions),
      retention_due_positions: nonNegativeInt(progress.retentionDuePositions),
      active_debts: nonNegativeInt(progress.activeDebts),
      paid_debts: nonNegativeInt(progress.paidDebts),
      last_attempt_at: progress.lastAttemptAt || null,
      last_clean_at: progress.lastCleanAt || null,
    };
  }

  const cleanPlay = model?.cleanPlay;
  if (nonNegativeInt(cleanPlay?.eligibleGames) > 0) {
    learning.clean_play = {
      eligible_games: nonNegativeInt(cleanPlay.eligibleGames),
      clean_games: nonNegativeInt(cleanPlay.cleanGames),
      clean_rate: finiteNumber(cleanPlay.cleanRate),
      current_streak: nonNegativeInt(cleanPlay.currentStreak),
      best_streak: nonNegativeInt(cleanPlay.bestStreak),
      latest_eligible_clean: cleanPlay.latestEligibleClean === true
        ? true
        : cleanPlay.latestEligibleClean === false
          ? false
          : null,
      latest_eligible_at: cleanPlay.latestEligibleAt || null,
      latest_clean_at: cleanPlay.latestCleanAt || null,
    };
  }

  const positive = model?.positiveDecisions;
  if (nonNegativeInt(positive?.comparedMoves) > 0) {
    learning.positive_decisions = {
      eligible_games: nonNegativeInt(positive.eligibleGames),
      compared_moves: nonNegativeInt(positive.comparedMoves),
      engine_preferred_moves: nonNegativeInt(positive.enginePreferredMoves),
      preferred_rate: finiteNumber(positive.preferredRate),
      games_with_preferred_moves: nonNegativeInt(positive.gamesWithPreferredMoves),
      latest_evidence_at: positive.latestEvidenceAt || null,
    };
  }

  return Object.keys(learning).length ? learning : null;
}

export function buildPlayerPortraitFacts(insights, rivalry = {}, extras = {}, worstMove = null, sharedPlayerModel = null) {
  const model = sharedPlayerModel?.samples
    ? sharedPlayerModel
    : buildPlayerModel({
      insights,
      timeControlStats: rivalry?.record?.byTimeControl,
    });
  if (model.samples.games <= 0) return null;

  const facts = {
    total_games: model.samples.games,
    evidence_strength: {
      games: model.confidence.games,
    },
    record: {
      wins: Number(model.outcomes?.wins || 0),
      draws: Number(model.outcomes?.draws || 0),
      losses: Number(model.outcomes?.losses || 0),
      win_pct: Number(model.outcomes?.winPct || 0),
    },
    color_usage: {
      white_games: Number(model.colorPreference?.white || 0),
      black_games: Number(model.colorPreference?.black || 0),
    },
    longest_win_streak: Number(insights.longestWinStreak || 0),
    human_captures: Number(insights.humanCaptures || 0),
    by_mode: compactModeStats(insights.byMode),
  };

  if (insights.favoriteOpening) {
    const openingEvidence = model.openings.find((row) => row.name === insights.favoriteOpening.name) || null;
    facts.favorite_opening = {
      name: String(insights.favoriteOpening.name || '').slice(0, 100),
      games: Number(insights.favoriteOpening.count || 0),
      evidence_strength: openingEvidence?.confidence || 'low',
    };
  }

  if (model.openings.length) {
    facts.openings = model.openings.slice(0, 5).map((row) => ({
      name: String(row.name || '').slice(0, 100),
      games: Number(row.games || 0),
      wins: Number(row.wins || 0),
      draws: Number(row.draws || 0),
      losses: Number(row.losses || 0),
      win_pct: Number(row.winPct || 0),
      evidence_strength: row.confidence,
    }));
  }

  if (model.ratingTrend) {
    facts.rating_trend = {
      first: finiteNumber(model.ratingTrend.first),
      last: finiteNumber(model.ratingTrend.last),
      delta: finiteNumber(model.ratingTrend.delta),
      min: finiteNumber(model.ratingTrend.min),
      max: finiteNumber(model.ratingTrend.max),
    };
  }

  if (rivalry?.record?.games) {
    facts.cpu_rivalry = {
      games: Number(rivalry.record.games || 0),
      wins: Number(rivalry.record.wins || 0),
      draws: Number(rivalry.record.draws || 0),
      losses: Number(rivalry.record.losses || 0),
      best_human_streak: Number(rivalry.record.bestHumanStreak || 0),
      best_cpu_streak: Number(rivalry.record.bestCpuStreak || 0),
    };
  }

  const timeControlFacts = compactPlayerModelTimeControls(model.timeControls);
  if (Object.keys(timeControlFacts).length) facts.by_time_control = timeControlFacts;

  const learningEvidence = compactLearningEvidence(model);
  if (learningEvidence) facts.learning_evidence = learningEvidence;

  const incidents = Object.entries(rivalry?.incidents || {})
    .filter(([, count]) => Number(count || 0) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 8)
    .map(([key, count]) => ({ key: String(key).slice(0, 80), count: Number(count || 0) }));
  if (incidents.length) facts.noteworthy_incidents = incidents;

  if (Number.isFinite(Number(extras.puzzlesSolved))) facts.puzzles_solved = Number(extras.puzzlesSolved);
  if (Number.isFinite(Number(extras.personalPuzzles))) facts.personal_training_positions = Number(extras.personalPuzzles);
  if (Number.isFinite(Number(extras.achievementsUnlocked))) facts.achievements_unlocked = Number(extras.achievementsUnlocked);
  if (Number.isFinite(Number(extras.achievementsTotal))) facts.achievements_total = Number(extras.achievementsTotal);

  const report = worstMove?.moveReport;
  if (report && Number.isFinite(Number(report.loss))) {
    facts.worst_recorded_move = {
      played: String(report.played || '').slice(0, 32),
      suggested: String(report.suggested || '').slice(0, 32),
      centipawn_loss: Number(report.loss),
    };
  }

  return facts;
}

export function playerPortraitGenerationKey(insights) {
  const games = Math.max(0, Number(insights?.totalGames || 0));
  return `${PORTRAIT_SCHEMA}:${Math.floor(games / GAMES_PER_AUTOMATIC_REFRESH)}`;
}

export function loadCachedPlayerPortrait(generationKey, identityScope) {
  return playerPortraitCache.load(generationKey, identityScope);
}

export function saveCachedPlayerPortrait(generationKey, text, identityScope) {
  return playerPortraitCache.save(generationKey, text, identityScope);
}

export function playerPortraitManualRefreshState(options = {}) {
  return playerPortraitCache.manualRefreshState(options);
}

export function shouldCommitManualPortraitRefresh(requestKind, text) {
  return playerPortraitCache.shouldCommitManualRefresh(requestKind, text);
}

export function markPlayerPortraitManualRefresh(options = {}) {
  return playerPortraitCache.markManualRefresh(options);
}

export function formatPlayerPortraitCooldown(ms) {
  return formatAiNarrativeCooldown(ms);
}

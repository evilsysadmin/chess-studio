import { loadGameActivity } from './gameActivity.js';
import {
  PROVISIONAL_GAMES,
  cpuRatingForDifficulty,
  difficultyForCpuRating,
  loadRating,
} from './playerRating.js';

export const QUICK_MATCH_TARGET_LEAD_ELO = 50;
export const QUICK_MATCH_HYSTERESIS_ELO = 25;
export const QUICK_MATCH_PROVISIONAL_START_LEAD_ELO = -50;
const QUICK_MATCH_RECENT_GAMES = 8;
const QUICK_MATCH_ABANDON_SCORE = 0.15;
const QUICK_MATCH_MAX_FORM_BOOST_ELO = 25;
const QUICK_MATCH_MAX_FORM_RELIEF_ELO = -50;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function provisionalQuickMatchLeadElo(games = PROVISIONAL_GAMES) {
  const count = Number(games);
  if (!Number.isFinite(count) || count >= PROVISIONAL_GAMES) return QUICK_MATCH_TARGET_LEAD_ELO;
  const progress = clamp(count / PROVISIONAL_GAMES, 0, 1);
  return Math.round(
    QUICK_MATCH_PROVISIONAL_START_LEAD_ELO
      + ((QUICK_MATCH_TARGET_LEAD_ELO - QUICK_MATCH_PROVISIONAL_START_LEAD_ELO) * progress),
  );
}

function recentAdaptiveResults(activity = []) {
  const rows = Array.isArray(activity) ? activity : [];
  const starts = new Map(
    rows
      .filter((event) => event?.state === 'started' && event?.detail === 'adaptive-difficulty')
      .filter((event) => ['casual', 'tournament'].includes(event?.mode))
      .map((event) => [event.gameId, event]),
  );

  return rows
    .map((event) => {
      const started = starts.get(event?.gameId);
      if (!started) return null;
      if (event?.state === 'finished' && ['win', 'draw', 'loss'].includes(event?.outcome)) {
        return { ...event, difficulty: Number(event?.difficulty ?? started?.difficulty) };
      }
      if (event?.state === 'cancelled') {
        return {
          ...event,
          outcome: 'loss',
          adaptiveAbandon: true,
          difficulty: Number(event?.difficulty ?? started?.difficulty),
        };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, QUICK_MATCH_RECENT_GAMES);
}

function resultScore(event) {
  if (event?.adaptiveAbandon) return QUICK_MATCH_ABANDON_SCORE;
  if (event?.outcome === 'win') return 1;
  if (event?.outcome === 'draw') return 0.5;
  return 0;
}

export function quickMatchRecentFormAdjustment(activity = [], games = PROVISIONAL_GAMES) {
  const recent = recentAdaptiveResults(activity);
  if (!recent.length) return 0;

  const provisional = Number(games) < PROVISIONAL_GAMES;
  let lossStreak = 0;
  for (const event of recent) {
    if (event.outcome !== 'loss') break;
    lossStreak += 1;
  }

  if (recent.length < 3 && !provisional) return 0;
  if (recent.length === 1) return lossStreak ? -25 : 0;
  if (recent.length === 2) return lossStreak >= 2 ? -40 : 0;

  let weightedScore = 0;
  let weightTotal = 0;
  recent.forEach((event, index) => {
    const weight = Math.max(1, recent.length - index);
    weightedScore += resultScore(event) * weight;
    weightTotal += weight;
  });
  const performance = weightTotal ? weightedScore / weightTotal : 0.5;

  let adjustment = 0;
  if (performance <= 0.20) adjustment = -50;
  else if (performance <= 0.35) adjustment = -35;
  else if (performance <= 0.45) adjustment = -20;
  else if (performance >= 0.80) adjustment = 25;
  else if (performance >= 0.68) adjustment = 10;

  if (lossStreak >= 5) adjustment -= 20;
  else if (lossStreak >= 4) adjustment -= 15;
  else if (lossStreak >= 3) adjustment -= 10;

  return clamp(adjustment, QUICK_MATCH_MAX_FORM_RELIEF_ELO, QUICK_MATCH_MAX_FORM_BOOST_ELO);
}

export function quickMatchTargetLeadElo(activity = [], games = PROVISIONAL_GAMES) {
  const provisional = Number(games) < PROVISIONAL_GAMES;
  const baseLead = provisional
    ? provisionalQuickMatchLeadElo(games)
    : QUICK_MATCH_TARGET_LEAD_ELO;
  const adjusted = baseLead + quickMatchRecentFormAdjustment(activity, games);
  return provisional
    ? clamp(adjusted, -75, QUICK_MATCH_TARGET_LEAD_ELO)
    : clamp(adjusted, 0, QUICK_MATCH_TARGET_LEAD_ELO + QUICK_MATCH_MAX_FORM_BOOST_ELO);
}

function previousAdaptiveDifficulty(activity = []) {
  const event = (Array.isArray(activity) ? activity : []).find(
    (row) => row?.state === 'started'
      && row?.detail === 'adaptive-difficulty'
      && ['casual', 'tournament'].includes(row?.mode)
      && Number.isFinite(Number(row?.difficulty)),
  );
  return event ? clamp(Math.round(Number(event.difficulty)), 0, 100) : null;
}

export function difficultyForQuickMatchRating(rating, activity = null, games = null) {
  const numericRating = Number(rating);
  const playerRating = Number.isFinite(numericRating) ? numericRating : 400;
  const recent = activity == null ? loadGameActivity() : activity;
  const persistedGames = games == null ? loadRating().games : games;
  const gameCount = Number.isFinite(Number(persistedGames)) ? Number(persistedGames) : 0;
  const targetLead = quickMatchTargetLeadElo(recent, gameCount);
  const targetOpponentRating = playerRating + targetLead;

  if (gameCount >= PROVISIONAL_GAMES) {
    const previous = previousAdaptiveDifficulty(recent);
    if (previous != null) {
      const previousOpponentRating = cpuRatingForDifficulty(previous);
      if (Math.abs(previousOpponentRating - targetOpponentRating) <= QUICK_MATCH_HYSTERESIS_ELO) {
        return previous;
      }
    }
  }

  return difficultyForCpuRating(targetOpponentRating);
}


export function quickMatchRecalibration(previousDifficulty, rating, activity = null, games = null) {
  const rawPrevious = Number(previousDifficulty);
  const rawRating = Number(rating);
  if (!Number.isFinite(rawPrevious) || !Number.isFinite(rawRating)) return null;

  const previous = clamp(Math.round(rawPrevious), 0, 100);
  const playerRating = rawRating;
  const nextDifficulty = difficultyForQuickMatchRating(playerRating, activity, games);
  if (nextDifficulty === previous) return null;

  const previousOpponentRating = cpuRatingForDifficulty(previous);
  const opponentRating = cpuRatingForDifficulty(nextDifficulty);
  const deltaOpponentElo = opponentRating - previousOpponentRating;
  if (Math.abs(deltaOpponentElo) < QUICK_MATCH_HYSTERESIS_ELO) return null;

  return {
    difficulty: nextDifficulty,
    opponentRating,
    leadElo: opponentRating - playerRating,
    deltaOpponentElo,
  };
}

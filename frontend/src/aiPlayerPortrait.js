import { STORAGE_LOCAL, readJsonStorage, writeJsonStorage } from './safeStorage.js';

export const AI_PLAYER_PORTRAIT_CACHE_KEY = 'chess-study-ai-player-portrait-v1';
const PORTRAIT_SCHEMA = 2;
const GAMES_PER_AUTOMATIC_REFRESH = 3;
export const PLAYER_PORTRAIT_MAX_CHARS = 900;
export const PLAYER_PORTRAIT_MANUAL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

export function buildPlayerPortraitFacts(insights, rivalry = {}, extras = {}, worstMove = null) {
  if (!insights || Number(insights.totalGames || 0) <= 0) return null;

  const facts = {
    total_games: Number(insights.totalGames || 0),
    record: {
      wins: Number(insights.overall?.wins || 0),
      draws: Number(insights.overall?.draws || 0),
      losses: Number(insights.overall?.losses || 0),
      win_pct: Number(insights.overall?.winPct || 0),
    },
    color_usage: {
      white_games: Number(insights.colorPreference?.white || 0),
      black_games: Number(insights.colorPreference?.black || 0),
    },
    longest_win_streak: Number(insights.longestWinStreak || 0),
    human_captures: Number(insights.humanCaptures || 0),
    by_mode: compactModeStats(insights.byMode),
  };

  if (insights.favoriteOpening) {
    facts.favorite_opening = {
      name: String(insights.favoriteOpening.name || '').slice(0, 100),
      games: Number(insights.favoriteOpening.count || 0),
    };
  }

  if (Array.isArray(insights.openingDossier) && insights.openingDossier.length) {
    facts.openings = insights.openingDossier.slice(0, 5).map((row) => ({
      name: String(row.name || '').slice(0, 100),
      games: Number(row.games || 0),
      wins: Number(row.wins || 0),
      draws: Number(row.draws || 0),
      losses: Number(row.losses || 0),
      win_pct: Number(row.winPct || 0),
    }));
  }

  if (insights.ratingTrend) {
    facts.rating_trend = {
      first: finiteNumber(insights.ratingTrend.first),
      last: finiteNumber(insights.ratingTrend.last),
      delta: finiteNumber(insights.ratingTrend.delta),
      min: finiteNumber(insights.ratingTrend.min),
      max: finiteNumber(insights.ratingTrend.max),
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

function readPortraitCache() {
  const cached = readJsonStorage(STORAGE_LOCAL, AI_PLAYER_PORTRAIT_CACHE_KEY, { fallback: null, removeMalformed: true });
  return cached && cached.schema === PORTRAIT_SCHEMA && typeof cached === 'object' ? cached : null;
}

export function loadCachedPlayerPortrait(generationKey) {
  const cached = readPortraitCache();
  if (!cached || cached.generationKey !== generationKey) return null;
  if (typeof cached.text !== 'string' || !cached.text.trim()) return null;
  return cached.text.trim().slice(0, PLAYER_PORTRAIT_MAX_CHARS);
}

export function saveCachedPlayerPortrait(generationKey, text) {
  const clean = typeof text === 'string' ? text.trim().slice(0, PLAYER_PORTRAIT_MAX_CHARS) : '';
  if (!clean) return false;
  const previous = readPortraitCache() || {};
  return writeJsonStorage(STORAGE_LOCAL, AI_PLAYER_PORTRAIT_CACHE_KEY, {
    schema: PORTRAIT_SCHEMA,
    generationKey,
    text: clean,
    generatedAt: new Date().toISOString(),
    ...(Number.isFinite(Number(previous.manualRequestedAt)) ? { manualRequestedAt: Number(previous.manualRequestedAt) } : {}),
  });
}

export function playerPortraitManualRefreshState({ now = Date.now() } = {}) {
  const cached = readPortraitCache();
  const last = Number(cached?.manualRequestedAt);
  if (!Number.isFinite(last) || last <= 0) {
    return { allowed: true, retryAfterMs: 0, nextAllowedAt: null };
  }
  const remaining = Math.max(0, PLAYER_PORTRAIT_MANUAL_COOLDOWN_MS - (Number(now) - last));
  return {
    allowed: remaining <= 0,
    retryAfterMs: remaining,
    nextAllowedAt: remaining > 0 ? last + PLAYER_PORTRAIT_MANUAL_COOLDOWN_MS : null,
  };
}

export function markPlayerPortraitManualRefresh({ now = Date.now() } = {}) {
  const previous = readPortraitCache() || {};
  return writeJsonStorage(STORAGE_LOCAL, AI_PLAYER_PORTRAIT_CACHE_KEY, {
    ...previous,
    schema: PORTRAIT_SCHEMA,
    manualRequestedAt: Number(now),
  });
}

export function formatPlayerPortraitCooldown(ms) {
  const totalMinutes = Math.max(1, Math.ceil(Number(ms || 0) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

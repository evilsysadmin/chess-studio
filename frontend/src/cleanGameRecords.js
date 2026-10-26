import { STORAGE_LOCAL, readJsonStorage } from './safeStorage.js';

export const CLEAN_GAMES_KEY = 'chess-study-clean-games-v1';

function safeRecords() {
  const parsed = readJsonStorage(STORAGE_LOCAL, CLEAN_GAMES_KEY, { fallback: {} });
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}


export function loadCleanGameRecords() {
  return safeRecords();
}

export const CLEAN_GAME_MIN_ANALYZED_MOVES = 8;
export const CLEAN_GAME_INCIDENT_COVERAGE_VERSION = 1;
export const CLEAN_GAME_POSITIVE_EVIDENCE_VERSION = 1;

export function cleanGameSummary(records = loadCleanGameRecords()) {
  const eligible = Object.values(records || {})
    .filter((row) => row?.version === 1 && row.sufficientSample === true)
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  const clean = eligible.filter((row) => row.clean === true);
  let currentStreak = 0;
  for (let i = eligible.length - 1; i >= 0 && eligible[i].clean; i -= 1) currentStreak += 1;
  let bestStreak = 0;
  let running = 0;
  for (const row of eligible) {
    running = row.clean ? running + 1 : 0;
    bestStreak = Math.max(bestStreak, running);
  }
  return {
    eligible: eligible.length,
    clean: clean.length,
    rate: eligible.length ? Math.round(clean.length / eligible.length * 100) : null,
    currentStreak,
    bestStreak,
    latest: eligible.at(-1) || null,
    latestClean: [...clean].reverse()[0] || null,
  };
}

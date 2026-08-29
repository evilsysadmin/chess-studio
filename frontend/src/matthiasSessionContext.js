import { STORAGE_SESSION, readJsonStorage, writeJsonStorage, removeStorageItem } from './safeStorage.js';

export const MATTHIAS_SESSION_CONTEXT_KEY = 'chess-study-matthias-session-context-v1';
const MAX_FINISHED_IDS = 24;
const MAX_OUTCOMES = 8;

function emptyContext() {
  return { games: 0, wins: 0, draws: 0, losses: 0, recentOutcomes: [], finishedGameIds: [] };
}

function cleanContext(value) {
  const row = value && typeof value === 'object' ? value : {};
  return {
    games: Math.max(0, Number(row.games) || 0),
    wins: Math.max(0, Number(row.wins) || 0),
    draws: Math.max(0, Number(row.draws) || 0),
    losses: Math.max(0, Number(row.losses) || 0),
    recentOutcomes: Array.isArray(row.recentOutcomes) ? row.recentOutcomes.filter((v) => ['win', 'draw', 'loss'].includes(v)).slice(-MAX_OUTCOMES) : [],
    finishedGameIds: Array.isArray(row.finishedGameIds) ? row.finishedGameIds.filter((v) => typeof v === 'string').slice(-MAX_FINISHED_IDS) : [],
  };
}

export function matthiasSessionContext() {
  return cleanContext(readJsonStorage(STORAGE_SESSION, MATTHIAS_SESSION_CONTEXT_KEY, { fallback: null }));
}

export function recordMatthiasSessionResult({ gameId, outcome } = {}) {
  if (!gameId || !['win', 'draw', 'loss'].includes(outcome)) return matthiasSessionContext();
  const current = matthiasSessionContext();
  if (current.finishedGameIds.includes(String(gameId))) return current;
  const next = {
    ...current,
    games: current.games + 1,
    wins: current.wins + (outcome === 'win' ? 1 : 0),
    draws: current.draws + (outcome === 'draw' ? 1 : 0),
    losses: current.losses + (outcome === 'loss' ? 1 : 0),
    recentOutcomes: [...current.recentOutcomes, outcome].slice(-MAX_OUTCOMES),
    finishedGameIds: [...current.finishedGameIds, String(gameId)].slice(-MAX_FINISHED_IDS),
  };
  writeJsonStorage(STORAGE_SESSION, MATTHIAS_SESSION_CONTEXT_KEY, next);
  return next;
}

export function clearMatthiasSessionContext() {
  removeStorageItem(STORAGE_SESSION, MATTHIAS_SESSION_CONTEXT_KEY);
}

export function matthiasSessionLabel(context = null) {
  const row = cleanContext(context);
  if (!row.games) return null;
  const result = `${row.wins}V · ${row.draws}T · ${row.losses}D`;
  return `Sesión · ${row.games} partida${row.games === 1 ? '' : 's'} · ${result}`;
}

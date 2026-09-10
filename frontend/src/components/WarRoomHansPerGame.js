import {
  STORAGE_LOCAL,
  readJsonStorage,
  writeJsonStorage,
} from '../safeStorage.js';

// Legacy `chess-study-war-room-hans-seen-games-v1` was written as soon as Hans
// entered the viewport, so it can contain false positives from interrupted
// fireplace numbers. Do not migrate that poisoned state: this replacement key
// is written only after the narrative reaches its real terminal callback.
export const WAR_ROOM_HANS_COMPLETED_GAMES_KEY = 'chess-study-war-room-hans-completed-games-v1';
const MAX_REMEMBERED_GAMES = 32;

function normalizeGameId(gameId) {
  const value = String(gameId ?? '').trim();
  return value || null;
}

function loadCompletedGameIds() {
  const stored = readJsonStorage(STORAGE_LOCAL, WAR_ROOM_HANS_COMPLETED_GAMES_KEY, { fallback: [] });
  if (!Array.isArray(stored)) return [];
  return stored
    .map(normalizeGameId)
    .filter(Boolean)
    .slice(-MAX_REMEMBERED_GAMES);
}

export function hasWarRoomHansCompletedForGame(gameId) {
  const normalized = normalizeGameId(gameId);
  if (!normalized) return false;
  return loadCompletedGameIds().includes(normalized);
}

export function markWarRoomHansCompletedForGame(gameId) {
  const normalized = normalizeGameId(gameId);
  if (!normalized) return false;

  const completed = loadCompletedGameIds();
  if (completed.includes(normalized)) return false;

  const next = [...completed.filter((id) => id !== normalized), normalized].slice(-MAX_REMEMBERED_GAMES);
  writeJsonStorage(STORAGE_LOCAL, WAR_ROOM_HANS_COMPLETED_GAMES_KEY, next);
  return true;
}

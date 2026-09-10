import {
  STORAGE_LOCAL,
  readJsonStorage,
  writeJsonStorage,
} from '../safeStorage.js';

// v1 `seen-games` was written as soon as Hans entered the viewport, so it can
// contain false positives from interrupted fireplace numbers. Do not migrate
// that poisoned state: the replacement key is written only after the narrative
// reaches its real terminal callback.
export const WAR_ROOM_HANS_SEEN_GAMES_KEY = 'chess-study-war-room-hans-completed-games-v1';
const MAX_REMEMBERED_GAMES = 32;

function normalizeGameId(gameId) {
  const value = String(gameId ?? '').trim();
  return value || null;
}

function loadSeenGameIds() {
  const stored = readJsonStorage(STORAGE_LOCAL, WAR_ROOM_HANS_SEEN_GAMES_KEY, { fallback: [] });
  if (!Array.isArray(stored)) return [];
  return stored
    .map(normalizeGameId)
    .filter(Boolean)
    .slice(-MAX_REMEMBERED_GAMES);
}

export function hasWarRoomHansAppearedForGame(gameId) {
  const normalized = normalizeGameId(gameId);
  if (!normalized) return false;
  return loadSeenGameIds().includes(normalized);
}

export function markWarRoomHansAppearedForGame(gameId) {
  const normalized = normalizeGameId(gameId);
  if (!normalized) return false;

  const seen = loadSeenGameIds();
  if (seen.includes(normalized)) return false;

  const next = [...seen.filter((id) => id !== normalized), normalized].slice(-MAX_REMEMBERED_GAMES);
  writeJsonStorage(STORAGE_LOCAL, WAR_ROOM_HANS_SEEN_GAMES_KEY, next);
  return true;
}

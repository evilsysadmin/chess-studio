import {
  STORAGE_LOCAL,
  readJsonStorage,
  writeJsonStorage,
} from '../safeStorage.js';

export const WAR_ROOM_HANS_SEEN_GAMES_KEY = 'chess-study-war-room-hans-seen-games-v1';
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

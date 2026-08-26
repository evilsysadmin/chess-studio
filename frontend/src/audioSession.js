import {
  STORAGE_LOCAL,
  STORAGE_SESSION,
  readJsonStorage,
  removeStorageItem,
  setStorageItem,
  writeJsonStorage,
} from './safeStorage.js';

export const LEGACY_AMBIENT_THEME_KEY = 'chess-study-ambient-theme';
export const AMBIENT_THEME_SESSION_KEY = 'chess-study-ambient-theme-session';
export const AMBIENT_PLAYBACK_SESSION_KEY = 'chess-study-ambient-playback-session-v1';
const FRESH_AMBIENT_THEME_MARKER = '__fresh__';
const VALID_PLAYBACK_STATUSES = new Set(['playing', 'paused', 'stopped']);

export function markAmbientThemeSessionFresh() {
  setStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY, FRESH_AMBIENT_THEME_MARKER);
  removeStorageItem(STORAGE_SESSION, AMBIENT_PLAYBACK_SESSION_KEY);
  removeStorageItem(STORAGE_LOCAL, LEGACY_AMBIENT_THEME_KEY);
}

export function clearAmbientThemeSessionStorage() {
  removeStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY);
  removeStorageItem(STORAGE_SESSION, AMBIENT_PLAYBACK_SESSION_KEY);
}

export function writeAmbientPlaybackSession({ status, themeId, positionMs = 0, savedAtMs = Date.now() } = {}) {
  const normalizedStatus = VALID_PLAYBACK_STATUSES.has(status) ? status : 'stopped';
  const normalizedThemeId = typeof themeId === 'string' && themeId.trim() ? themeId : null;
  const normalizedPosition = Math.max(0, Number(positionMs) || 0);
  const normalizedSavedAt = Math.max(0, Number(savedAtMs) || Date.now());
  return writeJsonStorage(STORAGE_SESSION, AMBIENT_PLAYBACK_SESSION_KEY, {
    status: normalizedStatus,
    themeId: normalizedThemeId,
    positionMs: normalizedPosition,
    savedAtMs: normalizedSavedAt,
  });
}

export function readAmbientPlaybackSession({ now = Date.now() } = {}) {
  const value = readJsonStorage(STORAGE_SESSION, AMBIENT_PLAYBACK_SESSION_KEY, {
    fallback: null,
    removeMalformed: true,
  });
  if (!value || typeof value !== 'object' || !VALID_PLAYBACK_STATUSES.has(value.status)) return null;

  const themeId = typeof value.themeId === 'string' && value.themeId.trim() ? value.themeId : null;
  const savedAtMs = Math.max(0, Number(value.savedAtMs) || 0);
  let positionMs = Math.max(0, Number(value.positionMs) || 0);
  if (value.status === 'playing' && savedAtMs > 0) {
    positionMs += Math.max(0, Number(now) - savedAtMs);
  }
  return {
    status: value.status,
    themeId,
    positionMs,
    savedAtMs,
    shouldPlay: value.status === 'playing',
  };
}

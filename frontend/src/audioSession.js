import { STORAGE_LOCAL, STORAGE_SESSION, setStorageItem, removeStorageItem } from './safeStorage.js';
export const LEGACY_AMBIENT_THEME_KEY = 'chess-study-ambient-theme';
export const AMBIENT_THEME_SESSION_KEY = 'chess-study-ambient-theme-session';
const FRESH_AMBIENT_THEME_MARKER = '__fresh__';

export function markAmbientThemeSessionFresh() {
  setStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY, FRESH_AMBIENT_THEME_MARKER);
  removeStorageItem(STORAGE_LOCAL, LEGACY_AMBIENT_THEME_KEY);
}

export function clearAmbientThemeSessionStorage() {
  removeStorageItem(STORAGE_SESSION, AMBIENT_THEME_SESSION_KEY);
}

// Recovery-only descriptor: personal puzzle bank still owns position and scoring.
// No auth import: auth imports viewState on app startup.
import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';

export const FOCUSED_PUZZLE_RESUME_KEY = 'chess-study-focused-puzzle-resume-v1';
export const PERSONAL_PUZZLE_FOCUS_KEY = 'chess-study-personal-puzzle-focus';
const OWNER_KEY = 'chess-study-auth-username';
const ORIGINS = new Set(['insights-action', 'postgame-error']);
const FILTER_KEYS = new Set(['incidentKey', 'opening', 'label']);

const owner = () => String(getStorageItem(STORAGE_LOCAL, OWNER_KEY) || '').trim().toLowerCase();
function valid(value, now) {
  const filter = value?.filter;
  return Boolean(owner() && value?.version === 1 && value.owner === owner()
    && ORIGINS.has(value.origin) && typeof value.puzzleId === 'string'
    && value.puzzleId.trim() && value.puzzleId.length <= 160
    && (filter == null || (typeof filter === 'object' && !Array.isArray(filter)
      && Object.entries(filter).every(([key, entry]) => FILTER_KEYS.has(key)
        && typeof entry === 'string' && entry.length > 0 && entry.length <= 160)))
    && Number.isFinite(value.savedAt) && value.savedAt > 0
    && now - value.savedAt <= 4 * 60 * 60 * 1000 && value.savedAt - now <= 60_000);
}
export function saveFocusedPuzzleResume({ puzzleId, origin, filter = null } = {}, { now = Date.now() } = {}) {
  const value = { version: 1, owner: owner(), puzzleId, origin, filter, savedAt: now };
  return valid(value, now) && writeJsonStorage(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY, value) ? value : null;
}
export function loadFocusedPuzzleResume({ now = Date.now() } = {}) {
  const value = readJsonStorage(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY, { fallback: null, removeMalformed: true });
  if (valid(value, now)) return value;
  removeStorageItem(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY);
  return null;
}
export function clearFocusedPuzzleResume() {
  removeStorageItem(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY);
}

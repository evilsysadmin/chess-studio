// Only the identity of a focused personal exercise is recoverable after F5.
// The factual FEN, solution and scoring remain owned by the personal puzzle bank.
// Keep this module lightweight: viewState is loaded during authentication.
import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';

export const FOCUSED_PUZZLE_RESUME_KEY = 'chess-study-focused-puzzle-resume-v1';
export const PERSONAL_PUZZLE_FOCUS_KEY = 'chess-study-personal-puzzle-focus';
const USERNAME_KEY = 'chess-study-auth-username'; // auth imports viewState; do not create an import cycle.
const MAX_AGE_MS = 4 * 60 * 60 * 1000;
const ORIGINS = new Set(['insights-action', 'postgame-error']);
const FILTER_KEYS = new Set(['incidentKey', 'opening', 'label']);

function owner() {
  return String(getStorageItem(STORAGE_LOCAL, USERNAME_KEY) || '').trim().toLowerCase() || null;
}

function validFilter(filter) {
  if (filter === null) return true;
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return false;
  return Object.entries(filter).every(([key, value]) =>
    FILTER_KEYS.has(key) && typeof value === 'string' && value.length > 0 && value.length <= 160);
}

function normalize(value, now) {
  const currentOwner = owner();
  if (!currentOwner || !value || value.version !== 1 || value.owner !== currentOwner
    || !ORIGINS.has(value.origin) || typeof value.puzzleId !== 'string'
    || !value.puzzleId.trim() || value.puzzleId.length > 160 || !validFilter(value.filter ?? null)
    || !Number.isFinite(value.savedAt) || value.savedAt <= 0
    || now - value.savedAt > MAX_AGE_MS || value.savedAt - now > 60_000) return null;
  return {
    version: 1, owner: currentOwner, origin: value.origin, puzzleId: value.puzzleId,
    filter: value.filter ?? null, savedAt: value.savedAt,
  };
}

export function saveFocusedPuzzleResume({ puzzleId, origin, filter = null } = {}, { now = Date.now() } = {}) {
  const candidate = normalize({ version: 1, owner: owner(), origin, puzzleId, filter, savedAt: Number(now) }, Number(now));
  if (!candidate) return null;
  return writeJsonStorage(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY, candidate) ? candidate : null;
}

export function loadFocusedPuzzleResume({ now = Date.now() } = {}) {
  const candidate = readJsonStorage(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY, { fallback: null, removeMalformed: true });
  const validated = normalize(candidate, Number(now));
  if (!validated) removeStorageItem(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY);
  return validated;
}

export function clearFocusedPuzzleResume() {
  removeStorageItem(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY);
}

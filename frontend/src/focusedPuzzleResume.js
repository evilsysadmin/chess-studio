// Recovery only: the personal puzzle bank still owns FEN, scoring and solution.
// Loaded with PuzzleScreen, never during initial app bootstrap.
import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, writeJsonStorage } from './safeStorage.js';
import {
  FOCUSED_PUZZLE_RESUME_KEY, clearFocusedPuzzleResume,
  loadFocusedPuzzleResume as loadFocusedPuzzleSnapshot,
} from './viewState.js';
export { FOCUSED_PUZZLE_RESUME_KEY, clearFocusedPuzzleResume } from './viewState.js';

export function loadFocusedPuzzleResume({ now = Date.now() } = {}) {
  const snapshot = loadFocusedPuzzleSnapshot();
  if (snapshot && typeof snapshot.puzzleId === 'string' && snapshot.puzzleId.length <= 160
    && Number.isFinite(snapshot.savedAt) && snapshot.savedAt > 0
    && now - snapshot.savedAt <= 14_400_000 && snapshot.savedAt - now <= 60_000
    && validFocusedPuzzleFilter(snapshot.filter)) return snapshot;
  clearFocusedPuzzleResume();
  return null;
}

export function validFocusedPuzzleFilter(filter) {
  return filter == null || (typeof filter === 'object' && !Array.isArray(filter)
    && Object.entries(filter).every(([key, field]) => ['incidentKey', 'opening', 'label'].includes(key)
      && typeof field === 'string' && field.length > 0 && field.length <= 160));
}

export function saveFocusedPuzzleResume({ puzzleId, origin, filter = null } = {}, { now = Date.now() } = {}) {
  const owner = String(getStorageItem(STORAGE_LOCAL, 'chess-study-auth-username') || '').trim().toLowerCase();
  if (!owner || typeof puzzleId !== 'string' || !puzzleId.trim() || puzzleId.length > 160
    || !['insights-action', 'postgame-error'].includes(origin)
    || !Number.isFinite(now) || now <= 0 || !validFocusedPuzzleFilter(filter)) return null;
  const saved = { version: 1, owner, puzzleId, origin, filter, savedAt: now };
  return writeJsonStorage(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY, saved) ? saved : null;
}

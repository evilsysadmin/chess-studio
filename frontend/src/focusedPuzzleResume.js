// Recovery only: the personal puzzle bank still owns FEN, scoring and solution.
// Loaded with PuzzleScreen, never during initial app bootstrap.
import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, writeJsonStorage } from './safeStorage.js';
import { FOCUSED_PUZZLE_RESUME_KEY } from './viewState.js';
export { FOCUSED_PUZZLE_RESUME_KEY, clearFocusedPuzzleResume, loadFocusedPuzzleResume } from './viewState.js';

export function saveFocusedPuzzleResume({ puzzleId, origin, filter = null } = {}, { now = Date.now() } = {}) {
  const owner = String(getStorageItem(STORAGE_LOCAL, 'chess-study-auth-username') || '').trim().toLowerCase();
  if (!owner || typeof puzzleId !== 'string' || !puzzleId.trim() || puzzleId.length > 160
    || !['insights-action', 'postgame-error'].includes(origin)
    || !Number.isFinite(now) || now <= 0
    || (filter != null && (typeof filter !== 'object' || Array.isArray(filter)
      || !Object.entries(filter).every(([key, field]) => ['incidentKey', 'opening', 'label'].includes(key)
        && typeof field === 'string' && field.length > 0 && field.length <= 160)))) return null;
  const saved = { version: 1, owner, puzzleId, origin, filter, savedAt: now };
  return writeJsonStorage(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY, saved) ? saved : null;
}

// Recovery only: the personal puzzle bank still owns FEN, scoring and solution.
// Loaded with PuzzleScreen, never during initial app bootstrap.
import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, writeJsonStorage } from './safeStorage.js';
import { FOCUSED_PUZZLE_RESUME_KEY, clearFocusedPuzzleResume } from './viewState.js';
import { readJsonStorage } from './safeStorage.js';
import { applyPuzzleSolutionMove } from './puzzleMoveValidation.js';
export { FOCUSED_PUZZLE_RESUME_KEY, clearFocusedPuzzleResume } from './viewState.js';

export function loadFocusedPuzzleResume({ now = Date.now() } = {}) {
  const snapshot = readJsonStorage(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY);
  const owner = String(getStorageItem(STORAGE_LOCAL, 'chess-study-auth-username') || '').trim().toLowerCase();
  if (owner && snapshot?.version === 1 && snapshot.owner === owner
    && ['insights-action', 'postgame-error'].includes(snapshot.origin)
    && typeof snapshot.puzzleId === 'string' && snapshot.puzzleId.trim() && snapshot.puzzleId.length <= 160
    && Number.isFinite(snapshot.savedAt) && snapshot.savedAt > 0
    && now - snapshot.savedAt <= 14_400_000 && snapshot.savedAt - now <= 60_000
    && validFocusedPuzzleFilter(snapshot.filter)
    // v1 descriptors without a ply belong to the original start-only format.
    && validFocusedPuzzlePly(snapshot.ply ?? 0)) return snapshot;
  clearFocusedPuzzleResume();
  return null;
}

export function validFocusedPuzzleFilter(filter) {
  return filter == null || (typeof filter === 'object' && !Array.isArray(filter)
    && Object.entries(filter).every(([key, field]) => ['incidentKey', 'opening', 'label'].includes(key)
      && typeof field === 'string' && field.length > 0 && field.length <= 160));
}

export function validFocusedPuzzlePly(ply) {
  return Number.isInteger(ply) && ply >= 0 && ply <= 256 && ply % 2 === 0;
}

// This is recovery metadata, NOT a second source of position truth. Rebuild
// the board exclusively from the validated puzzle's original FEN and SAN line.
export function rebuildFocusedPuzzleProgress(puzzle, snapshot) {
  const ply = snapshot?.ply ?? 0;
  if (!puzzle?.fen || !Array.isArray(puzzle.solution) || !validFocusedPuzzlePly(ply)
    || ply >= puzzle.solution.length) return null;
  let fen = puzzle.fen;
  for (let index = 0; index < ply; index += 1) {
    const next = applyPuzzleSolutionMove(fen, puzzle.solution[index]);
    if (!next) return null;
    fen = next.fen;
  }
  return { fen, stepIndex: ply };
}

export function saveFocusedPuzzleResume({ puzzleId, origin, filter = null, ply = 0 } = {}, { now = Date.now() } = {}) {
  const owner = String(getStorageItem(STORAGE_LOCAL, 'chess-study-auth-username') || '').trim().toLowerCase();
  if (!owner || typeof puzzleId !== 'string' || !puzzleId.trim() || puzzleId.length > 160
    || !['insights-action', 'postgame-error'].includes(origin)
    || !Number.isFinite(now) || now <= 0 || !validFocusedPuzzleFilter(filter)
    || !validFocusedPuzzlePly(ply)) return null;
  const saved = { version: 1, owner, puzzleId, origin, filter, ply, savedAt: now };
  return writeJsonStorage(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY, saved) ? saved : null;
}

import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, readJsonStorage, removeStorageItem, setStorageItem, writeJsonStorage } from './safeStorage.js';
import { MAX_VIEW_HISTORY } from './viewNavigationContract.js';
// Minimal pre-login/F5 reader. The write path lives with lazy PuzzleScreen.
export const FOCUSED_PUZZLE_RESUME_KEY = 'chess-study-focused-puzzle-resume-v1';
export function loadFocusedPuzzleResume({ now = Date.now() } = {}) {
  const value = readJsonStorage(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY, { fallback: null, removeMalformed: true });
  const owner = String(getStorageItem(STORAGE_LOCAL, 'chess-study-auth-username') || '').trim().toLowerCase();
  if (owner && value?.version === 1 && value.owner === owner
    && ['insights-action', 'postgame-error'].includes(value.origin)
    && typeof value.puzzleId === 'string' && value.puzzleId.trim()
    && Number.isFinite(value.savedAt) && value.savedAt > 0
    && now - value.savedAt <= 4 * 60 * 60 * 1000 && value.savedAt - now <= 60_000) return value;
  removeStorageItem(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY);
  return null;
}
export function clearFocusedPuzzleResume() {
  removeStorageItem(STORAGE_SESSION, FOCUSED_PUZZLE_RESUME_KEY);
}

// viewState.js — navegación de sesión resistente a refresh y con historial.
// Solo persistimos pantallas que pueden reconstruirse únicamente desde el
// perfil/caché ya cargados. Las vistas efímeras (partida/replay) sí pueden
// existir en el back-stack mientras la app está viva, pero no se restauran
// después de un refresh porque necesitan objetos React adicionales.

export const VIEW_STORAGE_KEY = 'chess-study-current-view';
export const VIEW_HISTORY_STORAGE_KEY = 'chess-study-view-history';

const RESTORABLE_VIEWS = Object.freeze([
  'menu',
  'tutorial',
  'openings',
  'tournament',
  'spectator',
  'combat',
  'roguelike',
  'admin',
  'history',
  'insights',
  'dailyChallenges',
  'lab',
]);

function allowedView(view, { isAdminUser = false } = {}) {
  // Only a proven focused personal puzzle can recover this otherwise ephemeral route.
  if (view === 'puzzle') return Boolean(loadFocusedPuzzleResume());
  if (!RESTORABLE_VIEWS.includes(view)) return false;
  if (view === 'admin' && !isAdminUser) return false;
  return true;
}

export function loadSessionView({ isAdminUser = false } = {}) {
  const saved = getStorageItem(STORAGE_SESSION, VIEW_STORAGE_KEY);
  return allowedView(saved, { isAdminUser }) ? saved : 'menu';
}

export function rememberSessionView(view) {
  if (view === 'puzzle') {
    if (loadFocusedPuzzleResume()) setStorageItem(STORAGE_SESSION, VIEW_STORAGE_KEY, 'puzzle');
    return;
  }
  // Any other route ends the focused F5 recovery opportunity.
  clearFocusedPuzzleResume();
  if (RESTORABLE_VIEWS.includes(view)) setStorageItem(STORAGE_SESSION, VIEW_STORAGE_KEY, view);
}

export function loadSessionViewHistory({ isAdminUser = false } = {}) {
  const parsed = readJsonStorage(STORAGE_SESSION, VIEW_HISTORY_STORAGE_KEY, { fallback: [], removeMalformed: true });
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((view) => RESTORABLE_VIEWS.includes(view) && allowedView(view, { isAdminUser })).slice(-MAX_VIEW_HISTORY);
}

export function rememberSessionViewHistory(history) {
  const safe = (Array.isArray(history) ? history : [])
    .filter((view) => RESTORABLE_VIEWS.includes(view))
    .slice(-MAX_VIEW_HISTORY);
  writeJsonStorage(STORAGE_SESSION, VIEW_HISTORY_STORAGE_KEY, safe);
}

export function clearSessionView() {
  clearFocusedPuzzleResume();
  removeStorageItem(STORAGE_SESSION, VIEW_STORAGE_KEY);
  removeStorageItem(STORAGE_SESSION, VIEW_HISTORY_STORAGE_KEY);
}

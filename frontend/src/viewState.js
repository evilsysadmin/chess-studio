import { STORAGE_SESSION, getStorageItem, readJsonStorage, removeStorageItem, setStorageItem, writeJsonStorage } from './safeStorage.js';

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
  'board3d',
]);

function allowedView(view, { isAdminUser = false } = {}) {
  if (!RESTORABLE_VIEWS.includes(view)) return false;
  if (view === 'admin' && !isAdminUser) return false;
  return true;
}

export function loadSessionView({ isAdminUser = false } = {}) {
  const saved = getStorageItem(STORAGE_SESSION, VIEW_STORAGE_KEY);
  return allowedView(saved, { isAdminUser }) ? saved : 'menu';
}

export function rememberSessionView(view) {
  if (RESTORABLE_VIEWS.includes(view)) setStorageItem(STORAGE_SESSION, VIEW_STORAGE_KEY, view);
}

export function loadSessionViewHistory({ isAdminUser = false } = {}) {
  try {
    const parsed = readJsonStorage(STORAGE_SESSION, VIEW_HISTORY_STORAGE_KEY, { fallback: [], removeMalformed: true });
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((view) => allowedView(view, { isAdminUser })).slice(-40);
  } catch {
    return [];
  }
}

export function rememberSessionViewHistory(history) {
  const safe = (Array.isArray(history) ? history : [])
    .filter((view) => RESTORABLE_VIEWS.includes(view))
    .slice(-40);
  writeJsonStorage(STORAGE_SESSION, VIEW_HISTORY_STORAGE_KEY, safe);
}

export function clearSessionView() {
  removeStorageItem(STORAGE_SESSION, VIEW_STORAGE_KEY);
  removeStorageItem(STORAGE_SESSION, VIEW_HISTORY_STORAGE_KEY);
}

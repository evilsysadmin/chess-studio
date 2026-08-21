// viewState.js — navegación de sesión resistente a refresh y con historial.
// Solo persistimos pantallas que pueden reconstruirse únicamente desde el
// perfil/caché ya cargados. Las vistas efímeras (partida/replay) sí pueden
// existir en el back-stack mientras la app está viva, pero no se restauran
// después de un refresh porque necesitan objetos React adicionales.

export const VIEW_STORAGE_KEY = 'chess-study-current-view';
export const VIEW_HISTORY_STORAGE_KEY = 'chess-study-view-history';

export const RESTORABLE_VIEWS = Object.freeze([
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
  'lab',
  'board3d',
]);

function allowedView(view, { isAdminUser = false } = {}) {
  if (!RESTORABLE_VIEWS.includes(view)) return false;
  if (view === 'admin' && !isAdminUser) return false;
  return true;
}

export function loadSessionView({ isAdminUser = false } = {}) {
  if (typeof sessionStorage === 'undefined') return 'menu';
  const saved = sessionStorage.getItem(VIEW_STORAGE_KEY);
  return allowedView(saved, { isAdminUser }) ? saved : 'menu';
}

export function rememberSessionView(view) {
  if (typeof sessionStorage === 'undefined') return;
  if (RESTORABLE_VIEWS.includes(view)) {
    sessionStorage.setItem(VIEW_STORAGE_KEY, view);
  }
}

export function loadSessionViewHistory({ isAdminUser = false } = {}) {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(VIEW_HISTORY_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((view) => allowedView(view, { isAdminUser })).slice(-40);
  } catch {
    return [];
  }
}

export function rememberSessionViewHistory(history) {
  if (typeof sessionStorage === 'undefined') return;
  const safe = (Array.isArray(history) ? history : [])
    .filter((view) => RESTORABLE_VIEWS.includes(view))
    .slice(-40);
  sessionStorage.setItem(VIEW_HISTORY_STORAGE_KEY, JSON.stringify(safe));
}

export function clearSessionView() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(VIEW_STORAGE_KEY);
  sessionStorage.removeItem(VIEW_HISTORY_STORAGE_KEY);
}

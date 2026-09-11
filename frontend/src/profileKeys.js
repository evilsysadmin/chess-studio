import { STORAGE_LOCAL, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

// profileKeys.js — Única lista de claves que forman el perfil del usuario.
// MongoDB es la fuente persistente de verdad; localStorage es la caché de
// trabajo síncrona que consumen las pantallas existentes.

export const PROFILE_CHANGED_EVENT = 'chess-study-profile-changed';
const PROFILE_DIRTY_USER_KEY = 'chess-study-profile-dirty-user';
const PROFILE_DIRTY_KEYS_KEY = 'chess-study-profile-dirty-keys';
const AUTH_USERNAME_KEY = 'chess-study-auth-username';

// Cada documento del navegador queda ligado a la identidad con la que montó
// la aplicación. localStorage se comparte entre pestañas: si otra pestaña
// cambia Alice -> Bob, la pestaña vieja puede conservar promesas/callbacks de
// Alice durante unos milisegundos antes de recargarse. Esas escrituras tardías
// no deben caer jamás en el perfil de Bob.
let boundProfileUsername = getStorageItem(STORAGE_LOCAL, AUTH_USERNAME_KEY) || null;

export function bindProfileStorageIdentity(username) {
  boundProfileUsername = String(username || '').trim().toLowerCase() || null;
}

export function profileStorageIdentityMatchesCurrentUser() {
  const current = String(getStorageItem(STORAGE_LOCAL, AUTH_USERNAME_KEY) || '').trim().toLowerCase() || null;
  return !boundProfileUsername || !current || boundProfileUsername === current;
}

export const PROFILE_PROGRESS_KEYS = Object.freeze([
  'chess-study-tournament',
  'chess-study-game-history',
  'chess-study-game-activity',
  'chess-study-combat-history',
  'chess-study-combat-roster',
  'chess-study-combat-service',
  'chess-study-combat-deployment-presets-v1',
  'chess-study-combat-enemy-officers-v1',
  'chess-study-clean-games-v1',
  'chess-study-player-rating',
  'chess-study-rating-history',
  'chess-study-achievements',
  'chess-study-achievement-ledger-v2',
  'chess-study-achievement-favorites-v1',
  'chess-study-castle-unlocks-v1',
  'chess-study-puzzles-solved',
  'chess-study-puzzle-streak',
  'chess-study-puzzle-best-streak',
  'chess-study-worst-move-cache',
  'chess-study-selected-title',
  'chess-study-selected-skin',
  'chess-study-roguelike-run',
  'chess-study-roguelike-best-floor',
  'chess-study-roguelike-tower-completed',
  'chess-study-combat-campaign-v1',
  'chess-study-combat-campaign-best-stage',
  'chess-study-combat-operation-archive-v1',
  'chess-study-personal-puzzles',
  'chess-study-cpu-rivalry',
  'chess-study-daily-challenge',
  'chess-study-series-history',
  'chess-study-career-meta', // legado: perfiles antiguos pueden seguir trayéndolo desde Mongo
  'chess-study-special-run',
  'chess-study-active-contract',
  'chess-study-meta-progress', // legado anterior a career.js
  'chess-study-career',
  'chess-study-board-theme',
  'chess-study-analysis-archive',
  'chess-study-matthias-school-v1',
  'chess-study-pawn-slug-weapon-models-v1',
]);

export const PROFILE_PREFERENCE_KEYS = Object.freeze([
  'chess-study-muted', // legado: fallback para perfiles anteriores
  'chess-study-music-muted',
  'chess-study-music-volume',
  'chess-study-music-radio-mode',
  'chess-study-music-favorites',
  'chess-study-music-excluded',
  'chess-study-user-release-notes-seen',
  'chess-study-fx-muted',
  'chess-study-voice-enabled',
  'chess-study-mechanic-tutorial-progress-v1',
  'chess-study-home-guide-dismissed-v1',
  'chess-study-matthias-home-last-shown-v1',
  'matthias.onboarded',
  'chess-study-onboarding-insights-seen-v1',
  'chess-study-feedback-assistant-v1',
  'chess-study-post-game-feedback-v1',
  'chess-study-zen-mode',
  'chess-study-default-time-control',
  'chess-study-ui-language',
  'chess-study-reduced-motion',
  'chess-study-board-coordinates',
  'chess-study-board-renderer',
]);

export const PROFILE_STORAGE_KEYS = Object.freeze([
  ...PROFILE_PROGRESS_KEYS,
  ...PROFILE_PREFERENCE_KEYS,
]);

// Estado local de sesión/caché derivada. No se sincroniza porque apunta a
// datos no portables o diagnósticos locales, pero sí debe limpiarse al cambiar
// de identidad para que Bob no herede trazas/cachés de Alice.
export const DERIVED_LOCAL_CACHE_KEYS = Object.freeze([
  'chess-study-ai-player-portrait-v1',
  'chess-study-ai-training-plan-v1',
  'chess-study-narrative-call-ledger-v1',
]);

export const SESSION_STATE_KEYS = [
  'chess-study-active-game',
  'chess-study-active-game-learning',
  'chess-study-active-series',
  'chess-study-active-game-chat',
  'chess-study-matthias-home-seen-v1',
  'chess-study-active-game-session-v1',
];

function emitProfileChanged() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
  }
}

export function markProfileDirtyForCurrentUser(key = null) {
  if (!profileStorageIdentityMatchesCurrentUser()) return false;
  const username = getStorageItem(STORAGE_LOCAL, AUTH_USERNAME_KEY);
  if (!username) return false;
  const previousOwner = getStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_USER_KEY);
  // Una marca incompleta de otra sesión/identidad nunca puede heredarse. Si
  // el navegador cambió de cuenta sin pasar por un logout limpio, empezamos
  // el journal dirty de la identidad actual desde cero.
  if (previousOwner && previousOwner !== username) {
    removeStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_KEYS_KEY);
  }
  setStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_USER_KEY, username);
  const existing = getStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_KEYS_KEY);
  if (existing === '*') return;
  if (!key) {
    setStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_KEYS_KEY, '*');
    return;
  }
  const keys = existing ? existing.split(',').filter(Boolean) : [];
  if (!keys.includes(key)) keys.push(key);
  setStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_KEYS_KEY, keys.join(','));
}

export function clearProfileDirtyJournal() {
  removeStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_USER_KEY);
  removeStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_KEYS_KEY);
}

export function setProfileStorageItem(key, value) {
  if (!PROFILE_STORAGE_KEYS.includes(key)) {
    throw new Error(`Clave de perfil no registrada: ${key}`);
  }
  if (!profileStorageIdentityMatchesCurrentUser()) return false;
  setStorageItem(STORAGE_LOCAL, key, value);
  markProfileDirtyForCurrentUser(key);
  emitProfileChanged();
  return true;
}

export function removeProfileStorageItem(key) {
  if (!PROFILE_STORAGE_KEYS.includes(key)) {
    throw new Error(`Clave de perfil no registrada: ${key}`);
  }
  if (!profileStorageIdentityMatchesCurrentUser()) return false;
  removeStorageItem(STORAGE_LOCAL, key);
  markProfileDirtyForCurrentUser(key);
  emitProfileChanged();
  return true;
}

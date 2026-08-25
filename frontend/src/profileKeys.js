import { STORAGE_LOCAL, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

// profileKeys.js — Única lista de claves que forman el perfil del usuario.
// MongoDB es la fuente persistente de verdad; localStorage es la caché de
// trabajo síncrona que consumen las pantallas existentes.

export const PROFILE_CHANGED_EVENT = 'chess-study-profile-changed';
const PROFILE_DIRTY_USER_KEY = 'chess-study-profile-dirty-user';
const PROFILE_DIRTY_KEYS_KEY = 'chess-study-profile-dirty-keys';
const AUTH_USERNAME_KEY = 'chess-study-auth-username';

export const PROFILE_PROGRESS_KEYS = Object.freeze([
  'chess-study-tournament',
  'chess-study-game-history',
  'chess-study-game-activity',
  'chess-study-combat-history',
  'chess-study-combat-roster',
  'chess-study-combat-service',
  'chess-study-combat-deployment-presets-v1',
  'chess-study-player-rating',
  'chess-study-rating-history',
  'chess-study-achievements',
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
]);

export const PROFILE_PREFERENCE_KEYS = Object.freeze([
  'chess-study-muted', // legado: fallback para perfiles anteriores
  'chess-study-music-muted',
  'chess-study-music-volume',
  'chess-study-music-radio-mode',
  'chess-study-music-favorites',
  'chess-study-music-excluded',
  'chess-study-fx-muted',
  'chess-study-voice-enabled',
  'chess-study-mechanic-tutorial-progress-v1',
  'chess-study-home-guide-dismissed-v1',
  'chess-study-zen-mode',
  'chess-study-default-time-control',
  'chess-study-ui-language',
]);

export const PROFILE_STORAGE_KEYS = Object.freeze([
  ...PROFILE_PROGRESS_KEYS,
  ...PROFILE_PREFERENCE_KEYS,
]);

// Estado local de sesión. No se sincroniza porque apunta a partidas activas
// del backend y no es portable entre dispositivos, pero sí debe limpiarse al
// cambiar de identidad para que Bob no vea la partida activa de Alice.
export const DERIVED_LOCAL_CACHE_KEYS = Object.freeze([
  'chess-study-ai-player-portrait-v1',
  'chess-study-ai-training-plan-v1',
]);

export const SESSION_STATE_KEYS = [
  'chess-study-active-game',
  'chess-study-active-game-learning',
  'chess-study-active-series',
  'chess-study-active-game-chat',
  'chess-study-active-game-session-v1',
];

function emitProfileChanged() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
  }
}

export function markProfileDirtyForCurrentUser(key = null) {
  const username = getStorageItem(STORAGE_LOCAL, AUTH_USERNAME_KEY);
  if (!username) return;
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
  let keys = [];
  try { keys = JSON.parse(existing || '[]'); } catch { keys = []; }
  if (!Array.isArray(keys)) keys = [];
  if (!keys.includes(key)) keys.push(key);
  setStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_KEYS_KEY, JSON.stringify(keys));
}

export function profileDirtyStateForCurrentUser() {
  const username = getStorageItem(STORAGE_LOCAL, AUTH_USERNAME_KEY);
  const owner = getStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_USER_KEY);
  if (!username || owner !== username) {
    return { dirty: false, valid: true, keys: [] };
  }

  const raw = getStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_KEYS_KEY);
  if (raw === '*') return { dirty: true, valid: true, keys: '*' };
  if (raw === null) return { dirty: true, valid: false, keys: [] };

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { dirty: true, valid: false, keys: [] };
    }
    const valid = parsed.every((key) => typeof key === 'string' && PROFILE_STORAGE_KEYS.includes(key));
    if (!valid) return { dirty: true, valid: false, keys: [] };
    return { dirty: true, valid: true, keys: [...new Set(parsed)] };
  } catch {
    return { dirty: true, valid: false, keys: [] };
  }
}

export function dirtyProfileKeysForCurrentUser() {
  const state = profileDirtyStateForCurrentUser();
  return state.dirty && state.valid ? state.keys : [];
}

export function hasDirtyProfileForCurrentUser() {
  const username = getStorageItem(STORAGE_LOCAL, AUTH_USERNAME_KEY);
  return !!username && getStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_USER_KEY) === username;
}

export function clearProfileDirty() {
  removeStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_USER_KEY);
  removeStorageItem(STORAGE_LOCAL, PROFILE_DIRTY_KEYS_KEY);
}

export function setProfileStorageItem(key, value) {
  if (!PROFILE_STORAGE_KEYS.includes(key)) {
    throw new Error(`Clave de perfil no registrada: ${key}`);
  }
  setStorageItem(STORAGE_LOCAL, key, value);
  markProfileDirtyForCurrentUser(key);
  emitProfileChanged();
}

export function removeProfileStorageItem(key) {
  if (!PROFILE_STORAGE_KEYS.includes(key)) {
    throw new Error(`Clave de perfil no registrada: ${key}`);
  }
  removeStorageItem(STORAGE_LOCAL, key);
  markProfileDirtyForCurrentUser(key);
  emitProfileChanged();
}


export function clearProfileProgress() {
  for (const key of PROFILE_PROGRESS_KEYS) removeStorageItem(STORAGE_LOCAL, key);
  for (const key of DERIVED_LOCAL_CACHE_KEYS) removeStorageItem(STORAGE_LOCAL, key);
  markProfileDirtyForCurrentUser();
  emitProfileChanged();
}

export function clearProfileCache({ notify = false } = {}) {
  for (const key of PROFILE_STORAGE_KEYS) removeStorageItem(STORAGE_LOCAL, key);
  for (const key of DERIVED_LOCAL_CACHE_KEYS) removeStorageItem(STORAGE_LOCAL, key);
  removeStorageItem(STORAGE_LOCAL, 'chess-study-cpu-personality'); // legado de versiones con selector: ya no existe
  removeStorageItem(STORAGE_LOCAL, 'chess-study-ambient-theme'); // V15.4: la música pasa a ser de sesión, no de perfil
  if (notify) emitProfileChanged();
}

export function clearLocalUserState() {
  clearProfileCache();
  for (const key of SESSION_STATE_KEYS) removeStorageItem(STORAGE_LOCAL, key);
  clearProfileDirty();
}

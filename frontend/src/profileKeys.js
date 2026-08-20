// profileKeys.js — Única lista de claves que forman el perfil del usuario.
// MongoDB es la fuente persistente de verdad; localStorage es la caché de
// trabajo síncrona que consumen las pantallas existentes.

export const PROFILE_CHANGED_EVENT = 'chess-study-profile-changed';
const PROFILE_DIRTY_USER_KEY = 'chess-study-profile-dirty-user';
const AUTH_USERNAME_KEY = 'chess-study-auth-username';

export const PROFILE_STORAGE_KEYS = [
  'chess-study-tournament',
  'chess-study-game-history',
  'chess-study-combat-history',
  'chess-study-combat-roster',
  'chess-study-player-rating',
  'chess-study-rating-history',
  'chess-study-achievements',
  'chess-study-puzzles-solved',
  'chess-study-puzzle-streak',
  'chess-study-puzzle-best-streak',
  'chess-study-muted',
  'chess-study-voice-enabled',
  'chess-study-worst-move-cache',
  'chess-study-selected-title',
  'chess-study-selected-skin',
  'chess-study-roguelike-run',
  'chess-study-roguelike-best-floor',
];

// Estado local de sesión. No se sincroniza porque apunta a partidas activas
// del backend y no es portable entre dispositivos, pero sí debe limpiarse al
// cambiar de identidad para que Bob no vea la partida activa de Alice.
export const SESSION_STATE_KEYS = [
  'chess-study-active-game',
  'chess-study-active-game-learning',
];

function emitProfileChanged() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
  }
}

export function markProfileDirtyForCurrentUser() {
  const username = localStorage.getItem(AUTH_USERNAME_KEY);
  if (username) localStorage.setItem(PROFILE_DIRTY_USER_KEY, username);
}

export function hasDirtyProfileForCurrentUser() {
  const username = localStorage.getItem(AUTH_USERNAME_KEY);
  return !!username && localStorage.getItem(PROFILE_DIRTY_USER_KEY) === username;
}

export function clearProfileDirty() {
  localStorage.removeItem(PROFILE_DIRTY_USER_KEY);
}

export function setProfileStorageItem(key, value) {
  if (!PROFILE_STORAGE_KEYS.includes(key)) {
    throw new Error(`Clave de perfil no registrada: ${key}`);
  }
  localStorage.setItem(key, value);
  markProfileDirtyForCurrentUser();
  emitProfileChanged();
}

export function removeProfileStorageItem(key) {
  if (!PROFILE_STORAGE_KEYS.includes(key)) {
    throw new Error(`Clave de perfil no registrada: ${key}`);
  }
  localStorage.removeItem(key);
  markProfileDirtyForCurrentUser();
  emitProfileChanged();
}

export function clearProfileCache({ notify = false } = {}) {
  for (const key of PROFILE_STORAGE_KEYS) localStorage.removeItem(key);
  if (notify) emitProfileChanged();
}

export function clearLocalUserState() {
  clearProfileCache();
  for (const key of SESSION_STATE_KEYS) localStorage.removeItem(key);
  clearProfileDirty();
}

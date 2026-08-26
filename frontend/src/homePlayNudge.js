import {
  STORAGE_LOCAL,
  STORAGE_SESSION,
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from './safeStorage.js';

export const HOME_PLAY_NUDGE_IDLE_MS = 5 * 60 * 1000;
export const HOME_PLAY_NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const HOME_PLAY_NUDGE_SESSION_KEY = 'chess-study-home-play-nudge-shown-v1';
export const HOME_PLAY_NUDGE_LAST_AT_KEY = 'chess-study-home-play-nudge-last-at-v1';

// `storage` sólo existe para tests/consumidores que inyecten un Storage.
// En producción, null pasa siempre por safeStorage: acceder a la propiedad
// global localStorage/sessionStorage también puede lanzar SecurityError.
function read(storage, area, key) {
  if (!storage) return getStorageItem(area, key);
  try { return storage.getItem?.(key) ?? null; } catch { return null; }
}

function write(storage, area, key, value) {
  if (!storage) return setStorageItem(area, key, value);
  try {
    storage.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(storage, area, key) {
  if (!storage) {
    removeStorageItem(area, key);
    return;
  }
  try {
    storage.removeItem?.(key);
  } catch {
    // El nudge es decorativo; un storage bloqueado no debe romper login/logout.
  }
}

function homePlayNudgeWasShown(session = null) {
  return read(session, STORAGE_SESSION, HOME_PLAY_NUDGE_SESSION_KEY) === '1';
}

export function homePlayNudgeIsCoolingDown(now = Date.now(), persistent = null) {
  const lastAt = Number(read(persistent, STORAGE_LOCAL, HOME_PLAY_NUDGE_LAST_AT_KEY));
  if (!Number.isFinite(lastAt) || lastAt <= 0) return false;
  return now < lastAt + HOME_PLAY_NUDGE_COOLDOWN_MS;
}

export function canShowHomePlayNudge({ now = Date.now(), session = null, persistent = null } = {}) {
  return !homePlayNudgeWasShown(session) && !homePlayNudgeIsCoolingDown(now, persistent);
}

export function markHomePlayNudgeShown({ now = Date.now(), session = null, persistent = null } = {}) {
  write(session, STORAGE_SESSION, HOME_PLAY_NUDGE_SESSION_KEY, '1');
  write(persistent, STORAGE_LOCAL, HOME_PLAY_NUDGE_LAST_AT_KEY, String(now));
}

export function clearHomePlayNudgeSession(session = null) {
  remove(session, STORAGE_SESSION, HOME_PLAY_NUDGE_SESSION_KEY);
}

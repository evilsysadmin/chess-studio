import { STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

export const PVP_ENROLLMENT_SESSION_KEY = 'chess-study-pvp-enrolled-v1';
export const PVP_ACTIVE_MATCH_SESSION_KEY = 'chess-study-pvp-active-match-v1';

export function loadPvpEnrollment() {
  return getStorageItem(STORAGE_SESSION, PVP_ENROLLMENT_SESSION_KEY) === '1';
}

export function savePvpEnrollment(active) {
  if (active) setStorageItem(STORAGE_SESSION, PVP_ENROLLMENT_SESSION_KEY, '1');
  else removeStorageItem(STORAGE_SESSION, PVP_ENROLLMENT_SESSION_KEY);
  return Boolean(active);
}

export function loadPvpMatchSession() {
  const raw = getStorageItem(STORAGE_SESSION, PVP_ACTIVE_MATCH_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.id ? parsed : null;
  } catch {
    removeStorageItem(STORAGE_SESSION, PVP_ACTIVE_MATCH_SESSION_KEY);
    return null;
  }
}

export function savePvpMatchSession(match) {
  if (!match?.id) return false;
  setStorageItem(STORAGE_SESSION, PVP_ACTIVE_MATCH_SESSION_KEY, JSON.stringify(match));
  return true;
}

export function clearPvpMatchSession() {
  removeStorageItem(STORAGE_SESSION, PVP_ACTIVE_MATCH_SESSION_KEY);
}

export function clearPvpSessionState() {
  removeStorageItem(STORAGE_SESSION, PVP_ENROLLMENT_SESSION_KEY);
  removeStorageItem(STORAGE_SESSION, PVP_ACTIVE_MATCH_SESSION_KEY);
}

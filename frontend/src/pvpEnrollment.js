import { STORAGE_SESSION, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';

export const PVP_ENROLLMENT_SESSION_KEY = 'chess-study-pvp-enrollment-v1';

function normalizedUser(username) {
  return String(username || '').trim().toLowerCase();
}

export function loadPvpEnrollment(username) {
  const user = normalizedUser(username);
  if (!user) return false;
  const row = readJsonStorage(STORAGE_SESSION, PVP_ENROLLMENT_SESSION_KEY, { fallback: null, removeMalformed: true });
  return Boolean(row?.enrolled === true && normalizedUser(row?.username) === user);
}

export function savePvpEnrollment(username, enrolled) {
  const user = normalizedUser(username);
  if (!user || !enrolled) {
    removeStorageItem(STORAGE_SESSION, PVP_ENROLLMENT_SESSION_KEY);
    return false;
  }
  return writeJsonStorage(STORAGE_SESSION, PVP_ENROLLMENT_SESSION_KEY, { username: user, enrolled: true });
}

export function clearPvpEnrollment() {
  removeStorageItem(STORAGE_SESSION, PVP_ENROLLMENT_SESSION_KEY);
}

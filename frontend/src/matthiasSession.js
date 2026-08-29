import { STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

export const MATTHIAS_HOME_SESSION_KEY = 'chess-study-matthias-home-seen-v1';
export const MATTHIAS_LOGIN_GREETING_PENDING_KEY = 'chess-study-matthias-login-greeting-pending-v1';

export function matthiasHomeSessionSeen() {
  return getStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY) === '1';
}

export function markMatthiasHomeSessionSeen() {
  setStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY, '1');
}

export function queueMatthiasLoginGreeting() {
  // Una autenticación explícita abre una sesión narrativa nueva aunque ocurra
  // en la misma pestaña tras logout/login. El saludo no depende del cooldown.
  removeStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY);
  setStorageItem(STORAGE_SESSION, MATTHIAS_LOGIN_GREETING_PENDING_KEY, '1');
}

export function matthiasLoginGreetingPending() {
  return getStorageItem(STORAGE_SESSION, MATTHIAS_LOGIN_GREETING_PENDING_KEY) === '1';
}

export function consumeMatthiasLoginGreeting() {
  removeStorageItem(STORAGE_SESSION, MATTHIAS_LOGIN_GREETING_PENDING_KEY);
  markMatthiasHomeSessionSeen();
}

export function clearMatthiasSessionSignals() {
  removeStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY);
  removeStorageItem(STORAGE_SESSION, MATTHIAS_LOGIN_GREETING_PENDING_KEY);
}

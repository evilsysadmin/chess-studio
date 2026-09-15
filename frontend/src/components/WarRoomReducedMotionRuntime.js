import { PROFILE_CHANGED_EVENT } from '../profileKeys.js';
import { STORAGE_LOCAL, getStorageItem } from '../safeStorage.js';

const REDUCED_MOTION_KEY = 'chess-study-reduced-motion';
let cachedEffective;
let mediaQuery = null;
let listenersInstalled = false;

function invalidate() {
  cachedEffective = undefined;
}

function reducedMotionPreference() {
  const value = getStorageItem(STORAGE_LOCAL, REDUCED_MOTION_KEY);
  if (value === '1') return 'reduce';
  if (value === '0') return 'allow';
  return 'system';
}

function ensureMediaQuery() {
  if (mediaQuery || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return mediaQuery;
  mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = () => invalidate();
  if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', onChange);
  else if (typeof mediaQuery.addListener === 'function') mediaQuery.addListener(onChange);
  return mediaQuery;
}

function installInvalidationListeners() {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  window.addEventListener(PROFILE_CHANGED_EVENT, invalidate);
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === REDUCED_MOTION_KEY) invalidate();
  });
}

export function getRuntimeEffectiveReducedMotion({ systemReduced } = {}) {
  const preference = reducedMotionPreference();
  if (preference === 'reduce') return true;
  if (preference === 'allow') return false;
  if (systemReduced !== undefined) return Boolean(systemReduced);

  installInvalidationListeners();
  if (cachedEffective !== undefined) return cachedEffective;
  cachedEffective = Boolean(ensureMediaQuery()?.matches);
  return cachedEffective;
}

export function resetRuntimeReducedMotionCacheForTests() {
  invalidate();
}

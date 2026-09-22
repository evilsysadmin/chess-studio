import { STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

const LAB_LAUNCH_MODES = new Set(['pawnslug-godot']);
const LAB_REMEMBERED_MODES = new Set(['pawnslug-godot', 'chronicles', 'chronicles-tactics']);
const LAB_MODE_ALIASES = new Map([
  ['pawnslug', 'pawnslug-godot'],
]);
export const LAB_MODE_SESSION_KEY = 'chess-study-lab-mode-v1';
let pendingLabMode = null;
const labLaunchSubscribers = new Set();

function normalizeLabMode(mode, allowedModes) {
  const normalizedMode = LAB_MODE_ALIASES.get(mode) || mode;
  return allowedModes.has(normalizedMode) ? normalizedMode : null;
}

export function rememberLabMode(mode) {
  const normalizedMode = normalizeLabMode(mode, LAB_REMEMBERED_MODES);
  if (normalizedMode) setStorageItem(STORAGE_SESSION, LAB_MODE_SESSION_KEY, normalizedMode);
  else removeStorageItem(STORAGE_SESSION, LAB_MODE_SESSION_KEY);
  return normalizedMode;
}

export function loadRememberedLabMode() {
  return normalizeLabMode(getStorageItem(STORAGE_SESSION, LAB_MODE_SESSION_KEY), LAB_REMEMBERED_MODES);
}

export function clearRememberedLabMode() {
  removeStorageItem(STORAGE_SESSION, LAB_MODE_SESSION_KEY);
}

export function requestLabLaunch(mode) {
  pendingLabMode = normalizeLabMode(mode, LAB_LAUNCH_MODES);
  if (!pendingLabMode || labLaunchSubscribers.size === 0) return pendingLabMode;

  const launchMode = pendingLabMode;
  pendingLabMode = null;
  for (const subscriber of [...labLaunchSubscribers]) subscriber(launchMode);
  return launchMode;
}

export function consumeLabLaunch() {
  const mode = pendingLabMode;
  pendingLabMode = null;
  return mode;
}


export function subscribeLabLaunch(subscriber) {
  if (typeof subscriber !== 'function') return () => {};
  labLaunchSubscribers.add(subscriber);
  return () => labLaunchSubscribers.delete(subscriber);
}

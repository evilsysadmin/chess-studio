import { STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

const LAB_LAUNCH_MODES = new Set(['pawnslug-godot']);
const LAB_REMEMBERED_MODES = new Set(['pawnslug-godot', 'chronicles', 'chronicles-tactics']);
const LAB_MODE_ALIASES = new Map([
  ['pawnslug', 'pawnslug-godot'],
]);
export const LAB_MODE_SESSION_KEY = 'chess-study-lab-mode-v1';
export const LAB_LAUNCH_SESSION_KEY = 'chess-study-lab-launch-v1';
let pendingLabMode = null;
const labLaunchSubscribers = new Set();

function normalizeLabMode(mode, allowedModes) {
  const normalizedMode = LAB_MODE_ALIASES.get(mode) || mode;
  return allowedModes.has(normalizedMode) ? normalizedMode : null;
}

function storeLabLaunch(mode) {
  pendingLabMode = mode;
  if (mode) setStorageItem(STORAGE_SESSION, LAB_LAUNCH_SESSION_KEY, mode);
  else removeStorageItem(STORAGE_SESSION, LAB_LAUNCH_SESSION_KEY);
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

export function loadLabLaunch() {
  const memoryMode = normalizeLabMode(pendingLabMode, LAB_LAUNCH_MODES);
  if (memoryMode) return memoryMode;
  return normalizeLabMode(getStorageItem(STORAGE_SESSION, LAB_LAUNCH_SESSION_KEY), LAB_LAUNCH_MODES);
}

export function clearLabLaunch() {
  pendingLabMode = null;
  removeStorageItem(STORAGE_SESSION, LAB_LAUNCH_SESSION_KEY);
}

export function acknowledgeLabLaunch(mode) {
  const normalizedMode = normalizeLabMode(mode, LAB_LAUNCH_MODES);
  if (!normalizedMode || loadLabLaunch() !== normalizedMode) return false;
  clearLabLaunch();
  return true;
}

export function requestLabLaunch(mode) {
  const launchMode = normalizeLabMode(mode, LAB_LAUNCH_MODES);
  storeLabLaunch(launchMode);
  if (!launchMode || labLaunchSubscribers.size === 0) return launchMode;

  // A mounted LabScreen can accept the intent immediately, so no remount
  // hand-off remains to acknowledge.
  clearLabLaunch();
  for (const subscriber of [...labLaunchSubscribers]) subscriber(launchMode);
  return launchMode;
}

export function consumeLabLaunch() {
  const mode = loadLabLaunch();
  clearLabLaunch();
  return mode;
}

export function subscribeLabLaunch(subscriber) {
  if (typeof subscriber !== 'function') return () => {};
  labLaunchSubscribers.add(subscriber);
  return () => labLaunchSubscribers.delete(subscriber);
}

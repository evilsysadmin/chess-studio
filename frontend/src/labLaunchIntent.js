import { STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

const LAB_MODES = new Set(['pawnslug-godot']);
const LAB_MODE_ALIASES = new Map([
  ['pawnslug', 'pawnslug-godot'],
]);
export const LAB_MODE_SESSION_KEY = 'chess-study-lab-mode-v1';
let pendingLabMode = null;

function normalizeLabMode(mode) {
  const normalizedMode = LAB_MODE_ALIASES.get(mode) || mode;
  return LAB_MODES.has(normalizedMode) ? normalizedMode : null;
}

export function rememberLabMode(mode) {
  const normalizedMode = normalizeLabMode(mode);
  if (normalizedMode) setStorageItem(STORAGE_SESSION, LAB_MODE_SESSION_KEY, normalizedMode);
  else removeStorageItem(STORAGE_SESSION, LAB_MODE_SESSION_KEY);
  return normalizedMode;
}

export function loadRememberedLabMode() {
  return normalizeLabMode(getStorageItem(STORAGE_SESSION, LAB_MODE_SESSION_KEY));
}

export function clearRememberedLabMode() {
  removeStorageItem(STORAGE_SESSION, LAB_MODE_SESSION_KEY);
}

export function requestLabLaunch(mode) {
  pendingLabMode = normalizeLabMode(mode);
}

export function consumeLabLaunch() {
  const mode = pendingLabMode;
  pendingLabMode = null;
  return mode;
}

import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { PROFILE_CHANGED_EVENT, setProfileStorageItem } from './profileKeys.js';
import { TIME_CONTROLS } from './clock.js';

export const DEFAULT_TIME_CONTROL_KEY = 'chess-study-default-time-control';
export const UI_LANGUAGE_KEY = 'chess-study-ui-language';
export const REDUCED_MOTION_KEY = 'chess-study-reduced-motion';
export const BOARD_COORDINATES_KEY = 'chess-study-board-coordinates';
export const BOARD_RENDERER_KEY = 'chess-study-board-renderer';
export const EXPLICIT_2D_BOARD_RENDERER_VALUE = '2d-explicit-v1';
export const USER_PREFERENCES_CHANGED_EVENT = 'chess-study-user-preferences-changed';
export const SUPPORTED_UI_LANGUAGES = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
];
export const BOARD_RENDERERS = [
  { id: '3d', label: '3D' },
  { id: '2d', label: '2D' },
];

let effectiveReducedMotionCache;
let reducedMotionMedia = null;
let reducedMotionListenersInstalled = false;

function invalidateEffectiveReducedMotionCache() {
  effectiveReducedMotionCache = undefined;
}

function ensureReducedMotionMedia() {
  if (reducedMotionMedia || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return reducedMotionMedia;
  }

  reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handleSystemMotionChange = () => {
    invalidateEffectiveReducedMotionCache();
    syncReducedMotionDataset();
    window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
  };
  if (typeof reducedMotionMedia.addEventListener === 'function') {
    reducedMotionMedia.addEventListener('change', handleSystemMotionChange);
  } else if (typeof reducedMotionMedia.addListener === 'function') {
    reducedMotionMedia.addListener(handleSystemMotionChange);
  }
  return reducedMotionMedia;
}

function installReducedMotionInvalidationListeners() {
  if (reducedMotionListenersInstalled || typeof window === 'undefined') return;
  reducedMotionListenersInstalled = true;
  window.addEventListener(PROFILE_CHANGED_EVENT, invalidateEffectiveReducedMotionCache);
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === REDUCED_MOTION_KEY) invalidateEffectiveReducedMotionCache();
  });
}

export function getDefaultTimeControlId() {
  const value = getStorageItem(STORAGE_LOCAL, DEFAULT_TIME_CONTROL_KEY) || 'none';
  return TIME_CONTROLS.some((row) => row.id === value) ? value : 'none';
}

export function setDefaultTimeControlId(value) {
  const normalized = TIME_CONTROLS.some((row) => row.id === value) ? value : 'none';
  setProfileStorageItem(DEFAULT_TIME_CONTROL_KEY, normalized);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
  return normalized;
}

export function getUiLanguage() {
  const value = getStorageItem(STORAGE_LOCAL, UI_LANGUAGE_KEY) || 'es';
  return SUPPORTED_UI_LANGUAGES.some((row) => row.id === value) ? value : 'es';
}

export function setUiLanguage(value) {
  const normalized = SUPPORTED_UI_LANGUAGES.some((row) => row.id === value) ? value : 'es';
  setProfileStorageItem(UI_LANGUAGE_KEY, normalized);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
  return normalized;
}

export function getReducedMotionPreference() {
  const value = getStorageItem(STORAGE_LOCAL, REDUCED_MOTION_KEY);
  if (value === '1') return 'reduce';
  if (value === '0') return 'allow';
  return 'system';
}

export function systemPrefersReducedMotion() {
  return Boolean(ensureReducedMotionMedia()?.matches);
}

export function reducedMotionStatus({ systemReduced } = {}) {
  const preference = getReducedMotionPreference();
  const reducedBySystem = systemReduced ?? systemPrefersReducedMotion();
  if (preference === 'reduce') return { effective: true, source: 'app', preference, systemReduced: reducedBySystem };
  if (preference === 'allow') return { effective: false, source: 'app', preference, systemReduced: reducedBySystem };
  return {
    effective: reducedBySystem,
    source: reducedBySystem ? 'system' : 'none',
    preference,
    systemReduced: reducedBySystem,
  };
}

export function getReducedMotion() {
  return getReducedMotionPreference() === 'reduce';
}

export function getEffectiveReducedMotion(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'systemReduced')) {
    return reducedMotionStatus(options).effective;
  }
  installReducedMotionInvalidationListeners();
  if (effectiveReducedMotionCache !== undefined) return effectiveReducedMotionCache;
  effectiveReducedMotionCache = reducedMotionStatus({ systemReduced: systemPrefersReducedMotion() }).effective;
  return effectiveReducedMotionCache;
}

function syncReducedMotionDataset() {
  if (typeof document === 'undefined') return;
  const status = reducedMotionStatus();
  document.documentElement.dataset.reducedMotion = status.effective ? 'true' : 'false';
  document.documentElement.dataset.motionPreference = status.preference;
}

export function setReducedMotion(value) {
  const normalized = !!value;
  invalidateEffectiveReducedMotionCache();
  setProfileStorageItem(REDUCED_MOTION_KEY, normalized ? '1' : '0');
  syncReducedMotionDataset();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
  return normalized;
}

export function getBoardCoordinates() {
  return getStorageItem(STORAGE_LOCAL, BOARD_COORDINATES_KEY) !== '0';
}

export function setBoardCoordinates(value) {
  const normalized = !!value;
  setProfileStorageItem(BOARD_COORDINATES_KEY, normalized ? '1' : '0');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
  return normalized;
}

export function getConfiguredBoardRendererDefault() {
  const configured = String(import.meta.env?.VITE_DEFAULT_BOARD_RENDERER || '').trim().toLowerCase();
  if (BOARD_RENDERERS.some((row) => row.id === configured)) return configured;
  return '3d';
}

export function getBoardRenderer() {
  const stored = getStorageItem(STORAGE_LOCAL, BOARD_RENDERER_KEY);
  if (stored === EXPLICIT_2D_BOARD_RENDERER_VALUE) return '2d';
  // Plain `2d` is the legacy value written before War Room became the product
  // default. Treating it as 3D here also migrates an old Mongo/profile value
  // that arrives after local storage migrations already ran (for example on a
  // fresh browser). A new, deliberate 2D choice is encoded separately above.
  if (stored === '2d') return '3d';
  if (stored === '3d') return '3d';
  return getConfiguredBoardRendererDefault();
}

export function setBoardRenderer(value) {
  const normalized = BOARD_RENDERERS.some((row) => row.id === value) ? value : '3d';
  const persisted = normalized === '2d' ? EXPLICIT_2D_BOARD_RENDERER_VALUE : '3d';
  setProfileStorageItem(BOARD_RENDERER_KEY, persisted);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
  return normalized;
}

import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { TIME_CONTROLS } from './clock.js';

export const DEFAULT_TIME_CONTROL_KEY = 'chess-study-default-time-control';
export const UI_LANGUAGE_KEY = 'chess-study-ui-language';
export const REDUCED_MOTION_KEY = 'chess-study-reduced-motion';
export const BOARD_COORDINATES_KEY = 'chess-study-board-coordinates';
export const BOARD_RENDERER_KEY = 'chess-study-board-renderer';
export const USER_PREFERENCES_CHANGED_EVENT = 'chess-study-user-preferences-changed';
export const SUPPORTED_UI_LANGUAGES = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
];
export const BOARD_RENDERERS = [
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
];

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
  return Boolean(
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
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
  return reducedMotionStatus(options).effective;
}

function syncReducedMotionDataset() {
  if (typeof document === 'undefined') return;
  const status = reducedMotionStatus();
  document.documentElement.dataset.reducedMotion = status.effective ? 'true' : 'false';
  document.documentElement.dataset.motionPreference = status.preference;
}

export function setReducedMotion(value) {
  const normalized = !!value;
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
  const configured = String(import.meta.env?.VITE_DEFAULT_BOARD_RENDERER || '2d').trim().toLowerCase();
  return BOARD_RENDERERS.some((row) => row.id === configured) ? configured : '2d';
}

export function getBoardRenderer() {
  const stored = getStorageItem(STORAGE_LOCAL, BOARD_RENDERER_KEY);
  if (BOARD_RENDERERS.some((row) => row.id === stored)) return stored;
  return getConfiguredBoardRendererDefault();
}

export function setBoardRenderer(value) {
  const normalized = BOARD_RENDERERS.some((row) => row.id === value) ? value : '2d';
  setProfileStorageItem(BOARD_RENDERER_KEY, normalized);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(USER_PREFERENCES_CHANGED_EVENT));
  return normalized;
}

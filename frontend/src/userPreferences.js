import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { TIME_CONTROLS } from './clock.js';

export const DEFAULT_TIME_CONTROL_KEY = 'chess-study-default-time-control';
export const UI_LANGUAGE_KEY = 'chess-study-ui-language';
export const REDUCED_MOTION_KEY = 'chess-study-reduced-motion';
export const BOARD_COORDINATES_KEY = 'chess-study-board-coordinates';
export const USER_PREFERENCES_CHANGED_EVENT = 'chess-study-user-preferences-changed';
export const SUPPORTED_UI_LANGUAGES = [
  { id: 'es', label: 'Español' },
  { id: 'en', label: 'English' },
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

export function getReducedMotion() {
  return getStorageItem(STORAGE_LOCAL, REDUCED_MOTION_KEY) === '1';
}

export function setReducedMotion(value) {
  const normalized = !!value;
  setProfileStorageItem(REDUCED_MOTION_KEY, normalized ? '1' : '0');
  if (typeof document !== 'undefined') document.documentElement.dataset.reducedMotion = normalized ? 'true' : 'false';
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

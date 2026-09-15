import { STORAGE_LOCAL, getStorageItem } from '../safeStorage.js';
import { PROFILE_CHANGED_EVENT } from '../profileKeys.js';

export const WAR_ROOM_CAT_REDUCED_MOTION_KEY = 'chess-study-reduced-motion';

let cachedEffective;
let media = null;
let listenersInstalled = false;

function mediaQuery() {
  if (media || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return media;
  media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const invalidate = () => { cachedEffective = undefined; };
  if (typeof media.addEventListener === 'function') media.addEventListener('change', invalidate);
  else if (typeof media.addListener === 'function') media.addListener(invalidate);
  return media;
}

function installInvalidationListeners() {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  const invalidate = () => { cachedEffective = undefined; };
  window.addEventListener(PROFILE_CHANGED_EVENT, invalidate);
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === WAR_ROOM_CAT_REDUCED_MOTION_KEY) invalidate();
  });
}

export function getWarRoomCatEffectiveReducedMotion() {
  installInvalidationListeners();
  if (cachedEffective !== undefined) return cachedEffective;

  const stored = getStorageItem(STORAGE_LOCAL, WAR_ROOM_CAT_REDUCED_MOTION_KEY);
  if (stored === '1') cachedEffective = true;
  else if (stored === '0') cachedEffective = false;
  else cachedEffective = Boolean(mediaQuery()?.matches);
  return cachedEffective;
}

import { useCallback, useEffect, useState } from 'react';
import {
  requestWarRoomLandscapeFullscreen,
  exitWarRoomBrowserFullscreen,
  unlockWarRoomOrientation,
} from './useWarRoomImmersive.js';

// Only fullscreen initiated by Chronicles may be dismissed when the game exits.
let chroniclesFullscreenOwned = false;

export const CHRONICLES_PHONE_QUERY = '(pointer: coarse) and (max-width: 920px)';
export const CHRONICLES_LANDSCAPE_QUERY = '(orientation: landscape) and (max-width: 920px) and (max-height: 620px)';

export function shouldAutoRotateChroniclesOnEntry({ win = globalThis.window } = {}) {
  if (!win || typeof win.matchMedia !== 'function') return false;
  return Boolean(
    win.matchMedia('(pointer: coarse)').matches
    && (Number(win.innerWidth) || Number.POSITIVE_INFINITY) <= 920,
  );
}

// Mobile browsers commonly refuse orientation.lock() unless the document is
// fullscreen. The user gesture that launches Chronicles is our chance to
// request both. Native fullscreen may consume the first Escape; the in-game
// menu remains reachable using touch controls.
export async function requestChroniclesLandscapeOnEntry({
  win = globalThis.window,
  doc = globalThis.document,
  screenApi = globalThis.screen,
} = {}) {
  if (!shouldAutoRotateChroniclesOnEntry({ win })) {
    return { requested: false, fullscreen: false, landscape: false };
  }
  const result = await requestWarRoomLandscapeFullscreen({ doc, screenApi });
  if (result.fullscreen) chroniclesFullscreenOwned = true;
  return { requested: true, ...result };
}

export async function releaseChroniclesLandscape({
  doc = globalThis.document,
  screenApi = globalThis.screen,
} = {}) {
  const ownedFullscreen = chroniclesFullscreenOwned;
  chroniclesFullscreenOwned = false;
  const unlocked = unlockWarRoomOrientation(screenApi);
  // Never dismiss pre-existing or user-owned fullscreen.
  const fullscreen = ownedFullscreen ? await exitWarRoomBrowserFullscreen(doc) : false;
  return { unlocked, fullscreen };
}

export default function useChroniclesLandscape(enabled = true) {
  const readViewport = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return { phone: false, landscape: false };
    }
    return {
      phone: window.matchMedia(CHRONICLES_PHONE_QUERY).matches,
      landscape: window.matchMedia(CHRONICLES_LANDSCAPE_QUERY).matches,
    };
  }, []);

  const [viewport, setViewport] = useState(readViewport);
  const [lockState, setLockState] = useState('idle');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const phoneMedia = window.matchMedia(CHRONICLES_PHONE_QUERY);
    const landscapeMedia = window.matchMedia(CHRONICLES_LANDSCAPE_QUERY);
    const refresh = () => setViewport({ phone: phoneMedia.matches, landscape: landscapeMedia.matches });
    refresh();
    phoneMedia.addEventListener?.('change', refresh);
    landscapeMedia.addEventListener?.('change', refresh);
    return () => {
      phoneMedia.removeEventListener?.('change', refresh);
      landscapeMedia.removeEventListener?.('change', refresh);
    };
  }, []);

  useEffect(() => () => {
    void releaseChroniclesLandscape();
  }, []);

  const activateLandscape = useCallback(async () => {
    const result = await requestChroniclesLandscapeOnEntry();
    const nextState = result.landscape ? 'locked' : 'rejected';
    setLockState(nextState);
    return nextState;
  }, []);

  return {
    needsRotation: Boolean(enabled && viewport.phone && !viewport.landscape),
    lockState,
    activateLandscape,
  };
}

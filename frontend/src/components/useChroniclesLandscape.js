import { useCallback, useEffect, useState } from 'react';
import {
  exitWarRoomBrowserFullscreen,
  requestWarRoomLandscapeFullscreen,
  unlockWarRoomOrientation,
} from './useWarRoomImmersive.js';

export const CHRONICLES_PHONE_QUERY = '(pointer: coarse) and (max-width: 920px)';
export const CHRONICLES_LANDSCAPE_QUERY = '(orientation: landscape) and (max-width: 920px) and (max-height: 620px)';

export function shouldAutoRotateChroniclesOnEntry({ win = globalThis.window } = {}) {
  if (!win || typeof win.matchMedia !== 'function') return false;
  return Boolean(
    win.matchMedia('(pointer: coarse)').matches
    && (Number(win.innerWidth) || Number.POSITIVE_INFINITY) <= 920,
  );
}

export async function requestChroniclesLandscapeOnEntry({
  win = globalThis.window,
  doc = globalThis.document,
  screenApi = globalThis.screen,
} = {}) {
  if (!shouldAutoRotateChroniclesOnEntry({ win })) {
    return { requested: false, fullscreen: false, landscape: false };
  }
  const result = await requestWarRoomLandscapeFullscreen({ doc, screenApi });
  return { requested: true, ...result };
}

export async function releaseChroniclesLandscape({
  doc = globalThis.document,
  screenApi = globalThis.screen,
} = {}) {
  const unlocked = unlockWarRoomOrientation(screenApi);
  const fullscreen = await exitWarRoomBrowserFullscreen(doc);
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

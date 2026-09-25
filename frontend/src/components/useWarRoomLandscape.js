import { useCallback, useEffect, useState } from 'react';

export const WAR_ROOM_PHONE_QUERY = '(pointer: coarse) and (max-width: 920px)';
export const WAR_ROOM_LANDSCAPE_QUERY = '(orientation: landscape) and (max-width: 920px) and (max-height: 620px)';

export async function requestWarRoomLandscape({
  screenObject = globalThis.screen,
  documentObject = globalThis.document,
  requestFullscreen = false,
} = {}) {
  const lock = screenObject?.orientation?.lock;
  if (typeof lock !== 'function') return 'unsupported';

  try {
    if (
      requestFullscreen
      && !documentObject?.fullscreenElement
      && typeof documentObject?.documentElement?.requestFullscreen === 'function'
    ) {
      await documentObject.documentElement.requestFullscreen({ navigationUI:'hide' });
    }
    await lock.call(screenObject.orientation, 'landscape');
    return 'locked';
  } catch {
    return 'rejected';
  }
}

export default function useWarRoomLandscape(enabled) {
  const readViewport = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return { phone:false, landscape:false };
    }
    return {
      phone:window.matchMedia(WAR_ROOM_PHONE_QUERY).matches,
      landscape:window.matchMedia(WAR_ROOM_LANDSCAPE_QUERY).matches,
    };
  }, []);
  const [viewport, setViewport] = useState(readViewport);
  const [lockState, setLockState] = useState('idle');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const phoneMedia = window.matchMedia(WAR_ROOM_PHONE_QUERY);
    const landscapeMedia = window.matchMedia(WAR_ROOM_LANDSCAPE_QUERY);
    const refresh = () => setViewport({ phone:phoneMedia.matches, landscape:landscapeMedia.matches });
    refresh();
    phoneMedia.addEventListener?.('change', refresh);
    landscapeMedia.addEventListener?.('change', refresh);
    return () => {
      phoneMedia.removeEventListener?.('change', refresh);
      landscapeMedia.removeEventListener?.('change', refresh);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !viewport.phone) {
      setLockState('idle');
      return undefined;
    }

    let active = true;
    requestWarRoomLandscape().then((result) => {
      if (active) setLockState(result);
    });
    return () => {
      active = false;
      try { globalThis.screen?.orientation?.unlock?.(); } catch { /* Browser owns fallback orientation. */ }
    };
  }, [enabled, viewport.phone]);

  const activateLandscape = useCallback(async () => {
    const result = await requestWarRoomLandscape({ requestFullscreen:true });
    setLockState(result);
    return result;
  }, []);

  return {
    phone:viewport.phone,
    landscape:viewport.landscape,
    needsRotation:Boolean(enabled && viewport.phone && !viewport.landscape),
    lockState,
    activateLandscape,
  };
}

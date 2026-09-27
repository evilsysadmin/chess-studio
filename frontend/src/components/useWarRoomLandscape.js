import { useCallback, useEffect, useState } from 'react';
import {
  requestWarRoomLandscape,
  requestWarRoomLandscapeFullscreen,
  unlockWarRoomOrientation,
} from './useWarRoomImmersive.js';

export const WAR_ROOM_PHONE_QUERY = '(pointer: coarse) and (max-width: 920px)';
export const WAR_ROOM_LANDSCAPE_QUERY = '(orientation: landscape) and (max-width: 920px) and (max-height: 620px)';

export default function useWarRoomLandscape(enabled) {
  const readViewport = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return { phone: false, landscape: false };
    }
    return {
      phone: window.matchMedia(WAR_ROOM_PHONE_QUERY).matches,
      landscape: window.matchMedia(WAR_ROOM_LANDSCAPE_QUERY).matches,
    };
  }, []);

  const [viewport, setViewport] = useState(readViewport);
  const [lockState, setLockState] = useState('idle');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const phoneMedia = window.matchMedia(WAR_ROOM_PHONE_QUERY);
    const landscapeMedia = window.matchMedia(WAR_ROOM_LANDSCAPE_QUERY);
    const refresh = () => setViewport({ phone: phoneMedia.matches, landscape: landscapeMedia.matches });
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
    requestWarRoomLandscape().then((locked) => {
      if (active) setLockState(locked ? 'locked' : 'rejected');
    });
    return () => {
      active = false;
      unlockWarRoomOrientation();
    };
  }, [enabled, viewport.phone]);

  const activateLandscape = useCallback(async () => {
    const result = await requestWarRoomLandscapeFullscreen();
    const state = result.landscape ? 'locked' : 'rejected';
    setLockState(state);
    return state;
  }, []);

  return {
    needsRotation: Boolean(enabled && viewport.phone && !viewport.landscape),
    lockState,
    activateLandscape,
  };
}

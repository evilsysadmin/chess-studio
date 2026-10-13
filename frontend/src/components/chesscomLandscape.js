import { useCallback, useEffect, useState } from 'react';
import {
  exitWarRoomBrowserFullscreen,
  getWarRoomBrowserFullscreenElement,
  requestWarRoomLandscapeFullscreen,
  unlockWarRoomOrientation,
} from './useWarRoomImmersive.js';

let attemptNumber = 0;
let ownsFullscreen = false;
let ownsOrientation = false;

export function isChesscomPhone({ win = globalThis.window } = {}) {
  if (!win || typeof win.matchMedia !== 'function') return false;
  const width = Number(win.innerWidth) || Number.POSITIVE_INFINITY;
  const height = Number(win.innerHeight) || Number.POSITIVE_INFINITY;
  return Boolean(win.matchMedia('(pointer: coarse)').matches &&
    Math.min(width, height) <= 620 && Math.max(width, height) <= 960);
}

export function needsChesscomRotation({ win = globalThis.window } = {}) {
  return isChesscomPhone({ win }) && win.innerHeight > win.innerWidth;
}

// Invoke from the button opening Chesscom, not from a mount effect: Android
// requires a user gesture before fullscreen + orientation.lock('landscape').
export async function requestChesscomLandscapeOnEntry({
  win = globalThis.window,
  doc = globalThis.document,
  screenApi = globalThis.screen,
} = {}) {
  if (!isChesscomPhone({ win })) {
    return { requested: false, fullscreen: false, landscape: false };
  }
  const attempt = ++attemptNumber;
  const result = await requestWarRoomLandscapeFullscreen({ doc, screenApi });
  // Entry can finish after a quick exit. Release any late-acquired resources
  // rather than locking the experiments hub sideways.
  if (attempt !== attemptNumber) {
    if (result.landscape) unlockWarRoomOrientation(screenApi);
    if (result.fullscreen) await exitWarRoomBrowserFullscreen(doc);
    return { requested: true, fullscreen: false, landscape: false };
  }
  // A retry may happen while our previously acquired fullscreen is still active.
  if (result.fullscreen) ownsFullscreen = true;
  if (result.landscape) ownsOrientation = true;
  return { requested: true, ...result };
}

export async function releaseChesscomLandscape({
  doc = globalThis.document,
  screenApi = globalThis.screen,
} = {}) {
  ++attemptNumber;
  const releaseOrientation = ownsOrientation;
  const releaseFullscreen = ownsFullscreen;
  ownsOrientation = false;
  ownsFullscreen = false;
  const unlocked = releaseOrientation ? unlockWarRoomOrientation(screenApi) : false;
  // Do not close fullscreen that belonged to the user or another mode.
  const fullscreen = releaseFullscreen && getWarRoomBrowserFullscreenElement(doc) === doc?.documentElement
    ? await exitWarRoomBrowserFullscreen(doc) : false;
  return { unlocked, fullscreen };
}

export function useChesscomLandscape() {
  const read = useCallback(() => needsChesscomRotation(), []);
  const [needsRotation, setNeedsRotation] = useState(read);

  useEffect(() => {
    const refresh = () => setNeedsRotation(read());
    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
    };
  }, [read]);

  return { needsRotation, activateLandscape: requestChesscomLandscapeOnEntry };
}

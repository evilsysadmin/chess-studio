import { useEffect } from 'react';

export function getWarRoomBrowserFullscreenElement(doc = globalThis.document) {
  if (!doc) return null;
  return doc.fullscreenElement || doc.webkitFullscreenElement || null;
}

export function requestWarRoomBrowserFullscreen(doc = globalThis.document) {
  const root = doc?.documentElement;
  const request = root?.requestFullscreen || root?.webkitRequestFullscreen;
  if (!root || typeof request !== 'function' || getWarRoomBrowserFullscreenElement(doc)) {
    return Promise.resolve(false);
  }

  try {
    return Promise.resolve(request.call(root)).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

export function requestWarRoomLandscape(screenApi = globalThis.screen) {
  const orientation = screenApi?.orientation;
  if (!orientation || typeof orientation.lock !== 'function') return Promise.resolve(false);

  try {
    return Promise.resolve(orientation.lock('landscape')).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}


export function shouldAutoRotateWarRoomOnEntry({
  win = globalThis.window,
} = {}) {
  if (!win) return false;
  const coarsePointer = Boolean(win.matchMedia?.('(pointer: coarse)')?.matches);
  const viewportWidth = Number(win.innerWidth) || Number.POSITIVE_INFINITY;
  return coarsePointer && viewportWidth <= 920;
}

export async function requestWarRoomLandscapeFullscreen({
  doc = globalThis.document,
  screenApi = globalThis.screen,
} = {}) {
  const fullscreen = await requestWarRoomBrowserFullscreen(doc);
  const landscape = await requestWarRoomLandscape(screenApi);
  return { fullscreen, landscape };
}

export async function requestWarRoomLandscapeOnEntry({
  win = globalThis.window,
  doc = globalThis.document,
  screenApi = globalThis.screen,
} = {}) {
  if (!shouldAutoRotateWarRoomOnEntry({ win })) return false;
  await requestWarRoomLandscapeFullscreen({ doc, screenApi });
  return true;
}

export function unlockWarRoomOrientation(screenApi = globalThis.screen) {
  const orientation = screenApi?.orientation;
  if (!orientation || typeof orientation.unlock !== 'function') return false;

  try {
    orientation.unlock();
    return true;
  } catch {
    return false;
  }
}

export function exitWarRoomBrowserFullscreen(doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!doc || !root || getWarRoomBrowserFullscreenElement(doc) !== root) return Promise.resolve(false);
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
  if (typeof exit !== 'function') return Promise.resolve(false);

  try {
    return Promise.resolve(exit.call(doc)).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

export function shouldStartWarRoomImmersive({ enabled, focusActive = false } = {}) {
  return Boolean(enabled) && !focusActive;
}

export default function useWarRoomImmersive({ enabled, focusActive = false } = {}) {
  const immersive = shouldStartWarRoomImmersive({ enabled, focusActive });

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('war-room-immersive-active', immersive);
    return () => document.body.classList.remove('war-room-immersive-active');
  }, [immersive]);

  useEffect(() => () => {
    void exitWarRoomBrowserFullscreen();
    unlockWarRoomOrientation();
  }, []);

  return { immersive };
}

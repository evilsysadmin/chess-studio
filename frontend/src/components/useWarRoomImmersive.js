import { useCallback, useEffect, useState } from 'react';

export function isWarRoomImmersiveExitKey(key) {
  return key === 'Escape' || key === 'Esc';
}

export function shouldExitWarRoomImmersive({ enabled, focusActive }) {
  return !enabled || Boolean(focusActive);
}

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

export default function useWarRoomImmersive({ enabled, focusActive = false } = {}) {
  const [immersive, setImmersive] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);

  const exitImmersive = useCallback(() => {
    setImmersive(false);
    setRailCollapsed(false);
    void exitWarRoomBrowserFullscreen();
  }, []);

  const toggleImmersive = useCallback(() => {
    if (!enabled || focusActive || immersive) {
      exitImmersive();
      return;
    }

    // Request native fullscreen from the trusted click/tap. If the browser
    // blocks or lacks the API, the existing fixed-viewport CSS remains the
    // graceful fallback instead of making the control a no-op on mobile.
    void requestWarRoomBrowserFullscreen();
    setImmersive(true);
  }, [enabled, exitImmersive, focusActive, immersive]);

  const toggleRail = useCallback(() => {
    if (!immersive) {
      setRailCollapsed(false);
      return;
    }
    setRailCollapsed((current) => !current);
  }, [immersive]);

  useEffect(() => {
    if (!immersive) return;
    if (shouldExitWarRoomImmersive({ enabled, focusActive })) exitImmersive();
  }, [enabled, exitImmersive, focusActive, immersive]);

  useEffect(() => {
    if (!immersive || typeof document === 'undefined') return undefined;

    const handleFullscreenChange = () => {
      if (getWarRoomBrowserFullscreenElement(document)) return;
      setImmersive(false);
      setRailCollapsed(false);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [immersive]);

  useEffect(() => {
    if (!immersive || typeof document === 'undefined') return undefined;

    const body = document.body;
    const handleKeyDown = (event) => {
      if (!isWarRoomImmersiveExitKey(event.key)) return;
      event.preventDefault();
      exitImmersive();
    };

    body.classList.add('war-room-immersive-active');
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      body.classList.remove('war-room-immersive-active');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exitImmersive, immersive]);

  useEffect(() => () => {
    void exitWarRoomBrowserFullscreen();
  }, []);

  return {
    immersive,
    railCollapsed,
    toggleImmersive,
    toggleRail,
    exitImmersive,
  };
}

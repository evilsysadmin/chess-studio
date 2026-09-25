import { useCallback, useEffect, useRef, useState } from 'react';

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
  if (!root || typeof request !== 'function') return Promise.resolve(false);

  try {
    return Promise.resolve(request.call(root)).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

export function exitWarRoomBrowserFullscreen(doc = globalThis.document) {
  if (!doc || !getWarRoomBrowserFullscreenElement(doc)) return Promise.resolve(false);
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
  const immersiveRef = useRef(false);
  const nativeFullscreenRef = useRef(false);

  const exitImmersive = useCallback(() => {
    immersiveRef.current = false;
    setImmersive(false);
    setRailCollapsed(false);

    if (nativeFullscreenRef.current) {
      nativeFullscreenRef.current = false;
      void exitWarRoomBrowserFullscreen();
    }
  }, []);

  const enterImmersive = useCallback(() => {
    if (!enabled || focusActive) {
      exitImmersive();
      return;
    }

    let fullscreenRequest = null;
    if (typeof document !== 'undefined' && !getWarRoomBrowserFullscreenElement(document)) {
      // Native fullscreen must be requested in the same trusted click/tap that
      // enters immersion. CSS fullscreen remains the fallback when the browser
      // does not expose or permit the Fullscreen API.
      fullscreenRequest = requestWarRoomBrowserFullscreen(document);
    }

    immersiveRef.current = true;
    setImmersive(true);

    if (fullscreenRequest) {
      void fullscreenRequest.then((entered) => {
        if (!entered) return;
        if (!immersiveRef.current) {
          void exitWarRoomBrowserFullscreen(document);
          return;
        }
        nativeFullscreenRef.current = true;
      });
    }
  }, [enabled, exitImmersive, focusActive]);

  const toggleImmersive = useCallback(() => {
    if (immersiveRef.current) {
      exitImmersive();
      return;
    }
    enterImmersive();
  }, [enterImmersive, exitImmersive]);

  const toggleRail = useCallback(() => {
    if (!immersiveRef.current) {
      setRailCollapsed(false);
      return;
    }
    setRailCollapsed((current) => !current);
  }, []);

  useEffect(() => {
    if (!immersive) return;
    if (shouldExitWarRoomImmersive({ enabled, focusActive })) exitImmersive();
  }, [enabled, exitImmersive, focusActive, immersive]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleFullscreenChange = () => {
      if (!nativeFullscreenRef.current || !immersiveRef.current) return;
      if (getWarRoomBrowserFullscreenElement(document)) return;

      nativeFullscreenRef.current = false;
      immersiveRef.current = false;
      setImmersive(false);
      setRailCollapsed(false);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

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
    immersiveRef.current = false;
    if (!nativeFullscreenRef.current) return;
    nativeFullscreenRef.current = false;
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

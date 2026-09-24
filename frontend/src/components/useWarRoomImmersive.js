import { useCallback, useEffect, useState } from 'react';

export function isWarRoomImmersiveExitKey(key) {
  return key === 'Escape' || key === 'Esc';
}

export function shouldExitWarRoomImmersive({ enabled, focusActive }) {
  return !enabled || Boolean(focusActive);
}

export default function useWarRoomImmersive({ enabled, focusActive = false } = {}) {
  const [immersive, setImmersive] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);

  const exitImmersive = useCallback(() => {
    setImmersive(false);
    setRailCollapsed(false);
  }, []);

  const toggleImmersive = useCallback(() => {
    if (!enabled || focusActive) {
      setImmersive(false);
      setRailCollapsed(false);
      return;
    }
    setImmersive((current) => {
      if (current) setRailCollapsed(false);
      return !current;
    });
  }, [enabled, focusActive]);

  const toggleRail = useCallback(() => {
    if (!immersive) {
      setRailCollapsed(false);
      return;
    }
    setRailCollapsed((current) => !current);
  }, [immersive]);

  useEffect(() => {
    if (!immersive) return;
    if (shouldExitWarRoomImmersive({ enabled, focusActive })) {
      setImmersive(false);
      setRailCollapsed(false);
    }
  }, [enabled, focusActive, immersive]);

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

  return {
    immersive,
    railCollapsed,
    toggleImmersive,
    toggleRail,
    exitImmersive,
  };
}

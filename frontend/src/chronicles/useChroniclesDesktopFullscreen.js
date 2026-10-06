import { useEffect } from 'react';

export function chroniclesDesktopFullscreenEligible(win = window) {
  if (!win?.matchMedia) return false;
  const finePointer = win.matchMedia('(pointer: fine)').matches;
  const touchPoints = Number(win.navigator?.maxTouchPoints || 0);
  return finePointer && touchPoints === 0 && Number(win.innerWidth || 0) >= 801;
}

export function useChroniclesDesktopFullscreen(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    if (!chroniclesDesktopFullscreenEligible(window)) return undefined;

    let disposed = false;
    let armed = false;
    const target = document.documentElement;

    const disarm = () => {
      if (!armed) return;
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      armed = false;
    };

    const request = async () => {
      if (
        disposed
        || !chroniclesDesktopFullscreenEligible(window)
        || document.fullscreenElement
        || typeof target?.requestFullscreen !== 'function'
      ) return Boolean(document.fullscreenElement);
      try {
        await target.requestFullscreen({ navigationUI: 'hide' });
        return Boolean(document.fullscreenElement);
      } catch {
        return false;
      }
    };

    const arm = () => {
      if (disposed || armed || document.fullscreenElement) return;
      armed = true;
      window.addEventListener('pointerdown', onGesture, true);
      window.addEventListener('keydown', onGesture, true);
    };

    function onGesture(event) {
      disarm();
      if (event?.type === 'keydown' && event.key === 'Escape') {
        arm();
        return;
      }
      void request().then((entered) => {
        if (!entered) arm();
      });
    }

    const onFullscreenChange = () => {
      if (document.fullscreenElement) disarm();
      else arm();
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    void request().then((entered) => {
      if (!entered) arm();
    });

    return () => {
      disposed = true;
      disarm();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, [active]);
}

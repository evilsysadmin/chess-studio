import { useEffect } from 'react';

export function chroniclesDesktopFullscreenEligible(win = window) {
  if (!win?.matchMedia) return false;
  const finePointer = win.matchMedia('(pointer: fine)').matches;
  return finePointer && Number(win.innerWidth || 0) >= 801;
}

export async function chroniclesRequestDesktopFullscreen(
  doc = document,
  win = window,
) {
  if (
    !doc
    || !win
    || !chroniclesDesktopFullscreenEligible(win)
    || doc.fullscreenElement
    || typeof doc.documentElement?.requestFullscreen !== 'function'
  ) return Boolean(doc?.fullscreenElement);

  try {
    await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return Boolean(doc.fullscreenElement);
  } catch {
    return false;
  }
}

export function useChroniclesDesktopFullscreen(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    if (!chroniclesDesktopFullscreenEligible(window)) return undefined;

    let disposed = false;
    let armed = false;
    const disarm = () => {
      if (!armed) return;
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      armed = false;
    };

    const request = async () => {
      if (disposed) return false;
      return chroniclesRequestDesktopFullscreen(document, window);
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

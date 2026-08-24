import { useEffect } from 'react';

export function useAuthenticatedAudio(loggedIn, ready) {
  useEffect(() => {
    if (!loggedIn || !ready) return undefined;
    let cancelled = false;
    let audio = null;
    import('./sound.js').then((module) => {
      audio = module;
      if (cancelled) {
        module.stopAmbientMusic();
        return;
      }
      module.startAmbientMusic();
    }).catch(() => {});
    return () => {
      cancelled = true;
      audio?.stopAmbientMusic?.();
    };
  }, [loggedIn, ready]);
}

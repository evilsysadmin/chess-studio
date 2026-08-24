import { useEffect } from 'react';

export function useAuthenticatedAudio(loggedIn, ready) {
  useEffect(() => {
    if (!loggedIn || !ready) return undefined;
    let cancelled = false;
    let audio = null;
    import('./sound.js').then((module) => {
      audio = module;
      if (cancelled) {
        module.disposeAmbientMusic();
        return;
      }
      module.restoreAmbientMusicSession();
    }).catch(() => {});
    return () => {
      cancelled = true;
      audio?.disposeAmbientMusic?.();
    };
  }, [loggedIn, ready]);
}

import { useEffect } from 'react';
import { bindAuthenticatedMediaSession } from './authenticatedMediaSession.js';

export function useAuthenticatedAudio(loggedIn, ready) {
  useEffect(() => {
    if (!loggedIn || !ready) return undefined;
    let cancelled = false;
    let audio = null;
    let releaseMediaSession = null;
    import('./sound.js').then((module) => {
      audio = module;
      if (cancelled) {
        module.disposeAmbientMusic();
        return;
      }
      module.restoreAmbientMusicSession();
      releaseMediaSession = bindAuthenticatedMediaSession(module);
    }).catch(() => {});
    return () => {
      cancelled = true;
      releaseMediaSession?.();
      audio?.disposeAmbientMusic?.();
    };
  }, [loggedIn, ready]);
}

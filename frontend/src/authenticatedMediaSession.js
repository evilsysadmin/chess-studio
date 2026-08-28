import { claimMediaSessionHandlers, requestPlaybackAudioSession } from './mediaControls.js';

// Mantiene los controles multimedia ligados a la sesión autenticada y no a
// una pantalla concreta. El reproductor visual puede montarse/desmontarse al
// entrar en una partida sin perder las media keys del teclado/SO.
export function bindAuthenticatedMediaSession(audio, {
  nav = globalThis.navigator,
  win = globalThis.window,
  doc = globalThis.document,
} = {}) {
  if (!audio) return () => {};

  const snapshot = () => audio.getAmbientPlaybackState?.() || {};
  const previous = () => audio.selectRelativeAmbientTheme?.(-1);
  const next = () => audio.selectRelativeAmbientTheme?.(1);
  const play = () => { audio.startAmbientMusic?.(); requestPlaybackAudioSession(nav); };
  const pause = () => audio.pauseAmbientMusic?.();
  const stop = () => audio.stopAmbientMusic?.();
  const seekTo = (seconds) => { audio.seekAmbientMusic?.(Math.max(0, Number(seconds || 0) * 1000)); requestPlaybackAudioSession(nav); };
  const seekBackward = (seconds = 10) => {
    const live = snapshot();
    audio.seekAmbientMusic?.(Math.max(0, Number(live.cyclePositionMs || 0) - Number(seconds || 10) * 1000));
  };
  const seekForward = (seconds = 10) => {
    const live = snapshot();
    const duration = Number(live.durationMs || 0);
    const target = Number(live.cyclePositionMs || 0) + Number(seconds || 10) * 1000;
    audio.seekAmbientMusic?.(duration > 0 ? Math.min(duration, target) : target);
  };

  const claim = () => {
    const live = snapshot();
    if (['playing', 'gap', 'paused'].includes(live.status)) requestPlaybackAudioSession(nav);
    return claimMediaSessionHandlers({ nav, previous, next, play, pause, stop, seekTo, seekBackward, seekForward });
  };

  const handleMediaKey = (event) => {
    if (event?.key === 'MediaTrackPrevious') { event.preventDefault?.(); previous(); }
    else if (event?.key === 'MediaTrackNext') { event.preventDefault?.(); next(); }
    else if (event?.key === 'MediaPlayPause') {
      event.preventDefault?.();
      const status = snapshot().status;
      if (status === 'playing' || status === 'gap') pause();
      else play();
    }
  };

  let release = claim();
  const reclaim = () => {
    if (doc?.visibilityState === 'hidden') return;
    release?.();
    release = claim();
  };

  win?.addEventListener?.('keydown', handleMediaKey);
  win?.addEventListener?.('focus', reclaim);
  doc?.addEventListener?.('visibilitychange', reclaim);
  win?.addEventListener?.('pointerdown', reclaim, { passive: true });

  return () => {
    win?.removeEventListener?.('keydown', handleMediaKey);
    win?.removeEventListener?.('focus', reclaim);
    doc?.removeEventListener?.('visibilitychange', reclaim);
    win?.removeEventListener?.('pointerdown', reclaim);
    release?.();
  };
}

// mediaControls.js — integración con controles multimedia del SO/navegador.
// No existe una API web para "robar" prioridad a otra pestaña. Hacemos lo
// máximo permitido: sesión playback (si existe), Media Session completa y
// re-claim cuando Chess Studio vuelve a foco/visibilidad.

export function requestPlaybackAudioSession(nav = globalThis.navigator) {
  try {
    if (nav?.audioSession && 'type' in nav.audioSession) nav.audioSession.type = 'playback';
  } catch {}
}

export function syncMediaSessionState({
  nav = globalThis.navigator,
  status = 'stopped',
  title = 'Música ambiental',
  durationMs = 0,
  positionMs = 0,
  playbackRate = 1,
} = {}) {
  const session = nav?.mediaSession;
  if (!session) return false;
  try {
    session.playbackState = status === 'playing' || status === 'gap' ? 'playing' : status === 'paused' ? 'paused' : 'none';
  } catch {}
  try {
    if (typeof globalThis.MediaMetadata !== 'undefined') {
      session.metadata = new globalThis.MediaMetadata({ title, artist: 'Chess Studio', album: 'Radio nocturna' });
    }
  } catch {}
  try {
    const duration = Math.max(0, Number(durationMs) || 0) / 1000;
    if (duration > 0 && typeof session.setPositionState === 'function') {
      const position = Math.min(duration, Math.max(0, Number(positionMs) || 0) / 1000);
      session.setPositionState({ duration, playbackRate: Math.max(0.1, Number(playbackRate) || 1), position });
    }
  } catch {}
  if (status === 'playing' || status === 'gap' || status === 'paused') requestPlaybackAudioSession(nav);
  else { try { if (nav?.audioSession && 'type' in nav.audioSession) nav.audioSession.type = 'auto'; } catch {} }
  return true;
}

export function claimMediaSessionHandlers({ nav = globalThis.navigator, previous, next, play, pause, stop } = {}) {
  const session = nav?.mediaSession;
  if (!session?.setActionHandler) return () => {};
  const handlers = {
    previoustrack: previous,
    nexttrack: next,
    play,
    pause,
    stop,
  };
  for (const [action, handler] of Object.entries(handlers)) {
    if (typeof handler !== 'function') continue;
    try { session.setActionHandler(action, handler); } catch {}
  }
  return () => {
    for (const action of Object.keys(handlers)) {
      try { session.setActionHandler(action, null); } catch {}
    }
  };
}

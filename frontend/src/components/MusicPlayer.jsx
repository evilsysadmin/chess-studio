import React, { useEffect, useMemo, useState } from 'react';
import {
  AMBIENT_THEME_OPTIONS,
  getAmbientPlaybackState,
  getAmbientVolume,
  getAmbientThemeId,
  isFxMuted,
  pauseAmbientMusic,
  selectRelativeAmbientTheme,
  seekAmbientMusic,
  setAmbientTheme,
  setAmbientVolume,
  setFxMuted,
  startAmbientMusic,
  stopAmbientMusic,
} from '../sound.js';

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function snapshot() {
  return getAmbientPlaybackState();
}

export default function MusicPlayer() {
  const [state, setState] = useState(() => snapshot());
  const [fxMuted, setFxMutedState] = useState(() => isFxMuted());
  const [volume, setVolume] = useState(() => Math.round(getAmbientVolume() * 100));
  const [seekPreviewMs, setSeekPreviewMs] = useState(null);

  useEffect(() => {
    const refresh = () => {
      setState(snapshot());
      setFxMutedState(isFxMuted());
      setVolume(Math.round(getAmbientVolume() * 100));
    };
    refresh();
    window.addEventListener('chess-ambient-transport', refresh);
    const timer = window.setInterval(refresh, 250);
    return () => {
      window.removeEventListener('chess-ambient-transport', refresh);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    // Teclas multimedia del sistema: Media Session es la vía fiable cuando
    // el navegador/desktop se queda las teclas dedicadas. El keydown es un
    // fallback útil para teclados/navegadores que sí las exponen al DOM.
    const handleMediaKey = (event) => {
      if (event.key === 'MediaTrackPrevious') {
        event.preventDefault();
        previous();
      } else if (event.key === 'MediaTrackNext') {
        event.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', handleMediaKey);

    const mediaSession = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
    if (mediaSession?.setActionHandler) {
      try { mediaSession.setActionHandler('previoustrack', previous); } catch {}
      try { mediaSession.setActionHandler('nexttrack', next); } catch {}
      try { mediaSession.setActionHandler('play', () => { startAmbientMusic(); setState(snapshot()); }); } catch {}
      try { mediaSession.setActionHandler('pause', () => { pauseAmbientMusic(); setState(snapshot()); }); } catch {}
    }

    return () => {
      window.removeEventListener('keydown', handleMediaKey);
      if (mediaSession?.setActionHandler) {
        try { mediaSession.setActionHandler('previoustrack', null); } catch {}
        try { mediaSession.setActionHandler('nexttrack', null); } catch {}
        try { mediaSession.setActionHandler('play', null); } catch {}
        try { mediaSession.setActionHandler('pause', null); } catch {}
      }
    };
  }, []);

  const themeId = state.themeId || getAmbientThemeId();
  const current = useMemo(
    () => AMBIENT_THEME_OPTIONS.find((theme) => theme.id === themeId) || AMBIENT_THEME_OPTIONS[0],
    [themeId],
  );

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaSession || typeof MediaMetadata === 'undefined') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current?.label || 'Música ambiental',
        artist: 'Chess Studio',
        album: 'Radio nocturna',
      });
    } catch {}
  }, [current]);

  const cycleMs = Math.max(1, state.visualCycleMs || 1);
  const displayedPositionMs = seekPreviewMs == null ? (state.cyclePositionMs || 0) : seekPreviewMs;
  const progress = Math.min(100, Math.max(0, (displayedPositionMs / cycleMs) * 100));
  const totalLabel = state.durationMs ? formatTime(state.durationMs) : '∞';
  // Durante el pequeño silencio automático la "radio" sigue activa: el botón
  // permanece en Pausa y permite detener la cola antes de que entre el tema
  // siguiente.
  const playing = state.status === 'playing' || state.status === 'gap';
  const paused = state.status === 'paused';

  function chooseTheme(event) {
    setAmbientTheme(event.target.value);
    setState(snapshot());
  }

  function previous() {
    selectRelativeAmbientTheme(-1);
    setState(snapshot());
  }

  function next() {
    selectRelativeAmbientTheme(1);
    setState(snapshot());
  }

  function playPause() {
    if (playing) pauseAmbientMusic();
    else startAmbientMusic();
    setState(snapshot());
  }

  function stop() {
    stopAmbientMusic();
    setState(snapshot());
  }

  function toggleFx() {
    const nextMuted = !fxMuted;
    setFxMuted(nextMuted);
    setFxMutedState(nextMuted);
  }

  function changeVolume(event) {
    const next = Number(event.target.value);
    setVolume(next);
    setAmbientVolume(next / 100);
  }

  function previewSeek(event) {
    setSeekPreviewMs(Number(event.target.value));
  }

  function commitSeek(event) {
    const next = Number(event.currentTarget.value);
    seekAmbientMusic(next);
    setSeekPreviewMs(null);
    setState(snapshot());
  }

  function seekKeyUp(event) {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commitSeek(event);
  }

  return (
    <div className="music-deck" role="group" aria-label="Reproductor y controles de audio">
      <div className="music-deck-display" title={current?.description || 'Música ambiental'}>
        <div className="music-deck-title-row">
          <span className={`music-deck-status-light ${playing ? 'is-playing' : paused ? 'is-paused' : 'is-stopped'}`} aria-hidden="true" />
          <span className="music-deck-track">{current?.label || 'Música ambiental'}</span>
          <span className="music-deck-time">
            {formatTime(displayedPositionMs)} / {totalLabel}
          </span>
        </div>
        <input
          className="music-deck-progress music-deck-seek"
          type="range"
          min="0"
          max={Math.max(1, state.durationMs || cycleMs)}
          step="250"
          value={Math.min(displayedPositionMs, Math.max(1, state.durationMs || cycleMs))}
          onChange={previewSeek}
          onPointerUp={commitSeek}
          onKeyUp={seekKeyUp}
          onBlur={(event) => { if (seekPreviewMs != null) commitSeek(event); }}
          aria-label="Posición de la pista"
          title="Arrastra para saltar a otro punto de la pista"
          style={{ '--seek-progress': `${progress}%` }}
        />
      </div>

      <div className="music-deck-controls">
        <div className="music-deck-transport" role="group" aria-label="Transporte musical">
          <button type="button" className="music-deck-button" onClick={previous} aria-label="Tema anterior" title="Tema anterior">⏮</button>
          <button
            type="button"
            className="music-deck-button music-deck-play"
            onClick={playPause}
            aria-label={playing ? 'Pausar música' : 'Reproducir música'}
            title={playing ? 'Pausa' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button type="button" className="music-deck-button" onClick={stop} aria-label="Detener música" title="Stop">■</button>
          <button type="button" className="music-deck-button" onClick={next} aria-label="Tema siguiente" title="Tema siguiente">⏭</button>
        </div>

        <label className="music-deck-selector" title={current?.description || 'Tema musical'}>
          <span className="sr-only">Tema musical</span>
          <select value={themeId} onChange={chooseTheme} aria-label="Tema musical">
            {AMBIENT_THEME_OPTIONS.map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.label}</option>
            ))}
          </select>
        </label>

        <div className="music-deck-bottom-row">
          <label className="music-deck-volume" title={`Volumen de música: ${volume}%`}>
            <span>VOL</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={volume}
              onChange={changeVolume}
              aria-label="Volumen de música"
            />
            <output>{volume}%</output>
          </label>

          <div className="music-deck-channels" role="group" aria-label="Canales de audio">
            <button
              type="button"
              className={`music-deck-channel${fxMuted ? ' is-off' : ' is-on'}`}
              onClick={toggleFx}
              aria-pressed={!fxMuted}
              aria-label={fxMuted ? 'Activar efectos de sonido' : 'Desactivar efectos de sonido'}
              title={fxMuted ? 'Activar efectos de sonido' : 'Desactivar efectos de sonido'}
            >
              <span aria-hidden="true">FX</span>
              <span>{fxMuted ? 'OFF' : 'ON'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

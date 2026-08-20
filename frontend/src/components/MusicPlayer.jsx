import React, { useEffect, useMemo, useState } from 'react';
import {
  AMBIENT_THEME_OPTIONS,
  getAmbientPlaybackState,
  getAmbientThemeId,
  isFxMuted,
  pauseAmbientMusic,
  selectRelativeAmbientTheme,
  setAmbientTheme,
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

  useEffect(() => {
    const refresh = () => {
      setState(snapshot());
      setFxMutedState(isFxMuted());
    };
    refresh();
    window.addEventListener('chess-ambient-transport', refresh);
    const timer = window.setInterval(refresh, 250);
    return () => {
      window.removeEventListener('chess-ambient-transport', refresh);
      window.clearInterval(timer);
    };
  }, []);

  const themeId = state.themeId || getAmbientThemeId();
  const current = useMemo(
    () => AMBIENT_THEME_OPTIONS.find((theme) => theme.id === themeId) || AMBIENT_THEME_OPTIONS[0],
    [themeId],
  );

  const cycleMs = Math.max(1, state.visualCycleMs || 1);
  const progress = Math.min(100, Math.max(0, ((state.cyclePositionMs || 0) / cycleMs) * 100));
  const totalLabel = state.durationMs ? formatTime(state.durationMs) : '∞';
  const playing = state.status === 'playing';
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

  return (
    <div className="music-deck" role="group" aria-label="Reproductor y controles de audio">
      <div className="music-deck-display" title={current?.description || 'Música ambiental'}>
        <div className="music-deck-title-row">
          <span className={`music-deck-status-light ${playing ? 'is-playing' : paused ? 'is-paused' : 'is-stopped'}`} aria-hidden="true" />
          <span className="music-deck-track">{current?.label || 'Música ambiental'}</span>
          <span className="music-deck-time">
            {formatTime(state.cyclePositionMs)} / {totalLabel}
          </span>
        </div>
        <div className="music-deck-progress" aria-hidden="true">
          <span className="music-deck-progress-fill" style={{ width: `${progress}%` }} />
        </div>
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
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AMBIENT_THEME_GROUPS,
  AMBIENT_THEME_OPTIONS,
  getAmbientPlaybackState,
  getAmbientRadioMode,
  isAmbientFavorite,
  isAmbientExcluded,
  getAmbientVolume,
  getAmbientThemeId,
  isFxMuted,
  pauseAmbientMusic,
  selectRelativeAmbientTheme,
  seekAmbientMusic,
  setAmbientTheme,
  setAmbientRadioMode,
  toggleAmbientFavorite,
  toggleAmbientExcluded,
  setAmbientVolume,
  setFxMuted,
  startAmbientMusic,
  stopAmbientMusic,
} from '../sound.js';
import { claimMediaSessionHandlers, requestPlaybackAudioSession, syncMediaSessionState } from '../mediaControls.js';

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function snapshot() {
  return getAmbientPlaybackState();
}

const MUSIC_DECK_EXPANDED_KEY = 'chess-music-deck-expanded';

function loadDeckExpanded() {
  try { return window.sessionStorage.getItem(MUSIC_DECK_EXPANDED_KEY) === '1'; } catch { return false; }
}

function saveDeckExpanded(value) {
  try { window.sessionStorage.setItem(MUSIC_DECK_EXPANDED_KEY, value ? '1' : '0'); } catch { /* storage opcional */ }
}

export default function MusicPlayer() {
  const [state, setState] = useState(() => snapshot());
  const [expanded, setExpanded] = useState(() => loadDeckExpanded());
  const [fxMuted, setFxMutedState] = useState(() => isFxMuted());
  const [volume, setVolume] = useState(() => Math.round(getAmbientVolume() * 100));
  const [seekPreviewMs, setSeekPreviewMs] = useState(null);
  const [radioMode, setRadioModeState] = useState(() => getAmbientRadioMode());
  const [favorite, setFavorite] = useState(false);
  const [excluded, setExcluded] = useState(false);
  const seekCommitTimer = useRef(null);

  useEffect(() => {
    const refresh = () => {
      setState(snapshot());
      setFxMutedState(isFxMuted());
      setVolume(Math.round(getAmbientVolume() * 100));
      setRadioModeState(getAmbientRadioMode());
      const activeId = snapshot().themeId || getAmbientThemeId();
      setFavorite(isAmbientFavorite(activeId));
      setExcluded(isAmbientExcluded(activeId));
    };
    refresh();
    window.addEventListener('chess-ambient-transport', refresh);
    const timer = window.setInterval(refresh, 250);
    return () => {
      window.removeEventListener('chess-ambient-transport', refresh);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => () => {
    if (seekCommitTimer.current) window.clearTimeout(seekCommitTimer.current);
  }, []);

  useEffect(() => {
    // No existe una prioridad absoluta entre pestañas: el navegador arbitra.
    // Reclamamos la sesión al montar y cada vez que Chess Studio recupera
    // foco/visibilidad; además declaramos AudioSession=playback si existe.
    const handleMediaKey = (event) => {
      if (event.key === 'MediaTrackPrevious') {
        event.preventDefault();
        previous();
      } else if (event.key === 'MediaTrackNext') {
        event.preventDefault();
        next();
      } else if (event.key === 'MediaPlayPause') {
        event.preventDefault();
        playPause();
      }
    };
    const claim = () => {
      const live = snapshot();
      if (live.status === 'playing' || live.status === 'gap' || live.status === 'paused') requestPlaybackAudioSession();
      return claimMediaSessionHandlers({
        previous,
        next,
        play: () => { startAmbientMusic(); setState(snapshot()); requestPlaybackAudioSession(); },
        pause: () => { pauseAmbientMusic(); setState(snapshot()); },
        stop: () => { stopAmbientMusic(); setState(snapshot()); },
        seekTo: (seconds) => { seekAmbientMusic(Number(seconds || 0) * 1000); setState(snapshot()); requestPlaybackAudioSession(); },
        seekBackward: (seconds = 10) => {
          const live = snapshot();
          seekAmbientMusic(Math.max(0, live.cyclePositionMs - Number(seconds || 10) * 1000));
          setState(snapshot());
        },
        seekForward: (seconds = 10) => {
          const live = snapshot();
          seekAmbientMusic(Math.min(live.durationMs || Infinity, live.cyclePositionMs + Number(seconds || 10) * 1000));
          setState(snapshot());
        },
      });
    };
    window.addEventListener('keydown', handleMediaKey);
    let release = claim();
    const reclaim = () => {
      if (document.visibilityState === 'hidden') return;
      release();
      release = claim();
      setState(snapshot());
    };
    window.addEventListener('focus', reclaim);
    document.addEventListener('visibilitychange', reclaim);
    window.addEventListener('pointerdown', reclaim, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleMediaKey);
      window.removeEventListener('focus', reclaim);
      document.removeEventListener('visibilitychange', reclaim);
      window.removeEventListener('pointerdown', reclaim);
      release();
    };
  }, []);

  const themeId = state.themeId || getAmbientThemeId();
  const current = useMemo(
    () => AMBIENT_THEME_OPTIONS.find((theme) => theme.id === themeId) || AMBIENT_THEME_OPTIONS[0],
    [themeId],
  );


  useEffect(() => {
    setFavorite(isAmbientFavorite(themeId));
    setExcluded(isAmbientExcluded(themeId));
  }, [themeId, state.status]);

  const mediaPositionSecond = Math.floor((state.cyclePositionMs || 0) / 1000);
  useEffect(() => {
    syncMediaSessionState({
      status: state.status,
      title: current?.label || 'Música ambiental',
      durationMs: state.durationMs || 0,
      positionMs: mediaPositionSecond * 1000,
    });
  }, [current, state.status, state.durationMs, mediaPositionSecond]);

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

  function toggleFavorite() {
    const next = toggleAmbientFavorite(themeId);
    setFavorite(next.has(themeId));
    setExcluded(false);
  }

  function toggleExcluded() {
    const next = toggleAmbientExcluded(themeId);
    setExcluded(next.has(themeId));
    setFavorite(false);
  }

  function changeRadioMode(event) {
    const next = setAmbientRadioMode(event.target.value);
    setRadioModeState(next);
  }

  function changeVolume(event) {
    const next = Number(event.target.value);
    setVolume(next);
    setAmbientVolume(next / 100);
  }

  function applySeek(nextValue) {
    const next = Number(nextValue);
    seekAmbientMusic(next);
    setSeekPreviewMs(null);
    setState(snapshot());
    requestPlaybackAudioSession();
  }

  function previewSeek(event) {
    const next = Number(event.target.value);
    setSeekPreviewMs(next);
    // Fallback deliberado: algunos navegadores/entornos pierden pointerup en
    // inputs range. Si el usuario deja de mover el thumb, hacemos commit igual.
    if (seekCommitTimer.current) window.clearTimeout(seekCommitTimer.current);
    seekCommitTimer.current = window.setTimeout(() => {
      seekCommitTimer.current = null;
      applySeek(next);
    }, 120);
  }

  function commitSeek(event) {
    if (seekCommitTimer.current) {
      window.clearTimeout(seekCommitTimer.current);
      seekCommitTimer.current = null;
    }
    applySeek(event.currentTarget.value);
  }

  function seekKeyUp(event) {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commitSeek(event);
  }

  function setDeckExpanded(next) {
    setExpanded(next);
    saveDeckExpanded(next);
  }

  if (!expanded) {
    return (
      <div className="music-deck music-deck-collapsed" role="group" aria-label="Reproductor de audio plegado">
        <button type="button" className="music-deck-expand" onClick={() => setDeckExpanded(true)} aria-label="Abrir reproductor de música" title="Abrir reproductor">
          <span className={`music-deck-status-light ${playing ? 'is-playing' : paused ? 'is-paused' : 'is-stopped'}`} aria-hidden="true" />
          <span aria-hidden="true">♫</span>
          <span className="music-deck-collapsed-track">{current?.label || 'Música'}</span>
          <span className="music-deck-collapsed-hint">abrir</span>
        </button>
        <button
          type="button"
          className="music-deck-button music-deck-collapsed-play"
          onClick={playPause}
          aria-label={playing ? 'Pausar música' : 'Reproducir música'}
          title={playing ? 'Pausa' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>
      </div>
    );
  }

  return (
    <div className="music-deck music-deck-expanded" role="group" aria-label="Reproductor y controles de audio">
      <button type="button" className="music-deck-collapse" onClick={() => setDeckExpanded(false)} aria-label="Plegar reproductor de música" title="Plegar reproductor">−</button>
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
          onPointerCancel={commitSeek}
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
            {AMBIENT_THEME_GROUPS.map((group) => (
              <optgroup key={group.genre} label={group.genre}>
                {group.themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>{theme.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="music-deck-radio-row">
          <label className="music-deck-radio-mode" title="Qué pistas puede elegir la radio automática">
            <span>RADIO</span>
            <select value={radioMode} onChange={changeRadioMode} aria-label="Modo de radio musical">
              <option value="all">Todo</option>
              <option value="favorites">Favoritos</option>
              <option value="focus">Concentración</option>
              {AMBIENT_THEME_GROUPS.map((group) => <option key={group.genre} value={`genre:${group.genre}`}>{group.genre}</option>)}
            </select>
          </label>
          <div className="music-deck-preferences" role="group" aria-label="Preferencias de la pista actual">
            <button type="button" className={`music-deck-pref ${favorite ? 'active' : ''}`} onClick={toggleFavorite} aria-pressed={favorite} aria-label="Marcar pista como favorita" title="Favorito">♥</button>
            <button type="button" className={`music-deck-pref ${excluded ? 'active danger' : ''}`} onClick={toggleExcluded} aria-pressed={excluded} aria-label="Excluir pista de la radio" title="Excluir de la radio">🚫</button>
          </div>
        </div>

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

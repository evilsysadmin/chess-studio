import { STORAGE_SESSION, getStorageItem, setStorageItem } from '../safeStorage.js';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  selectAmbientRadioModeTheme,
  seekAmbientMusic,
  setAmbientTheme,
  toggleAmbientFavorite,
  toggleAmbientExcluded,
  setAmbientVolume,
  setFxMuted,
  startAmbientMusic,
  stopAmbientMusic,
} from '../sound.js';
import { requestPlaybackAudioSession, syncMediaSessionState } from '../mediaControls.js';
import { getAudioContextState, resumeAudioContext } from '../audioContext.js';
import {
  MUSIC_PLAYER_PROGRESS_POLL_MS,
  musicPlayerShouldPollProgress,
} from './musicPlayerPolling.js';
import './MusicPlayerFloating.css';

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
const MUSIC_DECK_FLOAT_POSITION_KEY = 'chess-music-deck-float-position-v1';

function loadDeckExpanded() {
  try { return getStorageItem(STORAGE_SESSION, MUSIC_DECK_EXPANDED_KEY) === '1'; } catch { return false; }
}

function saveDeckExpanded(value) {
  try { setStorageItem(STORAGE_SESSION, MUSIC_DECK_EXPANDED_KEY, value ? '1' : '0'); } catch { /* storage opcional */ }
}

function loadFloatPosition() {
  try {
    const raw = getStorageItem(STORAGE_SESSION, MUSIC_DECK_FLOAT_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch {
    return null;
  }
}

function saveFloatPosition(position) {
  if (!position) return;
  try { setStorageItem(STORAGE_SESSION, MUSIC_DECK_FLOAT_POSITION_KEY, JSON.stringify(position)); } catch { /* storage opcional */ }
}

function clampFloatPosition(position, width = 360, height = 520) {
  if (typeof window === 'undefined') return position;
  const margin = 12;
  const maxX = Math.max(margin, window.innerWidth - Math.min(width, window.innerWidth - margin * 2) - margin);
  const maxY = Math.max(margin, window.innerHeight - Math.min(height, window.innerHeight - margin * 2) - margin);
  return {
    x: Math.min(maxX, Math.max(margin, Number(position?.x) || margin)),
    y: Math.min(maxY, Math.max(margin, Number(position?.y) || margin)),
  };
}

export default function MusicPlayer({ forceExpanded = false, initiallyCollapsed = false } = {}) {
  const [state, setState] = useState(() => snapshot());
  const [expanded, setExpanded] = useState(() => forceExpanded || (!initiallyCollapsed && loadDeckExpanded()));
  const [fxMuted, setFxMutedState] = useState(() => isFxMuted());
  const [volume, setVolume] = useState(() => Math.round(getAmbientVolume() * 100));
  const [seekPreviewMs, setSeekPreviewMs] = useState(null);
  const [radioMode, setRadioModeState] = useState(() => getAmbientRadioMode());
  const [favorite, setFavorite] = useState(false);
  const [excluded, setExcluded] = useState(false);
  const [warRoomFloating, setWarRoomFloating] = useState(false);
  const [floatPosition, setFloatPosition] = useState(() => loadFloatPosition());
  const seekCommitTimer = useRef(null);
  const deckRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let timer = 0;

    const refresh = () => {
      const nextState = snapshot();
      setState(nextState);
      setFxMutedState(isFxMuted());
      setVolume(Math.round(getAmbientVolume() * 100));
      setRadioModeState(getAmbientRadioMode());
      const activeId = nextState.themeId || getAmbientThemeId();
      setFavorite(isAmbientFavorite(activeId));
      setExcluded(isAmbientExcluded(activeId));
    };
    const stopPolling = () => {
      if (!timer) return;
      window.clearInterval(timer);
      timer = 0;
    };
    const startPolling = () => {
      if (timer) return;
      const documentVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
      if (!musicPlayerShouldPollProgress({ expanded, forceExpanded, documentVisible })) return;
      timer = window.setInterval(refresh, MUSIC_PLAYER_PROGRESS_POLL_MS);
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        stopPolling();
        return;
      }
      refresh();
      startPolling();
    };

    refresh();
    window.addEventListener('chess-ambient-transport', refresh);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    startPolling();
    return () => {
      window.removeEventListener('chess-ambient-transport', refresh);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      stopPolling();
    };
  }, [expanded, forceExpanded]);

  useEffect(() => () => {
    if (seekCommitTimer.current) window.clearTimeout(seekCommitTimer.current);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const refreshMode = () => {
      const desktop = typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 821px)').matches;
      setWarRoomFloating(Boolean(desktop && deckRef.current?.closest?.('.game-side-column-3d')));
    };
    refreshMode();
    window.addEventListener('resize', refreshMode);
    return () => window.removeEventListener('resize', refreshMode);
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !warRoomFloating || typeof window === 'undefined') return undefined;
    const frame = window.requestAnimationFrame(() => {
      const rect = deckRef.current?.getBoundingClientRect?.();
      const fallback = {
        x: Math.max(12, window.innerWidth - Math.min(360, window.innerWidth - 24) - 18),
        y: 58,
      };
      const next = clampFloatPosition(floatPosition || fallback, rect?.width || 360, rect?.height || 520);
      setFloatPosition(next);
      saveFloatPosition(next);
    });
    return () => window.cancelAnimationFrame(frame);
    // Reclampea también una posición guardada después de un cambio grande de viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, warRoomFloating]);

  useEffect(() => {
    if (!warRoomFloating || !floatPosition || typeof window === 'undefined') return undefined;
    const keepVisible = () => {
      const rect = deckRef.current?.getBoundingClientRect?.();
      setFloatPosition((current) => {
        const next = clampFloatPosition(current, rect?.width || 360, rect?.height || 520);
        saveFloatPosition(next);
        return next;
      });
    };
    window.addEventListener('resize', keepVisible);
    return () => window.removeEventListener('resize', keepVisible);
  }, [warRoomFloating, floatPosition?.x, floatPosition?.y]);

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
  const audioBlocked = playing && getAudioContextState() === 'suspended';

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
    const next = selectAmbientRadioModeTheme(event.target.value);
    setRadioModeState(next.mode);
    const nextState = snapshot();
    setState(nextState);
    if (nextState.status === 'playing') requestPlaybackAudioSession();
  }

  function chooseExperience(mode) {
    const next = selectAmbientRadioModeTheme(mode);
    setRadioModeState(next.mode);
    const nextState = snapshot();
    setState(nextState);
    if (nextState.status === 'playing') requestPlaybackAudioSession();
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

  useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);

  function setDeckExpanded(next) {
    if (forceExpanded) return;
    setExpanded(next);
    saveDeckExpanded(next);
  }

  function beginFloatDrag(event) {
    if (!warRoomFloating || event.button !== 0) return;
    const rect = deckRef.current?.getBoundingClientRect?.();
    if (!rect) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function moveFloatDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampFloatPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }, drag.width, drag.height);
    setFloatPosition(next);
  }

  function endFloatDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setFloatPosition((current) => {
      const next = clampFloatPosition(current, drag.width, drag.height);
      saveFloatPosition(next);
      return next;
    });
  }

  function nudgeFloat(event) {
    if (!warRoomFloating || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 10;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    const rect = deckRef.current?.getBoundingClientRect?.();
    setFloatPosition((current) => {
      const base = current || { x: rect?.left || 12, y: rect?.top || 58 };
      const next = clampFloatPosition({ x: base.x + dx, y: base.y + dy }, rect?.width || 360, rect?.height || 520);
      saveFloatPosition(next);
      return next;
    });
  }

  if (!expanded && !forceExpanded) {
    return (
      <div ref={deckRef} className="music-deck music-deck-collapsed" role="group" aria-label="Reproductor de audio plegado">
        <button type="button" className="music-deck-expand" onClick={() => setDeckExpanded(true)} aria-label="Abrir reproductor de música" title="Abrir reproductor">
          <span className={`music-deck-status-light ${playing ? 'is-playing' : paused ? 'is-paused' : 'is-stopped'}`} aria-hidden="true" />
          <span aria-hidden="true">♫</span>
          <span className="music-deck-collapsed-track">{current?.label || 'Música'}</span>
          <span className="music-deck-collapsed-hint">{audioBlocked ? 'toca para audio' : 'abrir'}</span>
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

  const floatingStyle = warRoomFloating && floatPosition
    ? { '--music-float-x': `${floatPosition.x}px`, '--music-float-y': `${floatPosition.y}px` }
    : undefined;

  return (
    <div
      ref={deckRef}
      className={`music-deck music-deck-expanded${warRoomFloating ? ' music-deck-floating' : ''}`}
      style={floatingStyle}
      role="group"
      aria-label="Reproductor y controles de audio"
    >
      {warRoomFloating && (
        <button
          type="button"
          className="music-deck-float-handle"
          onPointerDown={beginFloatDrag}
          onPointerMove={moveFloatDrag}
          onPointerUp={endFloatDrag}
          onPointerCancel={endFloatDrag}
          onKeyDown={nudgeFloat}
          aria-label="Mover RetroPlayer"
          title="Arrastra el RetroPlayer · flechas para ajustar"
        >
          RetroPlayer · mover
        </button>
      )}
      {!forceExpanded && (
        <button type="button" className="music-deck-collapse" onClick={() => setDeckExpanded(false)} aria-label="Plegar reproductor de música" title="Plegar reproductor">−</button>
      )}
      <div className="music-deck-display" title={current?.description || 'Música ambiental'}>
        <div className="music-deck-title-row">
          <span className={`music-deck-status-light ${playing ? 'is-playing' : paused ? 'is-paused' : 'is-stopped'}`} aria-hidden="true" />
          <span className="music-deck-track">{state.status === 'gap' ? 'Respirando antes del siguiente tema…' : (current?.label || 'Música ambiental')}</span>
          <span className="music-deck-time">
            {formatTime(displayedPositionMs)} / {totalLabel}
          </span>
        </div>
        {audioBlocked && (
          <button type="button" className="music-deck-audio-blocked" onClick={() => { void resumeAudioContext(); }}>
            Audio pausado por el navegador · reanudar
          </button>
        )}
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

        <div className="music-experiences" role="group" aria-label="Ambiente musical">
          <button type="button" className={radioMode === 'focus' ? 'active' : ''} onClick={() => chooseExperience('focus')} aria-pressed={radioMode === 'focus'}>Concentración</button>
          <button type="button" className={radioMode === 'genre:Clásica' ? 'active' : ''} onClick={() => chooseExperience('genre:Clásica')} aria-pressed={radioMode === 'genre:Clásica'}>Clásica</button>
          <button type="button" className={radioMode === 'genre:Energía' ? 'active' : ''} onClick={() => chooseExperience('genre:Energía')} aria-pressed={radioMode === 'genre:Energía'}>Energía</button>
          <button type="button" className={radioMode === 'genre:Ecléctica' ? 'active' : ''} onClick={() => chooseExperience('genre:Ecléctica')} aria-pressed={radioMode === 'genre:Ecléctica'}>Ecléctica</button>
          <button type="button" className={radioMode === 'all' ? 'active' : ''} onClick={() => chooseExperience('all')} aria-pressed={radioMode === 'all'}>Aleatorio</button>
        </div>

        <details className="music-deck-advanced">
          <summary>Explorar música</summary>
          <label className="music-deck-selector" title={current?.description || 'Tema musical'}>
            <span className="sr-only">Tema musical</span>
            <select value={themeId} onChange={chooseTheme} aria-label="Tema musical">
              {AMBIENT_THEME_GROUPS.map((group) => (
                <optgroup key={group.genre} label={group.genre}>
                  {group.themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
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
        </details>

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

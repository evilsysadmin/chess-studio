import { useEffect, useRef, useState } from 'react';
import { resolveChessFootballGodotUrl } from '../chessFootballGodotRuntime.js';
import { exitWarRoomBrowserFullscreen, requestWarRoomLandscapeFullscreen, unlockWarRoomOrientation } from './useWarRoomImmersive.js';
import './ChessFootballGodotHost.css';

function releaseChessFootballImmersiveMode() {
  const html = document.documentElement;
  if (html.dataset.chessFootballImmersive !== 'requested') return;

  delete html.dataset.chessFootballImmersive;
  unlockWarRoomOrientation();
  void exitWarRoomBrowserFullscreen();
}

function readMobileViewport() {
  if (typeof window === 'undefined') return { coarse: false, portrait: false };
  const coarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  return {
    coarse,
    portrait: window.innerHeight > window.innerWidth,
  };
}

export default function ChessFootballGodotHost({ onExit }) {
  const frameRef = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [bootFailed, setBootFailed] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(readMobileViewport);
  const [runtime, setRuntime] = useState({
    url: '',
    source: 'resolving',
    release: '',
  });

  useEffect(() => {
    const refreshViewport = () => setMobileViewport(readMobileViewport());
    refreshViewport();
    window.addEventListener('resize', refreshViewport);
    window.addEventListener('orientationchange', refreshViewport);
    return () => {
      window.removeEventListener('resize', refreshViewport);
      window.removeEventListener('orientationchange', refreshViewport);
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;

      // StrictMode can run an effect cleanup immediately after mount. Defer the
      // fallback release and only apply it if Football genuinely disappeared.
      window.setTimeout(() => {
        if (!document.querySelector('.chess-football-godot-host')) {
          releaseChessFootballImmersiveMode();
        }
      }, 0);
    };
  }, []);

  useEffect(() => {
    const handleRuntimeMessage = (event) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = event.data;
      if (!message || message.source !== 'chess-football-godot') return;
      if (message.type === 'ready') {
        setBootFailed(false);
        setRuntimeReady(true);
      } else if (message.type === 'exit') {
        releaseChessFootballImmersiveMode();
        onExit?.();
      }
    };
    window.addEventListener('message', handleRuntimeMessage);
    return () => window.removeEventListener('message', handleRuntimeMessage);
  }, [onExit]);

  useEffect(() => {
    let cancelled = false;
    setRuntimeReady(false);
    setBootFailed(false);
    setRuntime({ url: '', source: 'resolving', release: '' });
    resolveChessFootballGodotUrl().then((resolved) => {
      if (!cancelled) setRuntime(resolved);
    });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (!runtime.url || runtimeReady) return undefined;
    const timeout = window.setTimeout(() => setBootFailed(true), 20000);
    return () => window.clearTimeout(timeout);
  }, [runtime.url, runtimeReady]);

  const exitFootball = () => {
    releaseChessFootballImmersiveMode();
    onExit?.();
  };

  const requestLandscape = () => {
    document.documentElement.dataset.chessFootballImmersive = 'requested';
    void requestWarRoomLandscapeFullscreen();
  };

  const mobilePortrait = mobileViewport.coarse && mobileViewport.portrait;

  const runtimeStatus = bootFailed
    ? 'Chess Football no ha podido arrancar'
    : runtimeReady
    ? 'Chess Football listo'
    : runtime.source === 'fallback'
      ? 'POC Web todavía no publicado'
      : runtime.source === 'resolving'
        ? 'Resolviendo runtime Godot…'
        : 'Arrancando Chess Football…';

  return (
    <div
      className="chess-football-godot-host"
      data-runtime-ready={runtimeReady ? 'true' : 'false'}
      data-mobile-portrait={mobilePortrait ? 'true' : 'false'}
    >
      {mobileViewport.coarse && !mobilePortrait ? (
        <button
          type="button"
          className="chess-football-godot-host__mobile-exit"
          onClick={exitFootball}
          aria-label="Salir de Chess Football"
        >
          Salir
        </button>
      ) : null}

      {mobilePortrait ? (
        <div className="chess-football-godot-host__portrait-gate" role="dialog" aria-modal="true" aria-label="Chess Football necesita apaisado">
          <div className="chess-football-godot-host__portrait-card">
            <small>MÓVIL · APAISADO</small>
            <h2>Gira el móvil</h2>
            <p>Chess Football necesita el campo en horizontal. Puedes girarlo a mano o pedir al navegador que active el apaisado.</p>
            <div className="chess-football-godot-host__portrait-actions">
              <button type="button" onClick={requestLandscape}>Activar apaisado</button>
              <button type="button" className="is-secondary" onClick={exitFootball}>Salir de Chess Football</button>
            </div>
          </div>
        </div>
      ) : null}
      {!runtimeReady ? (
        <div className="chess-football-godot-host__status" aria-live="polite">
          <span aria-hidden="true" />
          {runtimeStatus}
        </div>
      ) : null}

      {bootFailed ? (
        <div className="chess-football-godot-host__fallback" role="alert">
          <h2>Chess Football no ha arrancado</h2>
          <p>El juego no confirmó que estuviera listo. Puedes reintentar o salir sin quedar atrapado en una pantalla negra.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Reintentar</button>
          <button type="button" onClick={exitFootball}>Salir de Chess Football</button>
        </div>
      ) : null}
      {runtime.url ? (
        <iframe
          ref={frameRef}
          key={runtime.url}
          className="chess-football-godot-host__frame"
          src={runtime.url}
          title="Chess Football Godot"
          allow="autoplay; fullscreen; gamepad"
          allowFullScreen
          onLoad={() => { /* iframe loaded != Godot ready; wait for the scene handshake. */ }}
        />
      ) : runtime.source === 'fallback' ? (
        <div className="chess-football-godot-host__fallback">
          <small>POC · GODOT WEB</small>
          <h2>Chess Football</h2>
          <p>El prototipo está cableado, pero el export Web aún no está publicado en el CDN.</p>
          <button type="button" className="secondary-btn" onClick={() => setAttempt((value) => value + 1)}>
            Reintentar
          </button>
        </div>
      ) : null}
    </div>
  );
}

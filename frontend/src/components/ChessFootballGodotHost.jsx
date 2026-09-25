import { useEffect, useState } from 'react';
import { resolveChessFootballGodotUrl } from '../chessFootballGodotRuntime.js';
import './ChessFootballGodotHost.css';

export default function ChessFootballGodotHost({ onExit }) {
  const [attempt, setAttempt] = useState(0);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtime, setRuntime] = useState({
    url: '',
    source: 'resolving',
    release: '',
  });

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
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRuntimeReady(false);
    setRuntime({ url: '', source: 'resolving', release: '' });
    resolveChessFootballGodotUrl().then((resolved) => {
      if (!cancelled) setRuntime(resolved);
    });
    return () => { cancelled = true; };
  }, [attempt]);

  const runtimeStatus = runtimeReady
    ? 'Chess Football listo'
    : runtime.source === 'fallback'
      ? 'POC Web todavía no publicado'
      : runtime.source === 'resolving'
        ? 'Resolviendo runtime Godot…'
        : 'Arrancando Chess Football…';

  return (
    <div className="chess-football-godot-host" data-runtime-ready={runtimeReady ? 'true' : 'false'}>
      <button
        type="button"
        className="chess-football-godot-host__exit"
        onClick={onExit}
        aria-label="Volver a Experimentos"
      >
        ←
      </button>

      <div className="chess-football-godot-host__status" aria-live="polite">
        <span className={runtimeReady ? 'is-ready' : ''} aria-hidden="true" />
        {runtimeStatus}
      </div>

      {runtime.url ? (
        <iframe
          key={runtime.url}
          className="chess-football-godot-host__frame"
          src={runtime.url}
          title="Chess Football Godot"
          allow="autoplay; fullscreen; gamepad"
          allowFullScreen
          onLoad={() => setRuntimeReady(true)}
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

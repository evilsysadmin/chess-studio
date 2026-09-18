import { useEffect, useRef, useState } from 'react';
import { LOCAL_GODOT_BOOTSTRAP_URL, resolvePawnSlugGodotUrl } from '../pawnSlugGodotRuntime.js';
import './PawnSlugGodotHost.css';

export default function PawnSlugGodotHost({ onExit }) {
  const iframeRef = useRef(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtime, setRuntime] = useState({ url: LOCAL_GODOT_BOOTSTRAP_URL, source: 'resolving', release: '' });

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
    resolvePawnSlugGodotUrl().then((resolved) => {
      if (cancelled) return;
      setRuntimeReady(false);
      setRuntime(resolved);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onMessage(event) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data;
      if (!message || message.source !== 'pawn-slug-godot') return;

      if (message.type === 'ready') setRuntimeReady(true);
      if (message.type === 'exit') onExit();
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onExit]);

  const runtimeStatus = runtimeReady
    ? 'Godot listo'
    : runtime.source === 'fallback'
      ? 'Export Godot aún no publicado'
      : runtime.source === 'resolving'
        ? 'Resolviendo runtime Godot…'
        : 'Arrancando runtime Godot…';

  return (
    <div className="pawn-slug-godot-host" data-runtime-ready={runtimeReady ? 'true' : 'false'}>
      {!runtimeReady && (
        <button
          type="button"
          className="pawn-slug-godot-host__fallback-exit"
          onClick={onExit}
          aria-label="Volver a Experimentos"
        >
          ←
        </button>
      )}

      <div className="pawn-slug-godot-host__frame-shell">
        <div
          className={`pawn-slug-godot-host__status${runtimeReady ? ' is-ready' : ''}`}
          aria-live="polite"
        >
          <span className={runtimeReady ? 'is-ready' : ''} aria-hidden="true" />
          {runtimeStatus}
        </div>
        <iframe
          key={runtime.url}
          ref={iframeRef}
          className="pawn-slug-godot-host__frame"
          src={runtime.url}
          title="Pawn Slug Godot"
          allow="autoplay; fullscreen; gamepad"
          allowFullScreen
        />
      </div>
    </div>
  );
}

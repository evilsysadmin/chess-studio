import { useEffect, useRef, useState } from 'react';
import { LOCAL_GODOT_BOOTSTRAP_URL, resolvePawnSlugGodotUrl } from '../pawnSlugGodotRuntime.js';
import './PawnSlugGodotHost.css';

export default function PawnSlugGodotHost({ onExit }) {
  const iframeRef = useRef(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtime, setRuntime] = useState({ url: LOCAL_GODOT_BOOTSTRAP_URL, source: 'resolving', release: '' });

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
    <div className="pawn-slug-godot-host">
      <header className="pawn-slug-godot-host__header">
        <div>
          <span className="section-label">POC · Godot Web</span>
          <h2>PAWN SLUG GODOT</h2>
          <p>Runtime Godot canónico. React abre la puerta; el juego, la simulación y el render viven dentro de Godot.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </header>

      <div className="pawn-slug-godot-host__frame-shell">
        <div className="pawn-slug-godot-host__status" aria-live="polite">
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

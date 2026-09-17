import { useEffect, useRef, useState } from 'react';
import './PawnSlugGodotHost.css';

const DEFAULT_GODOT_URL = '/games/pawn-slug-godot/index.html';

function configuredGameUrl() {
  const configured = import.meta.env.VITE_PAWN_SLUG_GODOT_URL;
  return typeof configured === 'string' && configured.trim() ? configured.trim() : DEFAULT_GODOT_URL;
}

export default function PawnSlugGodotHost({ onExit }) {
  const iframeRef = useRef(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const gameUrl = configuredGameUrl();

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

  return (
    <div className="pawn-slug-godot-host">
      <header className="pawn-slug-godot-host__header">
        <div>
          <span className="section-label">POC · Godot Web</span>
          <h2>PAWN SLUG GODOT</h2>
          <p>Runtime independiente. El Pawn Slug actual sigue intacto mientras éste aprende a disparar sin pedir permiso a React.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={onExit}>← Experimentos</button>
      </header>

      <div className="pawn-slug-godot-host__frame-shell">
        <div className="pawn-slug-godot-host__status" aria-live="polite">
          <span className={runtimeReady ? 'is-ready' : ''} aria-hidden="true" />
          {runtimeReady ? 'Godot listo' : 'Arrancando runtime Godot…'}
        </div>
        <iframe
          ref={iframeRef}
          className="pawn-slug-godot-host__frame"
          src={gameUrl}
          title="Pawn Slug Godot"
          allow="autoplay; fullscreen; gamepad"
          allowFullScreen
        />
      </div>
    </div>
  );
}

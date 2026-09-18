import { useEffect, useRef, useState } from 'react';
import { LOCAL_GODOT_BOOTSTRAP_URL, resolvePawnSlugGodotUrl } from '../pawnSlugGodotRuntime.js';
import { STORAGE_LOCAL, getStorageItem, setStorageItem } from '../safeStorage.js';
import './PawnSlugGodotHost.css';

const PAWN_SLUG_STAGE_IDS = ['industrial_front_v1', 'harbor_raid_v1', 'alpine_fortress_v1', 'jungle_relay_v1'];
const PAWN_SLUG_STAGE_INDEX_KEY = 'chess-studio:pawn-slug-stage-index';

function readStageIndex() {
  const raw = Number.parseInt(getStorageItem(STORAGE_LOCAL, PAWN_SLUG_STAGE_INDEX_KEY) || '0', 10);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw % PAWN_SLUG_STAGE_IDS.length;
}

function stageRuntimeUrl(url, stageId) {
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}stage=${encodeURIComponent(stageId)}`;
}

function advanceStageIndex() {
  const next = (readStageIndex() + 1) % PAWN_SLUG_STAGE_IDS.length;
  setStorageItem(STORAGE_LOCAL, PAWN_SLUG_STAGE_INDEX_KEY, String(next));
}

export default function PawnSlugGodotHost({ onExit }) {
  const iframeRef = useRef(null);
  const stageIdRef = useRef(PAWN_SLUG_STAGE_IDS[readStageIndex()]);
  const victoryAdvancedRef = useRef(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtime, setRuntime] = useState({
    url: stageRuntimeUrl(LOCAL_GODOT_BOOTSTRAP_URL, stageIdRef.current),
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
    resolvePawnSlugGodotUrl().then((resolved) => {
      if (cancelled) return;
      setRuntimeReady(false);
      setRuntime({
        ...resolved,
        url: stageRuntimeUrl(resolved.url, stageIdRef.current),
      });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onMessage(event) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data;
      if (!message || message.source !== 'pawn-slug-godot') return;

      if (message.type === 'ready') setRuntimeReady(true);
      if (message.type === 'victory' && !victoryAdvancedRef.current) {
        victoryAdvancedRef.current = true;
        advanceStageIndex();
      }
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

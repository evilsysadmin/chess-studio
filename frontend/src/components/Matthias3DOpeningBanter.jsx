import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { claimMatthias3DOpeningBanter } from '../matthias3DOpeningBanter.js';
import './Matthias3DOpeningBanter.css';

const BANTER_VISIBLE_MS = 4700;

export default function Matthias3DOpeningBanter({
  gameId,
  isThreeD = false,
  historyLength = 0,
  enabled = true,
}) {
  const [line, setLine] = useState('');
  const [portalHost, setPortalHost] = useState(null);

  useEffect(() => {
    setPortalHost(null);
    if (!isThreeD) return undefined;

    const findHost = () => document.querySelector('.game-board-stack-3d .board3d-main-shell');
    const existing = findHost();
    if (existing) {
      setPortalHost(existing);
      return undefined;
    }

    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => {
      const host = findHost();
      if (!host) return;
      setPortalHost(host);
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [gameId, isThreeD]);

  useEffect(() => {
    setLine('');
    if (!portalHost || !enabled || !isThreeD || Number(historyLength) !== 0 || !gameId) return undefined;

    const picked = claimMatthias3DOpeningBanter({ gameId, isThreeD: true, historyLength: 0 });
    if (!picked) return undefined;

    setLine(picked);
    const timer = window.setTimeout(() => setLine(''), BANTER_VISIBLE_MS);
    return () => window.clearTimeout(timer);
    // La tirada pertenece al arranque/remount de esta partida. Esperamos a que
    // exista la Sala de guerra real para que el bocadillo no expire mientras
    // Three/WebGL sigue cargando. No repetimos al llegar la primera jugada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, isThreeD, enabled, portalHost]);

  if (!isThreeD || !portalHost) return null;

  return createPortal(
    <div
      className="matthias-3d-opening-overlay"
      data-testid="matthias-3d-opening-overlay"
      data-speech-anchor="matthias-king"
    >
      <div className="warroom-chamber-label" aria-hidden="true">SALA DE GUERRA · CÁMARA TÁCTICA</div>
      {line && (
        <aside className="matthias-3d-opening-banter" role="status" aria-live="polite" aria-label="Bravuconada de Matthias al iniciar la partida">
          <span className="matthias-3d-opening-banter-name">MATTHIAS</span>
          <p>{line}</p>
        </aside>
      )}
    </div>,
    portalHost,
  );
}
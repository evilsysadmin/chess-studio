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
  anchorStyle = null,
  trackedSquare = null,
}) {
  const [line, setLine] = useState('');
  const [portalHost, setPortalHost] = useState(null);
  const anchorReady = Boolean(anchorStyle && trackedSquare);

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
    if (!portalHost || !enabled || !isThreeD || !anchorReady || Number(historyLength) !== 0 || !gameId) return undefined;

    const picked = claimMatthias3DOpeningBanter({ gameId, isThreeD: true, historyLength: 0 });
    if (!picked) return undefined;

    setLine(picked);
    const timer = window.setTimeout(() => setLine(''), BANTER_VISIBLE_MS);
    return () => window.clearTimeout(timer);
    // La tirada pertenece al arranque/remount de esta partida. Esperamos a que
    // exista la Sala de guerra y el ancla proyectada del rey real para que el
    // bocadillo nazca ya desde Matthias. Una vez visible, anchorStyle y
    // trackedSquare pueden seguir cambiando con FEN/cámara sin volver a reclamar
    // la frase: si el rey se mueve durante esos 4.7 s, el bocadillo lo sigue.
    // No repetimos al llegar la primera jugada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, isThreeD, enabled, portalHost, anchorReady]);

  if (!isThreeD || !portalHost) return null;

  return createPortal(
    <div
      className="matthias-3d-opening-overlay"
      data-testid="matthias-3d-opening-overlay"
      data-speech-anchor="matthias-king"
    >
      <div className="warroom-chamber-label" aria-hidden="true">SALA DE GUERRA · CÁMARA TÁCTICA</div>
      {line && anchorReady && (
        <aside
          className="matthias-3d-opening-banter"
          style={anchorStyle}
          data-matthias-square={trackedSquare || ''}
          role="status"
          aria-live="polite"
          aria-label="Bravuconada de Matthias al iniciar la partida"
        >
          <span className="matthias-3d-opening-banter-name">MATTHIAS</span>
          <p>{line}</p>
        </aside>
      )}
    </div>,
    portalHost,
  );
}

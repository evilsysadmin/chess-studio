import { useEffect, useState } from 'react';
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

  useEffect(() => {
    setLine('');
    if (!enabled || !isThreeD || Number(historyLength) !== 0 || !gameId) return undefined;

    const picked = claimMatthias3DOpeningBanter({ gameId, isThreeD: true, historyLength: 0 });
    if (!picked) return undefined;

    setLine(picked);
    const timer = window.setTimeout(() => setLine(''), BANTER_VISIBLE_MS);
    return () => window.clearTimeout(timer);
    // La tirada pertenece al arranque/remount de esta partida. No repetimos el
    // efecto cuando historyLength cambia por la primera jugada: gameId y el
    // storage de sesión son la identidad estable del evento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, isThreeD, enabled]);

  if (!isThreeD) return null;

  return (
    <div className="matthias-3d-opening-overlay" data-testid="matthias-3d-opening-overlay">
      <div className="warroom-chamber-label" aria-hidden="true">SALA DE GUERRA · CÁMARA TÁCTICA</div>
      {line && (
        <aside className="matthias-3d-opening-banter" role="status" aria-live="polite" aria-label="Bravuconada de Matthias al iniciar la partida">
          <span className="matthias-3d-opening-banter-name">MATTHIAS</span>
          <p>{line}</p>
        </aside>
      )}
    </div>
  );
}

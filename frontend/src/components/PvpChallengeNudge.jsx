import { useState } from 'react';
import './PvpChallengeNudge.css';

export default function PvpChallengeNudge({ challenge, onAccept, onDecline }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!challenge) return null;

  async function run(kind, action) {
    if (busy) return;
    setBusy(kind);
    setError('');
    try {
      await action?.(challenge);
    } catch (err) {
      setError(err?.message || 'No se pudo responder al reto.');
    } finally {
      setBusy('');
    }
  }

  return (
    <aside className="pvp-challenge-nudge" aria-label={`Reto 1 contra 1 de ${challenge.challenger}`}>
      <span className="pvp-challenge-nudge__signal" aria-hidden="true" />
      <div className="pvp-challenge-nudge__copy">
        <small>WAR ROOM · RETO ENTRANTE</small>
        <strong>{challenge.challenger} te reta</strong>
        <span>{challenge.challengerRating} Elo 1v1 · aceptar prepara el duelo; tu actividad actual queda guardada.</span>
        {error && <em role="alert">{error}</em>}
      </div>
      <div className="pvp-challenge-nudge__actions">
        <button type="button" className="secondary-btn" disabled={Boolean(busy)} onClick={() => void run('decline', onDecline)}>
          {busy === 'decline' ? 'Cerrando…' : 'Declinar'}
        </button>
        <button type="button" className="primary-btn" disabled={Boolean(busy)} onClick={() => void run('accept', onAccept)}>
          {busy === 'accept' ? 'Entrando…' : 'Aceptar'}
        </button>
      </div>
    </aside>
  );
}

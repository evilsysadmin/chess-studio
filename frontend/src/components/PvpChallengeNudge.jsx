import './PvpChallengeNudge.css';

export default function PvpChallengeNudge({ challenge, pendingCount = 1, busyKey = '', error = '', onAccept, onDecline }) {
  if (!challenge) return null;
  const accepting = busyKey === `accept:${challenge.id}`;
  const declining = busyKey === `decline:${challenge.id}`;
  return (
    <aside className="pvp-challenge-nudge" aria-label="Reto 1 contra 1 recibido" aria-live="polite">
      <span className="pvp-challenge-nudge__signal" aria-hidden="true" />
      <div className="pvp-challenge-nudge__copy">
        <small>RETO 1 VS 1{pendingCount > 1 ? ` · +${pendingCount - 1}` : ''}</small>
        <strong>{challenge.challenger}</strong>
        <span>{challenge.challengerRating} rating · quiere War Room</span>
        {error && <em>{error}</em>}
      </div>
      <div className="pvp-challenge-nudge__actions">
        <button type="button" className="primary-btn" disabled={Boolean(busyKey)} onClick={onAccept}>{accepting ? 'Entrando…' : 'Aceptar'}</button>
        <button type="button" className="text-action" disabled={Boolean(busyKey)} onClick={onDecline}>{declining ? 'Declinando…' : 'Ahora no'}</button>
      </div>
    </aside>
  );
}

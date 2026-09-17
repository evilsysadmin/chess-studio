import './HomePvpRosterLink.css';

export default function HomePvpRosterLink({
  onOpen,
  disabled = false,
  enrolled = false,
  rivalCount = 0,
  incomingCount = 0,
  activeMatch = null,
}) {
  const alert = incomingCount > 0;
  const headline = activeMatch
    ? 'Partida 1 vs 1 activa'
    : alert
      ? `${incomingCount} reto${incomingCount === 1 ? '' : 's'} pendiente${incomingCount === 1 ? '' : 's'}`
      : enrolled
        ? 'Disponible para 1 vs 1'
        : '1 vs 1 · fuera del roster';
  const detail = activeMatch
    ? 'Volver a la War Room'
    : alert
      ? 'Alguien ha llamado a la puerta'
      : enrolled
        ? (rivalCount ? `${rivalCount} rival${rivalCount === 1 ? '' : 'es'} disponible${rivalCount === 1 ? '' : 's'}` : 'Puedes seguir jugando; te avisaremos')
        : 'Enrólate y sigue jugando mientras esperas';

  return (
    <button
      type="button"
      className={`home-pvp-roster-link${enrolled ? ' is-enrolled' : ''}${alert ? ' has-alert' : ''}`}
      onClick={onOpen}
      disabled={disabled}
      aria-label="Abrir roster 1 contra 1 de War Room"
    >
      <span className="home-pvp-roster-link__signal" aria-hidden="true" />
      <span className="home-pvp-roster-link__copy"><strong>{headline}</strong><span>{detail}</span></span>
      <span className="home-pvp-roster-link__action" aria-hidden="true">›</span>
    </button>
  );
}

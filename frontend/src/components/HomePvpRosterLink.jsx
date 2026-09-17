import './HomePvpRosterLink.css';

export default function HomePvpRosterLink({
  onOpen,
  disabled = false,
  enrolled = false,
  rivalCount = 0,
  incomingCount = 0,
  activeMatch = null,
}) {
  const active = Boolean(activeMatch);
  const challenged = Number(incomingCount) > 0;
  const title = active ? 'Duelo activo' : challenged ? 'Reto pendiente' : enrolled ? 'En roster' : 'Duelo online';
  const detail = active
    ? 'Volver a la War Room 1 vs 1'
    : challenged
      ? 'Tienes un desafío esperando respuesta'
      : enrolled
        ? `${rivalCount} rival${rivalCount === 1 ? '' : 'es'} disponible${rivalCount === 1 ? '' : 's'} · sigue jugando normal`
        : 'Entra al roster y reta a otro jugador';

  return (
    <button
      type="button"
      className={`home-pvp-roster-link${enrolled ? ' is-enrolled' : ''}${active ? ' has-active-match' : ''}${challenged ? ' has-challenge' : ''}`}
      onClick={onOpen}
      disabled={disabled}
      aria-label="Abrir roster 1 contra 1 de War Room"
    >
      <span className="home-pvp-roster-link__emblem" aria-hidden="true">
        <span className="home-pvp-roster-link__signal" />
        <span className="home-pvp-roster-link__mark">♟</span>
      </span>
      <span className="home-pvp-roster-link__copy">
        <small>WAR ROOM · 1 VS 1</small>
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <span className="home-pvp-roster-link__action" aria-hidden="true">
        <span>{active ? 'VOLVER' : 'ROSTER'}</span>
        <b>›</b>
      </span>
    </button>
  );
}

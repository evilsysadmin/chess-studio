import './HomePvpRosterLink.css';

export default function HomePvpRosterLink({ onOpen, disabled = false }) {
  return (
    <button
      type="button"
      className="home-pvp-roster-link"
      onClick={onOpen}
      disabled={disabled}
      aria-label="Abrir roster 1 contra 1 de War Room"
    >
      <span className="home-pvp-roster-link__emblem" aria-hidden="true">
        <span className="home-pvp-roster-link__signal" />
        <span className="home-pvp-roster-link__mark">♟</span>
      </span>
      <span className="home-pvp-roster-link__copy">
        <small>WAR ROOM · HUMANO CONTRA HUMANO</small>
        <strong>Duelo online</strong>
        <span>Entra al roster y reta a otro jugador</span>
      </span>
      <span className="home-pvp-roster-link__action" aria-hidden="true">
        <span>ABRIR ROSTER</span>
        <b>›</b>
      </span>
    </button>
  );
}
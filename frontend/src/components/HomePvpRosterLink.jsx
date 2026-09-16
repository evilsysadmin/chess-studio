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
      <span className="home-pvp-roster-link__mark" aria-hidden="true">♟</span>
      <span className="home-pvp-roster-link__copy">
        <small>WAR ROOM · EN LÍNEA</small>
        <strong>ROSTER 1 VS 1</strong>
      </span>
      <span className="home-pvp-roster-link__chevron" aria-hidden="true">›</span>
    </button>
  );
}

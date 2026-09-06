import GameChat from './GameChat.jsx';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import './WarRoomReferencePolish.css';
import './WarRoomTurnPill.css';
import './WarRoom3DMobileControls.css';
import './WarRoomDesktopRailLayout.css';
import './WarRoomMatthiasDiegetic.css';

export default function GameWarRoomCommandColumn({
  game,
  rivalryRecord,
  status,
  board,
  side,
  compactViewport,
  onToggleBoardRenderer,
}) {
  return (
    <aside className="game-3d-command-column" aria-label="Puesto táctico de Matthias">
      <div
        className="game-3d-matthias-card is-diegetic-briefing"
        data-matthias-war-room-presence="king-piece"
      >
        <div className="game-3d-matthias-copy">
          <span>RIVAL EN SALA</span>
          <h2>{CPU_IDENTITY.name}</h2>
          <p>{CPU_IDENTITY.role} · nivel {game.difficulty}</p>
          {Number(rivalryRecord.games || 0) > 0 && (
            <small>{Number(rivalryRecord.wins || 0)}V · {Number(rivalryRecord.draws || 0)}T · {Number(rivalryRecord.losses || 0)}D contra ti</small>
          )}
        </div>
      </div>

      <div
        className="game-3d-warroom-status"
        role="status"
        aria-label="Estado de la partida"
        aria-live="polite"
      >
        <span>SITUACIÓN</span>
        <strong>{status.statusText}</strong>
      </div>

      {!compactViewport && (
        <GameChat messages={side.gameChat} contextMessages={side.gameContextMessages} />
      )}

      <div className="game-3d-warroom-controls" aria-label="Controles de vista 3D">
        <button type="button" className="secondary-btn is-selected" aria-pressed="true">3D</button>
        <button type="button" className="secondary-btn" onClick={onToggleBoardRenderer}>2D</button>
        {board.onCustomize && <button type="button" className="secondary-btn" onClick={board.onCustomize}>Apariencia</button>}
      </div>
    </aside>
  );
}

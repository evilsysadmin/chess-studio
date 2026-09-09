import { CPU_IDENTITY } from '../cpuIdentity.js';
import './WarRoomReferencePolish.css';
import './WarRoomTurnPill.css';
import './WarRoom3DMobileControls.css';
import './WarRoomDesktopRailLayout.css';
import './WarRoomMatthiasDiegetic.css';

function resolveWarRoomSignal(game, status) {
  const text = String(status?.statusText || '').trim();
  const humanColor = game?.humanColor || 'w';
  const humanTurn = game?.turn === humanColor;
  const thinking = Boolean(status?.busy) || /pensando|reintentar|cargando|calculando|transici[oó]n/i.test(text);

  if (thinking) return { tone: 'amber', label: 'Pensando…' };
  if (game?.isGameOver) return { tone: 'amber', label: text || 'Partida terminada' };

  if (humanTurn) {
    return { tone: 'green', label: !text || text === 'Tu turno' ? 'Tu turno' : text };
  }

  return {
    tone: 'red',
    label: !text || text === 'Turno de la CPU' ? `${CPU_IDENTITY.name} juega` : text,
  };
}

export default function GameWarRoomCommandColumn({
  game,
  status,
  board,
  onToggleBoardRenderer,
}) {
  const signal = resolveWarRoomSignal(game, status);

  return (
    <aside className="game-3d-command-column" aria-label="Puesto táctico de Matthias">
      <div
        className={`game-3d-turn-pill game-3d-matthias-card is-${signal.tone}`}
        data-matthias-war-room-presence="king-piece"
      >
        {CPU_IDENTITY.avatar && <img className="game-3d-turn-pill-avatar" src={CPU_IDENTITY.avatar} alt="" aria-hidden="true" />}
        <span className="game-3d-turn-pill-identity">
          <strong role="heading" aria-level="2">{CPU_IDENTITY.name}</strong>
          <span>· CPU nivel {game.difficulty}</span>
        </span>
        <span className="game-3d-turn-pill-divider" aria-hidden="true" />
        <span className="game-3d-turn-pill-light" aria-hidden="true" />
        <strong
          className="game-3d-turn-pill-label"
          role="status"
          aria-live="polite"
          aria-label="Estado de la partida"
        >
          {signal.label}
        </strong>
      </div>

      <div className="game-3d-warroom-controls" aria-label="Controles de vista 3D">
        <button type="button" className="secondary-btn is-selected" aria-pressed="true">3D</button>
        <button type="button" className="secondary-btn" onClick={onToggleBoardRenderer}>2D</button>
        {board.onCustomize && <button type="button" className="secondary-btn" onClick={board.onCustomize}>Apariencia</button>}
      </div>
    </aside>
  );
}

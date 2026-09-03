import GameChat from './GameChat.jsx';
import MatthiasWarRoomPortrait from './MatthiasWarRoomPortrait.jsx';
import { CPU_IDENTITY } from '../cpuIdentity.js';
import { matthiasMoodAvatar } from '../matthiasVisuals.js';

const WAR_ROOM_MATTHIAS_AVATAR = matthiasMoodAvatar('annoyed');

export default function GameWarRoomCommandColumn({
  game,
  rivalryRecord,
  status,
  board,
  side,
  compactViewport,
  activeMatthiasMessage,
  matthiasAnger,
  portraitReaction,
  onToggleBoardRenderer,
}) {
  return (
    <aside className="game-3d-command-column" aria-label="Puesto táctico de Matthias">
      <div className="game-3d-matthias-card">
        <MatthiasWarRoomPortrait
          avatar={WAR_ROOM_MATTHIAS_AVATAR}
          speechKey={activeMatthiasMessage?.id || activeMatthiasMessage?.text || ''}
          speechText={activeMatthiasMessage?.text || ''}
          angerLevel={matthiasAnger.level}
          reactionKey={portraitReaction.key}
          reactionType={portraitReaction.type}
        />
        <div className="game-3d-matthias-copy">
          <span>COMANDANTE RIVAL</span>
          <h2>{CPU_IDENTITY.name}</h2>
          <p>{CPU_IDENTITY.role} · nivel {game.difficulty}</p>
          {Number(rivalryRecord.games || 0) > 0 && (
            <small>{Number(rivalryRecord.wins || 0)}V · {Number(rivalryRecord.draws || 0)}T · {Number(rivalryRecord.losses || 0)}D contra ti</small>
          )}
        </div>
      </div>

      <div className="game-3d-warroom-status">
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
import { useMemo } from 'react';
import WarRoomBoardSurface from './WarRoomBoardSurface.jsx';
import {
  deploymentFen,
  deploymentSquareForSlot,
} from '../combatDeployment.js';
import './CombatPreparationRoom.css';

function levelForSaved(saved) {
  return 1
    + Math.max(0, Number(saved?.strengthPoints) || 0)
    + Math.max(0, Number(saved?.speedPoints) || 0);
}

export default function CombatPreparationRoom({ roster }) {
  const fen = useMemo(() => deploymentFen(roster), [roster]);
  const pieceRankLevels = useMemo(() => {
    const ranks = {};
    for (const [slotKey, unitKey] of Object.entries(roster?.deployment || {})) {
      const square = deploymentSquareForSlot(slotKey, 'w');
      if (!square || !unitKey) continue;
      const level = levelForSaved(roster?.pieces?.[unitKey]);
      if (level > 1) ranks[square] = level;
    }
    return ranks;
  }, [roster]);

  const boardProps = useMemo(() => ({
    gameId: 'combat-preparation-room',
    fen,
    onSquareClick: () => {},
    selectedSquare: null,
    legalTargets: [],
    animate: null,
    gameOver: true,
    turnState: null,
    orientation: 'white',
    showCoordinates: false,
    cameraProfile: 'warroom',
    immersive: true,
    warRoomMobilePerformance: true,
    pieceRankLevels,
  }), [fen, pieceRankLevels]);

  return (
    <div
      className="combat-preparation-room-stage"
      aria-label="Sala de operaciones de Combat Chess"
      data-combat-preparation-room="generic-war-room"
    >
      <WarRoomBoardSurface
        isThreeD
        boardProps={boardProps}
        loadingLabel="Preparando sala de operaciones…"
        loadingClassName="combat-preparation-room-loading"
      />
      <div className="combat-preparation-room-vignette" aria-hidden="true" />
    </div>
  );
}

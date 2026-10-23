import { useMemo } from 'react';
import { campaignMap, availableCampaignNodes } from '../combatCampaign.js';
import { projectCombatOperationsCampaignMap } from '../combatOperationsMapProjection.js';
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

export default function CombatPreparationRoom({ roster, campaign = null, cartography = null, onSectorInspect, onCustomize, inspectionPreview = false }) {
  const fen = useMemo(() => deploymentFen(roster), [roster]);
  const combatOperationsMap = useMemo(() => {
    const map = cartography || (campaign?.active
      ? projectCombatOperationsCampaignMap(campaignMap(campaign.seed), campaign, availableCampaignNodes(campaign))
      : null);
    return map && onSectorInspect ? { ...map, onInspect: onSectorInspect } : map;
  }, [campaign, cartography, onSectorInspect]);
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
    inspectionPreview,
    combatOperationsMap,
    immersive: true,
    warRoomVariantOverride: 'combat-ops',
    warRoomMobilePerformance: true,
    pieceRankLevels,
  }), [fen, pieceRankLevels, inspectionPreview, combatOperationsMap]);

  return (
    <div
      className="combat-preparation-room-stage"
      aria-label="Sala de operaciones de Combat Chess"
      data-combat-preparation-room="combat-operations-room"
    >
      <WarRoomBoardSurface
        isThreeD
        boardProps={boardProps}
        loadingLabel="Preparando sala de operaciones…"
        loadingClassName="combat-preparation-room-loading"
      />
      <div className="combat-preparation-room-vignette" aria-hidden="true" />
      {onCustomize && (
        <div className="combat-preparation-edit">
          <span>VISTA PREVIA DE TU FORMACIÓN</span>
          <button type="button" onClick={onCustomize} aria-label="Editar formación desde el tablero">
            ✎ Editar piezas →
          </button>
        </div>
      )}
    </div>
  );
}

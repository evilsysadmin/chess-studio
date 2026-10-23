import { useCallback, useMemo } from 'react';
import { campaignMap, availableCampaignNodes } from '../combatCampaign.js';
import { projectCombatOperationsCampaignMap } from '../combatOperationsMapProjection.js';
import { combatPreparationHonors } from '../combatPreparationHonors.js';
import WarRoomBoardSurface from './WarRoomBoardSurface.jsx';
import { deploymentFen } from '../combatDeployment.js';
import './CombatPreparationRoom.css';

export default function CombatPreparationRoom({ roster, campaign = null, cartography = null, onSectorInspect, onUnitInspect, onCustomize, inspectionPreview = false }) {
  const fen = useMemo(() => deploymentFen(roster), [roster]);
  const combatOperationsMap = useMemo(() => {
    const map = cartography || (campaign?.active
      ? projectCombatOperationsCampaignMap(campaignMap(campaign.seed), campaign, availableCampaignNodes(campaign))
      : null);
    return map && onSectorInspect ? { ...map, onInspect: onSectorInspect } : map;
  }, [campaign, cartography, onSectorInspect]);
  const handleUnitInspect = useCallback((square) => onUnitInspect?.(square), [onUnitInspect]);
  const { rankLevels: pieceRankLevels, medalCounts: pieceMedalCounts } = useMemo(
    () => combatPreparationHonors(roster), [roster],
  );

  const boardProps = useMemo(() => ({
    gameId: 'combat-preparation-room',
    fen,
    onSquareClick: handleUnitInspect,
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
    pieceMedalCounts,
  }), [fen, handleUnitInspect, pieceRankLevels, pieceMedalCounts, inspectionPreview, combatOperationsMap]);

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

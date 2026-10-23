import { useEffect } from 'react';
import { syncBoard3DRankInsignias } from './Board3DRankInsignia.js';

// Combat-only service ornaments. Never rebuild the shared renderer just
// because the returning army has earned a new decoration with the same FEN.
export default function useBoard3DCombatMedalRefresh({
  sceneStateRef, animationFrameRef, warRoomVariant, pieceMedalCounts, pieceRankLevels,
}) {
  useEffect(() => {
    if (warRoomVariant !== 'combat-ops') return;
    const state = sceneStateRef.current;
    if (!state || animationFrameRef.current) return;
    syncBoard3DRankInsignias(state);
    state.requestRender();
  }, [sceneStateRef, animationFrameRef, pieceMedalCounts, pieceRankLevels, warRoomVariant]);
}

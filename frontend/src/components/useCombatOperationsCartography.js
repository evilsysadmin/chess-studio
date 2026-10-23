import { useEffect } from 'react';
import { installCombatOperationsCampaignCartography } from './CombatOperationsCampaignCartography.js';

// Physical campaign projection has its own lifecycle, outside the shared
// Board3D renderer. It neither owns campaign state nor changes chess rules.
export default function useCombatOperationsCartography({
  sceneStateRef, variant, status, projection,
}) {
  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state || variant !== 'combat-ops' || !projection) return undefined;
    const root = state.scene.children.find((child) => child?.userData?.warRoomVariant === 'combat-ops');
    if (!root) return undefined;
    const dispose = installCombatOperationsCampaignCartography(root, projection);
    state.renderer.domElement.dataset.combatOperationsMapNodes =
      String(root.userData.combatOperationsLiveMapNodes || 0);
    state.renderer.domElement.dataset.combatOperationsMapEdges =
      String(root.userData.combatOperationsLiveMapEdges || 0);
    state.requestRender();
    return () => {
      dispose();
      delete state.renderer.domElement.dataset.combatOperationsMapNodes;
      delete state.renderer.domElement.dataset.combatOperationsMapEdges;
      // On unmount the renderer may already be disposed; only repaint live rooms.
      if (sceneStateRef.current === state) state.requestRender();
    };
  }, [sceneStateRef, variant, status, projection]);
}

// A WebGL canvas can exist (and render its black background) long before the
// actual room is usable. Never reveal it until both pieces and the selected
// room shell have completed their first synchronous paint.
const COMPLETE_SHELL_STATES = new Set(['idle', 'ready', 'fallback']);

export function warRoomFirstFrameReady(root, { requireCombatMap = false } = {}) {
  if (!root) return false;
  // Board3DCore already provides a usable 2D fallback when WebGL is lost.
  if (root.querySelector('.board3d-fallback')) return true;
  const canvas = root.querySelector('canvas.board3d-main-canvas');
  if (!canvas?.isConnected || canvas.width <= 0 || canvas.height <= 0) return false;
  const data = canvas.dataset;
  if (!COMPLETE_SHELL_STATES.has(data.warRoomVariantStatus)
    || !Object.hasOwn(data, 'board3dPieceBuilt')
    || String(data.warRoomVariant || '').endsWith('-loading')) return false;
  // A Combat briefing is not a complete first frame until the live seeded
  // cartography replaces the authored placeholder pins. Classic fallback is
  // still revealable if the Operations GLB fails to load.
  if (requireCombatMap && data.warRoomVariantStatus !== 'fallback') {
    return data.warRoomVariant === 'combat-ops'
      && Number(data.combatOperationsMapNodes) > 0;
  }
  return true;
}

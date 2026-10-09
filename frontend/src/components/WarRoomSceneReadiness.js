// A WebGL canvas can exist (and render its black background) long before the
// actual room is usable. Never reveal it until both pieces and the selected
// room shell have completed their first synchronous paint.
const COMPLETE_SHELL_STATES = new Set(['idle', 'ready', 'fallback']);

export function warRoomFirstFrameReady(root) {
  if (!root) return false;
  // Board3DCore already provides a usable 2D fallback when WebGL is lost.
  if (root.querySelector('.board3d-fallback')) return true;
  const canvas = root.querySelector('canvas.board3d-main-canvas');
  if (!canvas?.isConnected || canvas.width <= 0 || canvas.height <= 0) return false;
  const data = canvas.dataset;
  return COMPLETE_SHELL_STATES.has(data.warRoomVariantStatus)
    && Object.hasOwn(data, 'board3dPieceBuilt')
    && !String(data.warRoomVariant || '').endsWith('-loading');
}

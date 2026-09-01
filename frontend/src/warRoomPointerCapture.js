let installed = false;

export function captureWarRoomPointer(event) {
  if (!event || event.pointerType === 'mouse') return false;
  const canvas = event.target?.closest?.('.board3d-main-canvas');
  if (!canvas) return false;
  const shell = canvas.closest?.('.board3d-main-shell');
  if (shell?.dataset?.board3dInspect === 'true') return false;
  try {
    canvas.setPointerCapture?.(event.pointerId);
    canvas.dataset.warRoomTouchStage = 'captured';
    return true;
  } catch {
    return false;
  }
}

export function installWarRoomPointerCapture(root = globalThis.document) {
  if (!root?.addEventListener || installed) return () => {};
  installed = true;
  const onPointerDown = (event) => captureWarRoomPointer(event);
  root.addEventListener('pointerdown', onPointerDown, true);
  return () => {
    root.removeEventListener?.('pointerdown', onPointerDown, true);
    installed = false;
  };
}

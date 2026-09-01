let installed = false;

function scheduleMicrotask(callback) {
  if (typeof globalThis.queueMicrotask === 'function') {
    globalThis.queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
}

export function dispatchWarRoomAtomicTap(event, canvas) {
  if (!event || event.pointerType === 'mouse' || !canvas?.dispatchEvent) return false;
  const PointerEventCtor = canvas.ownerDocument?.defaultView?.PointerEvent || globalThis.PointerEvent;
  if (typeof PointerEventCtor !== 'function') return false;

  try {
    const syntheticUp = new PointerEventCtor('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: event.pointerId,
      pointerType: event.pointerType || 'touch',
      isPrimary: event.isPrimary !== false,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      button: 0,
      buttons: 0,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    });
    canvas.dispatchEvent(syntheticUp);
    canvas.dataset.warRoomAtomicTap = 'dispatched';
    return true;
  } catch {
    return false;
  }
}

export function captureWarRoomPointer(event, { schedule = scheduleMicrotask } = {}) {
  if (!event || event.pointerType === 'mouse') return false;
  const canvas = event.target?.closest?.('.board3d-main-canvas');
  if (!canvas) return false;
  const shell = canvas.closest?.('.board3d-main-shell');
  if (shell?.dataset?.board3dInspect === 'true') return false;

  try {
    canvas.setPointerCapture?.(event.pointerId);
    canvas.dataset.warRoomTouchStage = 'pointerdown';
    schedule(() => {
      if (!canvas.isConnected && canvas.ownerDocument) return;
      dispatchWarRoomAtomicTap(event, canvas);
    });
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

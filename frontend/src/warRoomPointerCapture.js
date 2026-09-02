let installed = false;

const TOUCH_POINTER_TYPES = new Set(['touch', 'pen']);
const POINTER_TOUCH_WINDOW_MS = 140;

function canvasFromTarget(target) {
  return target?.closest?.('.board3d-main-canvas') || null;
}

function shellFromCanvas(canvas) {
  return canvas?.closest?.('.board3d-main-shell') || null;
}

function inInspectMode(canvas) {
  return shellFromCanvas(canvas)?.dataset?.board3dInspect === 'true';
}

export function dispatchWarRoomFocusedRetry(canvas, { root = globalThis.document } = {}) {
  if (!canvas || inInspectMode(canvas)) return false;
  const shell = shellFromCanvas(canvas);
  const host = shell?.querySelector?.('.board3d-main-host') || null;
  const KeyboardEventCtor = root?.defaultView?.KeyboardEvent || globalThis.KeyboardEvent;
  if (!host?.dispatchEvent || typeof KeyboardEventCtor !== 'function') {
    if (canvas?.dataset) canvas.dataset.warRoomTouchRecovery = 'unavailable';
    return false;
  }

  try {
    const event = new KeyboardEventCtor('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    canvas.dataset.warRoomTouchRecovery = 'enter-retry';
    host.dispatchEvent(event);
    return true;
  } catch {
    canvas.dataset.warRoomTouchRecovery = 'failed';
    return false;
  }
}

function scheduleSelectionRecovery(canvas, root) {
  if (!canvas || inInspectMode(canvas)) return;
  const shell = shellFromCanvas(canvas);
  if (!shell) return;

  // Only recover the first selection tap. A second tap starts with a selected
  // piece and may legitimately clear selection because it is sending a move.
  if (canvas.dataset.warRoomSelectedAtPointerDown) {
    canvas.dataset.warRoomTouchRecovery = 'not-needed';
    return;
  }

  const view = root?.defaultView || globalThis.window;
  const recover = () => {
    const square = canvas.dataset.warRoomLastSquare || '';
    const selected = shell.dataset?.board3dSelected || '';
    const focused = shell.dataset?.board3dFocused || '';

    if (!square || selected || focused !== square) {
      canvas.dataset.warRoomTouchRecovery = selected ? 'selected' : 'not-applicable';
      return;
    }

    dispatchWarRoomFocusedRetry(canvas, { root });
  };

  const raf = view?.requestAnimationFrame?.bind?.(view);
  if (raf) {
    raf(() => raf(recover));
  } else {
    globalThis.setTimeout?.(recover, 34);
  }
}

export function captureWarRoomPointer(event, { root = globalThis.document } = {}) {
  if (!event || event.pointerType === 'mouse') return false;
  const canvas = canvasFromTarget(event.target);
  if (!canvas || inInspectMode(canvas)) return false;

  // Board3D owns pointer capture locally after its raycast; doing it here
  // during document capture can perturb Android/WebView event delivery before
  // the canvas handler has run. Keep only the internal state needed by touch
  // recovery; no user-visible diagnostics are rendered.
  canvas.dataset.warRoomObservedPointerType = event.pointerType || 'unknown';
  canvas.dataset.warRoomObservedTrusted = String(Boolean(event.isTrusted));
  canvas.dataset.warRoomTouchStage = 'observed-down';
  canvas.dataset.warRoomSelectedAtPointerDown = shellFromCanvas(canvas)?.dataset?.board3dSelected || '';
  canvas.dataset.warRoomTouchRecovery = 'pending';
  return true;
}

export function dispatchWarRoomTouchFallback(event, canvas) {
  if (!event || !canvas?.dispatchEvent || inInspectMode(canvas)) return false;
  const touch = event.changedTouches?.[0] || event.touches?.[0];
  if (!touch) return false;
  const PointerEventCtor = canvas.ownerDocument?.defaultView?.PointerEvent || globalThis.PointerEvent;
  if (typeof PointerEventCtor !== 'function') return false;

  try {
    const syntheticDown = new PointerEventCtor('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1000 + Number(touch.identifier || 0),
      pointerType: 'touch',
      isPrimary: true,
      clientX: touch.clientX,
      clientY: touch.clientY,
      screenX: touch.screenX,
      screenY: touch.screenY,
      button: 0,
      buttons: 1,
      pressure: Number.isFinite(touch.force) && touch.force > 0 ? touch.force : 0.5,
    });
    canvas.dataset.warRoomTouchFallback = 'dispatched';
    canvas.dispatchEvent(syntheticDown);
    if (event.cancelable) event.preventDefault?.();
    return true;
  } catch {
    canvas.dataset.warRoomTouchFallback = 'failed';
    return false;
  }
}

export function installWarRoomPointerCapture(root = globalThis.document) {
  if (!root?.addEventListener || installed) return () => {};
  installed = true;
  let lastPointerDown = null;

  const onPointerDown = (event) => {
    const canvas = canvasFromTarget(event.target);
    if (!canvas || inInspectMode(canvas)) return;
    lastPointerDown = {
      canvas,
      pointerType: event.pointerType || 'unknown',
      timeStamp: Number(event.timeStamp || 0),
    };
    captureWarRoomPointer(event, { root });
  };

  const onTouchStart = (event) => {
    const canvas = canvasFromTarget(event.target);
    if (!canvas || inInspectMode(canvas)) return;
    canvas.dataset.warRoomNativeTouchStart = 'seen';
    const eventTime = Number(event.timeStamp || 0);
    const recentNativePointer = Boolean(
      lastPointerDown
      && lastPointerDown.canvas === canvas
      && TOUCH_POINTER_TYPES.has(lastPointerDown.pointerType)
      && Math.abs(eventTime - lastPointerDown.timeStamp) <= POINTER_TOUCH_WINDOW_MS,
    );

    if (recentNativePointer) {
      scheduleSelectionRecovery(canvas, root);
      return;
    }

    dispatchWarRoomTouchFallback(event, canvas);
    scheduleSelectionRecovery(canvas, root);
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
  return () => {
    root.removeEventListener?.('pointerdown', onPointerDown, true);
    root.removeEventListener?.('touchstart', onTouchStart, true);
    installed = false;
  };
}

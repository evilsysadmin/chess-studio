let installed = false;

const TOUCH_POINTER_TYPES = new Set(['touch', 'pen']);
const POINTER_TOUCH_WINDOW_MS = 140;
const HUD_ID = 'war-room-real-device-touch-hud';

function canvasFromTarget(target) {
  return target?.closest?.('.board3d-main-canvas') || null;
}

function shellFromCanvas(canvas) {
  return canvas?.closest?.('.board3d-main-shell') || null;
}

function inInspectMode(canvas) {
  return shellFromCanvas(canvas)?.dataset?.board3dInspect === 'true';
}

function diagnosticEnabled(root) {
  const view = root?.defaultView || globalThis.window;
  const hostname = String(view?.location?.hostname || '');
  const search = String(view?.location?.search || '');
  return /(^|\.)staging\./i.test(hostname) || /(?:^|[?&])warroomDiag=1(?:&|$)/.test(search);
}

function targetLabel(target) {
  if (!target) return '—';
  const tag = String(target.tagName || target.nodeName || 'node').toLowerCase();
  const classes = typeof target.className === 'string'
    ? target.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
    : '';
  return classes ? `${tag}.${classes}` : tag;
}

function ensureDiagnosticHud(canvas, root) {
  if (!diagnosticEnabled(root)) return null;
  const shell = shellFromCanvas(canvas);
  if (!shell) return null;
  let hud = root?.getElementById?.(HUD_ID) || null;
  if (hud) return hud;
  hud = root?.createElement?.('div') || null;
  if (!hud) return null;
  hud.id = HUD_ID;
  hud.setAttribute?.('role', 'status');
  hud.setAttribute?.('aria-live', 'polite');
  hud.style.cssText = [
    'position:fixed',
    'left:6px',
    'bottom:6px',
    'z-index:2147483647',
    'max-width:calc(100vw - 12px)',
    'padding:6px 8px',
    'border:1px solid rgba(150,255,190,.7)',
    'border-radius:7px',
    'background:rgba(3,12,9,.88)',
    'color:#d9ffe5',
    'font:600 11px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    'white-space:pre-wrap',
    'pointer-events:none',
    'box-shadow:0 2px 12px rgba(0,0,0,.38)',
  ].join(';');
  shell.appendChild?.(hud);
  return hud;
}

function refreshDiagnosticHud(canvas, root, eventName, event = null, extra = '') {
  const hud = ensureDiagnosticHud(canvas, root);
  if (!hud) return;
  const shell = shellFromCanvas(canvas);
  const view = root?.defaultView || globalThis.window;
  const rect = canvas?.getBoundingClientRect?.();
  const pointerType = event?.pointerType || canvas?.dataset?.warRoomObservedPointerType || '—';
  const x = Number.isFinite(event?.clientX) ? Math.round(event.clientX) : '—';
  const y = Number.isFinite(event?.clientY) ? Math.round(event.clientY) : '—';
  const coarse = Boolean(view?.matchMedia?.('(pointer: coarse)')?.matches);
  const square = canvas?.dataset?.warRoomLastSquare || '—';
  const selected = shell?.dataset?.board3dSelected || '—';
  const focused = shell?.dataset?.board3dFocused || '—';
  const legal = shell?.dataset?.board3dLegalTargetCount || '0';
  const stage = canvas?.dataset?.warRoomTouchStage || '—';
  const fallback = canvas?.dataset?.warRoomTouchFallback || '—';
  const recovery = canvas?.dataset?.warRoomTouchRecovery || '—';
  const trusted = event ? String(Boolean(event.isTrusted)) : canvas?.dataset?.warRoomObservedTrusted || '—';
  hud.textContent = [
    'WAR ROOM · TOUCH DIAG',
    `event=${eventName} pointer=${pointerType} trusted=${trusted} target=${targetLabel(event?.target)}`,
    `xy=${x},${y} canvas=${rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : '—'} coarse=${coarse} dpr=${view?.devicePixelRatio || '—'}`,
    `square=${square} selected=${selected} focused=${focused} legal=${legal}`,
    `stage=${stage} fallback=${fallback} recovery=${recovery}${extra ? ` · ${extra}` : ''}`,
  ].join('\n');
}

function scheduleDiagnosticRefresh(canvas, root, eventName, event, extra = '') {
  const view = root?.defaultView || globalThis.window;
  const run = () => refreshDiagnosticHud(canvas, root, eventName, event, extra);
  if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(run);
  else Promise.resolve().then(run);
  view?.requestAnimationFrame?.(run);
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
      scheduleDiagnosticRefresh(canvas, root, 'recovery-check', null);
      return;
    }

    const dispatched = dispatchWarRoomFocusedRetry(canvas, { root });
    scheduleDiagnosticRefresh(
      canvas,
      root,
      'recovery',
      null,
      dispatched ? 'React Enter retry' : 'retry unavailable',
    );
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

  // Diagnostic observer only. Board3D owns pointer capture locally after its
  // raycast; doing it here during document capture can perturb Android/WebView
  // event delivery before the canvas handler has run.
  canvas.dataset.warRoomObservedPointerType = event.pointerType || 'unknown';
  canvas.dataset.warRoomObservedTrusted = String(Boolean(event.isTrusted));
  canvas.dataset.warRoomTouchStage = 'observed-down';
  canvas.dataset.warRoomSelectedAtPointerDown = shellFromCanvas(canvas)?.dataset?.board3dSelected || '';
  canvas.dataset.warRoomTouchRecovery = 'pending';
  scheduleDiagnosticRefresh(canvas, root, 'pointerdown', event);
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
      scheduleDiagnosticRefresh(canvas, root, 'touchstart', null, 'native pointer OK');
      scheduleSelectionRecovery(canvas, root);
      return;
    }

    const dispatched = dispatchWarRoomTouchFallback(event, canvas);
    scheduleDiagnosticRefresh(
      canvas,
      root,
      'touchstart',
      null,
      dispatched ? 'fallback pointerdown dispatched' : 'fallback unavailable',
    );
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

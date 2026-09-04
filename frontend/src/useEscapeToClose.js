import { useEffect, useRef } from 'react';
import { createBackNavigationStack } from './backNavigationStack.js';

// Un único "back stack" para toda la UI. Antes cada pantalla/modal instalaba
// su propio listener de Escape en document; si había un modal encima de una
// pantalla, podían dispararse DOS callbacks (cerrar el modal y salir además de
// la pantalla). Ahora sólo responde el manejador más reciente.
const backStack = createBackNavigationStack();
const BROWSER_BACK_SENTINEL = '__chessStudioBackSentinel';
let listenersInstalled = false;
let browserBackArmed = false;

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function isTouchLikeContextMenu(event) {
  return event?.pointerType === 'touch'
    || event?.pointerType === 'pen'
    || event?.sourceCapabilities?.firesTouchEvents === true;
}

function canUseBrowserHistory() {
  return typeof window !== 'undefined' && !!window.history?.pushState;
}

function armBrowserBack() {
  if (browserBackArmed || !backStack.size() || !canUseBrowserHistory()) return;
  try {
    const current = window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};
    window.history.pushState(
      { ...current, [BROWSER_BACK_SENTINEL]: true },
      '',
      window.location.href,
    );
    browserBackArmed = true;
  } catch {
    // History can be unavailable in hardened/private browser contexts. Escape
    // and the visible UI controls remain valid fallbacks.
  }
}

function disarmBrowserBackIfIdle() {
  if (backStack.size() || !browserBackArmed || !canUseBrowserHistory()) return;
  const ownsCurrentEntry = window.history.state?.[BROWSER_BACK_SENTINEL] === true;
  browserBackArmed = false;
  if (!ownsCurrentEntry) return;
  try {
    // The sentinel uses the same URL, so removing it is invisible. Mark it
    // disarmed first so its asynchronous popstate cannot fire a second back.
    window.history.back();
  } catch {
    // Best effort only; never make navigation depend on History API support.
  }
}

function dispatchBack(event) {
  backStack.dispatch(event, {
    editableTarget: event.type === 'contextmenu' && isEditableTarget(event.target),
    touchLikeContextMenu: event.type === 'contextmenu' && isTouchLikeContextMenu(event),
  });
}

function dispatchBrowserBack(event) {
  if (!browserBackArmed) return;
  browserBackArmed = false;
  const handled = backStack.dispatch({
    type: 'popstate',
    stopPropagation: () => event?.stopPropagation?.(),
  });
  if (!handled) return;

  // React may unmount the top modal/screen after the callback. Re-arm only
  // after that commit: if a parent handler remains, the next Android/browser
  // Back closes it; if the stack became empty, the browser is free again.
  setTimeout(() => armBrowserBack(), 0);
}

function installGlobalListeners() {
  if (listenersInstalled || typeof document === 'undefined') return;
  listenersInstalled = true;
  document.addEventListener('keydown', dispatchBack);
  document.addEventListener('contextmenu', dispatchBack);
  window?.addEventListener?.('popstate', dispatchBrowserBack);
  armBrowserBack();
}

function uninstallGlobalListenersIfIdle() {
  if (!listenersInstalled || backStack.size() || typeof document === 'undefined') return;
  disarmBrowserBackIfIdle();
  document.removeEventListener('keydown', dispatchBack);
  document.removeEventListener('contextmenu', dispatchBack);
  window?.removeEventListener?.('popstate', dispatchBrowserBack);
  listenersInstalled = false;
}

// ESC, clic derecho de ratón y Back del navegador/sistema ejecutan la misma
// acción de "volver/cerrar". Una pulsación larga táctil NO cuenta como back.
// `disabled` permite a una pantalla padre ceder el control a una subpantalla
// activa (por ejemplo Roguelike -> Combate) sin dos niveles armados a la vez.
export function useEscapeToClose(onClose, { disabled = false } = {}) {
  const callbackRef = useRef(onClose);
  const idRef = useRef(Symbol('back-handler'));
  callbackRef.current = onClose;

  useEffect(() => {
    if (disabled) return undefined;
    const entry = { id: idRef.current, callbackRef };
    backStack.push(entry);
    installGlobalListeners();
    armBrowserBack();

    return () => {
      backStack.remove(entry.id);
      uninstallGlobalListenersIfIdle();
    };
  }, [disabled]);
}

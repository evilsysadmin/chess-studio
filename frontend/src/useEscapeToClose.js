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
let browserBackDisarmTimer = null;
let browserBackProgrammaticPopPending = false;

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

function clearScheduledBrowserBackDisarm() {
  if (browserBackDisarmTimer == null) return;
  clearTimeout(browserBackDisarmTimer);
  browserBackDisarmTimer = null;
}

function armBrowserBack() {
  clearScheduledBrowserBackDisarm();
  if (
    browserBackArmed
    || browserBackProgrammaticPopPending
    || !backStack.size()
    || !canUseBrowserHistory()
  ) return;
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

function scheduleBrowserBackDisarmIfIdle() {
  if (browserBackDisarmTimer != null || !browserBackArmed || !canUseBrowserHistory()) return;

  browserBackDisarmTimer = setTimeout(() => {
    browserBackDisarmTimer = null;
    // React puede desmontar un handler y montar el siguiente dentro de una
    // misma transición (Roguelike -> Combate, pantalla -> modal, etc.). No
    // confundimos ese hueco efímero con abandonar realmente la superficie.
    if (backStack.size() || !browserBackArmed || !canUseBrowserHistory()) return;

    const ownsCurrentEntry = window.history.state?.[BROWSER_BACK_SENTINEL] === true;
    browserBackArmed = false;
    if (!ownsCurrentEntry) return;

    try {
      // Quitar el sentinel provoca un popstate asíncrono. Lo marcamos como
      // mantenimiento interno para que, aunque entretanto se monte otro
      // handler, jamás se interprete como Back pulsado por el usuario.
      browserBackProgrammaticPopPending = true;
      window.history.back();
    } catch {
      browserBackProgrammaticPopPending = false;
    }
  }, 0);
}

function dispatchBack(event) {
  backStack.dispatch(event, {
    editableTarget: event.type === 'contextmenu' && isEditableTarget(event.target),
    touchLikeContextMenu: event.type === 'contextmenu' && isTouchLikeContextMenu(event),
  });
}

function dispatchBrowserBack(event) {
  if (browserBackProgrammaticPopPending) {
    browserBackProgrammaticPopPending = false;
    browserBackArmed = false;
    // Si una transición interna repobló la pila mientras llegaba este
    // popstate de mantenimiento, armamos un sentinel nuevo después del commit.
    setTimeout(() => armBrowserBack(), 0);
    return;
  }

  if (!browserBackArmed) return;
  clearScheduledBrowserBackDisarm();
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
  scheduleBrowserBackDisarmIfIdle();
  document.removeEventListener('keydown', dispatchBack);
  document.removeEventListener('contextmenu', dispatchBack);
  // Conservamos temporalmente popstate mientras el sentinel se retira. El
  // listener se quitará cuando ese pop interno haya llegado o cuando la pila
  // siga realmente vacía en el siguiente tick.
  listenersInstalled = false;
}

function ensurePopstateListener() {
  if (typeof window === 'undefined') return;
  window.removeEventListener?.('popstate', dispatchBrowserBack);
  window.addEventListener?.('popstate', dispatchBrowserBack);
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
    clearScheduledBrowserBackDisarm();
    installGlobalListeners();
    ensurePopstateListener();
    armBrowserBack();

    return () => {
      backStack.remove(entry.id);
      uninstallGlobalListenersIfIdle();
    };
  }, [disabled]);
}

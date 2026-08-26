import { useEffect, useRef } from 'react';
import { createBackNavigationStack } from './backNavigationStack.js';

// Un único "back stack" para toda la UI. Antes cada pantalla/modal instalaba
// su propio listener de Escape en document; si había un modal encima de una
// pantalla, podían dispararse DOS callbacks (cerrar el modal y salir además de
// la pantalla). Ahora sólo responde el manejador más reciente.
const backStack = createBackNavigationStack();
let listenersInstalled = false;

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function dispatchBack(event) {
  backStack.dispatch(event, { editableTarget: event.type === 'contextmenu' && isEditableTarget(event.target) });
}

function installGlobalListeners() {
  if (listenersInstalled || typeof document === 'undefined') return;
  listenersInstalled = true;
  document.addEventListener('keydown', dispatchBack);
  document.addEventListener('contextmenu', dispatchBack);
}

function uninstallGlobalListenersIfIdle() {
  if (!listenersInstalled || backStack.size() || typeof document === 'undefined') return;
  document.removeEventListener('keydown', dispatchBack);
  document.removeEventListener('contextmenu', dispatchBack);
  listenersInstalled = false;
}

// ESC y clic derecho ejecutan la misma acción de "volver/cerrar". `disabled`
// permite a una pantalla padre ceder el control a una subpantalla activa (por
// ejemplo Roguelike -> Combate) sin tener dos niveles de navegación armados a
// la vez.
export function useEscapeToClose(onClose, { disabled = false } = {}) {
  const callbackRef = useRef(onClose);
  const idRef = useRef(Symbol('back-handler'));
  callbackRef.current = onClose;

  useEffect(() => {
    if (disabled) return undefined;
    const entry = { id: idRef.current, callbackRef };
    backStack.push(entry);
    installGlobalListeners();

    return () => {
      backStack.remove(entry.id);
      uninstallGlobalListenersIfIdle();
    };
  }, [disabled]);
}

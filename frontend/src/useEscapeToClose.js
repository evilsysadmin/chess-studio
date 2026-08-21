import { useEffect, useRef } from 'react';

// Un único "back stack" para toda la UI. Antes cada pantalla/modal instalaba
// su propio listener de Escape en document; si había un modal encima de una
// pantalla, podían dispararse DOS callbacks (cerrar el modal y salir además de
// la pantalla). Ahora sólo responde el manejador más reciente.
const backStack = [];
let listenersInstalled = false;

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function topEntry() {
  return backStack.length ? backStack[backStack.length - 1] : null;
}

function dispatchBack(event) {
  if (event.type === 'keydown' && event.key !== 'Escape') return;
  if (event.type === 'contextmenu' && isEditableTarget(event.target)) return;

  const entry = topEntry();
  if (!entry) return;

  // Clic derecho pasa a significar "atrás" en las ventanas internas. Sólo
  // anulamos el menú contextual si de verdad existe una acción de vuelta;
  // inputs/textarea conservan su menú nativo para copiar/pegar.
  if (event.type === 'contextmenu') event.preventDefault();
  event.stopPropagation();
  entry.callbackRef.current?.();
}

function installGlobalListeners() {
  if (listenersInstalled || typeof document === 'undefined') return;
  listenersInstalled = true;
  document.addEventListener('keydown', dispatchBack);
  document.addEventListener('contextmenu', dispatchBack);
}

function uninstallGlobalListenersIfIdle() {
  if (!listenersInstalled || backStack.length || typeof document === 'undefined') return;
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
      const index = backStack.findIndex((candidate) => candidate.id === entry.id);
      if (index >= 0) backStack.splice(index, 1);
      uninstallGlobalListenersIfIdle();
    };
  }, [disabled]);
}

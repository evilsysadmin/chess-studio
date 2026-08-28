import { reportPageLeavePresence, touchActivity } from './auth.js';
import { PRESENCE_HEARTBEAT_MS } from './presenceCadence.js';

const BACKGROUND_REPORT_DELAY_MS = 500;

// Ciclo de presencia sin React para que cierre/F5/multitab sean testeables de
// forma determinista. Cada pestaña tiene su propia identidad. Al ocultarse
// reporta segundo plano con un pequeño debounce; pagehide cancela ese envío y
// retira la sesión vieja, evitando carreras de unload que resuciten fantasmas.
export function bindPresenceLifecycle(activity, {
  touch = touchActivity,
  leave = reportPageLeavePresence,
  win = globalThis.window,
  doc = globalThis.document,
  heartbeatMs = PRESENCE_HEARTBEAT_MS,
  backgroundDelayMs = BACKGROUND_REPORT_DELAY_MS,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  if (!win || !doc) return () => {};

  let backgroundTimer = null;
  const clearBackgroundTimer = () => {
    if (backgroundTimer != null) clearTimeoutFn?.(backgroundTimer);
    backgroundTimer = null;
  };
  const report = (foreground = typeof doc.visibilityState === 'string' ? doc.visibilityState === 'visible' : null) => {
    touch(activity, foreground);
  };
  const onVisibility = () => {
    clearBackgroundTimer();
    if (doc.visibilityState === 'visible') {
      report(true);
      return;
    }
    // Cambiar de pestaña sí debe reflejar background, pero cerrar/recargar no
    // debe lanzar un touch justo antes del logout. pagehide cancela este timer.
    backgroundTimer = setTimeoutFn?.(() => {
      backgroundTimer = null;
      report(false);
    }, backgroundDelayMs);
  };
  const onPageHide = () => {
    clearBackgroundTimer();
    Promise.resolve(leave()).catch(() => {});
  };
  const onPageShow = () => {
    // Safari/Firefox pueden restaurar el documento desde bfcache sin montar
    // React otra vez. pagehide ya rotó la id; pageshow anuncia la nueva ya.
    if (doc.visibilityState === 'visible') report(true);
  };

  report();
  const timer = setIntervalFn?.(() => {
    if (doc.visibilityState === 'visible') report(true);
  }, heartbeatMs);
  doc.addEventListener?.('visibilitychange', onVisibility);
  win.addEventListener?.('pagehide', onPageHide);
  win.addEventListener?.('pageshow', onPageShow);

  return () => {
    clearBackgroundTimer();
    if (timer != null) clearIntervalFn?.(timer);
    doc.removeEventListener?.('visibilitychange', onVisibility);
    win.removeEventListener?.('pagehide', onPageHide);
    win.removeEventListener?.('pageshow', onPageShow);
  };
}

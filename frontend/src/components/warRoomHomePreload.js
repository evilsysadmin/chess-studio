import { getBoardRenderer } from '../userPreferences.js';
import { preloadBoard3DRenderer } from './Board3DRegistration.js';
import { loadWarRoomVariant, prefetchWarRoomVariant } from './WarRoomVariant.js';

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

export function shouldPreloadWarRoomFromHome({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  navigatorRef = globalThis.navigator,
  boardRenderer = getBoardRenderer(),
} = {}) {
  if (boardRenderer !== '3d') return false;
  if (!windowRef || !documentRef) return false;
  if (documentRef.visibilityState === 'hidden') return false;

  const connection = navigatorRef?.connection;
  if (connection?.saveData) return false;
  if (SLOW_EFFECTIVE_TYPES.has(String(connection?.effectiveType || '').toLowerCase())) return false;

  // The War Room is the default play surface on desktop as well as mobile.
  // Once authenticated Home is visible, warm the 3D path on every capable
  // device unless the user explicitly chose 2D or asked us to conserve data.
  return true;
}

export async function preloadPreferredWarRoomFromHome(options = {}) {
  if (!shouldPreloadWarRoomFromHome(options)) return false;

  const variant = loadWarRoomVariant();
  const [rendererResult] = await Promise.allSettled([
    preloadBoard3DRenderer(),
    prefetchWarRoomVariant(variant),
  ]);

  // Variant/model warming is best-effort. The shared Board3D/Three chunk is the
  // critical path for quick games, tournaments and PvP, so report success from it.
  return rendererResult.status === 'fulfilled';
}

export function schedulePreferredWarRoomHomePreload({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  navigatorRef = globalThis.navigator,
  boardRenderer = getBoardRenderer(),
  idleTimeout = 900,
  fallbackDelay = 250,
} = {}) {
  const options = { windowRef, documentRef, navigatorRef, boardRenderer };
  if (!shouldPreloadWarRoomFromHome(options)) return () => {};

  let cancelled = false;
  const run = () => {
    if (cancelled) return;
    void preloadPreferredWarRoomFromHome(options);
  };

  if (typeof windowRef.requestIdleCallback === 'function') {
    const idleId = windowRef.requestIdleCallback(run, { timeout: idleTimeout });
    return () => {
      cancelled = true;
      windowRef.cancelIdleCallback?.(idleId);
    };
  }

  const timerId = windowRef.setTimeout?.(run, fallbackDelay);
  return () => {
    cancelled = true;
    if (timerId !== undefined) windowRef.clearTimeout?.(timerId);
  };
}

import { getBoardRenderer } from '../userPreferences.js';
import { preloadBoard3DRenderer } from './Board3DRegistration.js';
import {
  WAR_ROOM_VARIANTS,
  isWarRoomVariantSelectable,
  loadWarRoomVariant,
  prefetchWarRoomVariant,
} from './WarRoomVariant.js';

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);
const DESKTOP_PRELOAD_MIN_WIDTH = 900;
const SECONDARY_IDLE_TIMEOUT = 1800;
const SECONDARY_FALLBACK_DELAY = 450;

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

export function shouldPreloadAllWarRoomsFromHome({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  navigatorRef = globalThis.navigator,
  boardRenderer = getBoardRenderer(),
  env = import.meta.env,
  location = globalThis.location,
} = {}) {
  const options = { windowRef, documentRef, navigatorRef, boardRenderer };
  if (!shouldPreloadWarRoomFromHome(options)) return false;
  if (!isWarRoomVariantSelectable({ env, location })) return false;
  if (Number(windowRef?.innerWidth || 0) < DESKTOP_PRELOAD_MIN_WIDTH) return false;
  if (navigatorRef?.userAgentData?.mobile === true) return false;

  const finePointer = windowRef?.matchMedia?.('(hover: hover) and (pointer: fine)');
  if (finePointer && typeof finePointer.matches === 'boolean') return finePointer.matches;

  // Old browsers without pointer media queries get a conservative fallback.
  return Number(navigatorRef?.maxTouchPoints || 0) === 0;
}

function waitForWarRoomIdle({
  windowRef,
  idleTimeout = SECONDARY_IDLE_TIMEOUT,
  fallbackDelay = SECONDARY_FALLBACK_DELAY,
} = {}) {
  return new Promise((resolve) => {
    if (typeof windowRef?.requestIdleCallback === 'function') {
      windowRef.requestIdleCallback(() => resolve(), { timeout: idleTimeout });
      return;
    }
    windowRef?.setTimeout?.(resolve, fallbackDelay);
  });
}

export async function preloadRemainingWarRoomsFromHome({
  preferredVariant,
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  navigatorRef = globalThis.navigator,
  boardRenderer = getBoardRenderer(),
  env = import.meta.env,
  location = globalThis.location,
} = {}) {
  const options = { windowRef, documentRef, navigatorRef, boardRenderer, env, location };
  if (!shouldPreloadAllWarRoomsFromHome(options)) return [];

  // Classic/v1 is procedural and already ships with the app. Only the Blender
  // rooms carry extra installer/model cost, so warm those one-by-one in idle
  // slots instead of creating a burst of parallel GLB downloads.
  const remaining = WAR_ROOM_VARIANTS
    .filter(({ id, shell }) => shell === 'blender' && id !== preferredVariant)
    .map(({ id }) => id);

  const warmed = [];
  for (const variant of remaining) {
    await waitForWarRoomIdle({ windowRef });
    if (documentRef?.visibilityState === 'hidden') break;
    try {
      warmed.push({ variant, ok: await prefetchWarRoomVariant(variant) });
    } catch {
      warmed.push({ variant, ok: false });
    }
  }
  return warmed;
}

export async function preloadPreferredWarRoomFromHome(options = {}) {
  if (!shouldPreloadWarRoomFromHome(options)) return false;

  const variant = loadWarRoomVariant(options);
  const [rendererResult] = await Promise.allSettled([
    preloadBoard3DRenderer(),
    prefetchWarRoomVariant(variant),
  ]);

  // Desktop gets the remaining Blender rooms opportunistically after the chosen
  // room is warm. This is intentionally fire-and-forget so Home never waits for
  // speculative assets before becoming interactive.
  if (shouldPreloadAllWarRoomsFromHome(options)) {
    void preloadRemainingWarRoomsFromHome({ ...options, preferredVariant: variant });
  }

  // Variant/model warming is best-effort. The shared Board3D/Three chunk is the
  // critical path for quick games, tournaments and PvP, so report success from it.
  return rendererResult.status === 'fulfilled';
}

export function schedulePreferredWarRoomHomePreload({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  navigatorRef = globalThis.navigator,
  boardRenderer = getBoardRenderer(),
  env = import.meta.env,
  location = globalThis.location,
  idleTimeout = 900,
  fallbackDelay = 250,
} = {}) {
  const options = { windowRef, documentRef, navigatorRef, boardRenderer, env, location };
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

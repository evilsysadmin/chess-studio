import { getBoardRenderer } from '../userPreferences.js';
import { preloadBoard3DRenderer } from './Board3DRegistration.js';
import {
  loadWarRoomVariant,
  prefetchWarRoomVariant,
} from './WarRoomVariant.js';

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

export function shouldPreloadPreferredWarRoomOnIntent({
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

  return true;
}

export async function preloadPreferredWarRoomOnIntent(options = {}) {
  if (!shouldPreloadPreferredWarRoomOnIntent(options)) return false;

  const variant = loadWarRoomVariant(options);
  const [rendererResult] = await Promise.allSettled([
    preloadBoard3DRenderer(),
    prefetchWarRoomVariant(variant),
  ]);

  return rendererResult.status === 'fulfilled';
}

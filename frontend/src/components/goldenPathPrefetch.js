const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

let quickMatchModulePromise = null;
let warRoomIntentPromise = null;

export function loadQuickMatchReadyRoom() {
  if (!quickMatchModulePromise) {
    quickMatchModulePromise = import('./QuickMatchModal.jsx').catch((error) => {
      quickMatchModulePromise = null;
      throw error;
    });
  }
  return quickMatchModulePromise;
}

export async function preloadQuickMatchReadyRoom() {
  try {
    await loadQuickMatchReadyRoom();
    return true;
  } catch {
    return false;
  }
}

export function shouldPreloadWarRoomForPlayIntent({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  navigatorRef = globalThis.navigator,
  boardRenderer = '3d',
} = {}) {
  if (boardRenderer !== '3d') return false;
  if (!windowRef || !documentRef) return false;
  if (documentRef.visibilityState === 'hidden') return false;

  const connection = navigatorRef?.connection;
  if (connection?.saveData) return false;
  if (SLOW_EFFECTIVE_TYPES.has(String(connection?.effectiveType || '').toLowerCase())) return false;
  return true;
}

export async function preloadWarRoomForPlayIntent(options = {}) {
  if (!shouldPreloadWarRoomForPlayIntent(options)) return false;

  if (!warRoomIntentPromise) {
    warRoomIntentPromise = Promise.allSettled([
      import('./Board3DRegistration.js').then(({ preloadBoard3DRenderer }) => preloadBoard3DRenderer()),
      import('./WarRoomVariant.js').then(({ loadWarRoomVariant, prefetchWarRoomVariant }) => {
        const variant = loadWarRoomVariant(options);
        return prefetchWarRoomVariant(variant);
      }),
    ])
      .then(([rendererResult]) => rendererResult.status === 'fulfilled')
      .catch(() => false);
  }

  const current = warRoomIntentPromise;
  const ok = await current;
  if (warRoomIntentPromise === current) warRoomIntentPromise = null;
  return ok;
}

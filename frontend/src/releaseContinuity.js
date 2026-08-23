const RELOAD_GUARD_KEY = 'chess-study-release-reload-at';
const RELOAD_COOLDOWN_MS = 15_000;

export function isChunkLoadFailure(reason) {
  const message = String(reason?.message || reason || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|ChunkLoadError|error loading dynamically imported module/i.test(message);
}

export function requestReleaseReload({ storage = sessionStorage, reload = () => window.location.reload(), now = Date.now() } = {}) {
  const previous = Number(storage?.getItem?.(RELOAD_GUARD_KEY) || 0);
  if (Number.isFinite(previous) && previous > 0 && now - previous < RELOAD_COOLDOWN_MS) return false;
  storage?.setItem?.(RELOAD_GUARD_KEY, String(now));
  reload();
  return true;
}

export function installReleaseContinuity({ windowObj = window, storage = sessionStorage, reload = () => windowObj.location.reload(), now = () => Date.now() } = {}) {
  const handlePreloadError = (event) => {
    event?.preventDefault?.();
    requestReleaseReload({ storage, reload, now: now() });
  };
  const handleUnhandledRejection = (event) => {
    if (!isChunkLoadFailure(event?.reason)) return;
    event?.preventDefault?.();
    requestReleaseReload({ storage, reload, now: now() });
  };
  windowObj.addEventListener('vite:preloadError', handlePreloadError);
  windowObj.addEventListener('unhandledrejection', handleUnhandledRejection);
  return () => {
    windowObj.removeEventListener('vite:preloadError', handlePreloadError);
    windowObj.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
}

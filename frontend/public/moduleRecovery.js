(() => {
  const RECOVERY_KEY = 'chess-studio-module-recovery-v1';
  const RECOVERY_PARAM = '__cs_recover';
  const RECOVERY_WINDOW_MS = 30000;

  function scrubRecoveryParam() {
    const current = new URL(window.location.href);
    if (!current.searchParams.has(RECOVERY_PARAM)) return;

    current.searchParams.delete(RECOVERY_PARAM);
    const cleanUrl = `${current.pathname}${current.search}${current.hash}`;
    window.history.replaceState(window.history.state, '', cleanUrl);
  }

  scrubRecoveryParam();

  async function recoverStaleModule() {
    if (navigator.onLine === false) return;

    try {
      const now = Date.now();
      const previous = Number(sessionStorage.getItem(RECOVERY_KEY) || 0);
      if (Number.isFinite(previous) && now - previous < RECOVERY_WINDOW_MS) return;
      sessionStorage.setItem(RECOVERY_KEY, String(now));
    } catch {
      // Storage can be blocked; recovery is still worth attempting once.
    }

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } catch {
      // A cache purge below is sufficient when registration cleanup fails.
    }

    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys
          .filter((key) => key.startsWith('chess-studio-shell-'))
          .map((key) => caches.delete(key)));
      }
    } catch {
      // Reload still bypasses the stale navigation cache via a cache buster.
    }

    const next = new URL(window.location.href);
    next.searchParams.set(RECOVERY_PARAM, Date.now().toString(36));
    window.location.replace(next.toString());
  }

  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target instanceof HTMLScriptElement && target.type === 'module') {
      void recoverStaleModule();
    }
  }, true);

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    void recoverStaleModule();
  });
})();

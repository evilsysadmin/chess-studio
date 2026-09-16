(() => {
  const RECOVERY_KEY = 'chess-studio-module-recovery-v1';
  const RECOVERY_PARAM = '__cs_recover';

  const current = new URL(location.href);
  if (current.searchParams.delete(RECOVERY_PARAM)) {
    history.replaceState(history.state, '', `${current.pathname}${current.search}${current.hash}`);
  }

  async function recover() {
    if (navigator.onLine === false) return;
    try {
      const now = Date.now();
      const previous = Number(sessionStorage.getItem(RECOVERY_KEY) || 0);
      if (now - previous < 30000) return;
      sessionStorage.setItem(RECOVERY_KEY, String(now));
    } catch {}

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } catch {}

    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('chess-studio-shell-')).map((key) => caches.delete(key)));
      }
    } catch {}

    const next = new URL(location.href);
    next.searchParams.set(RECOVERY_PARAM, Date.now().toString(36));
    location.replace(next.toString());
  }

  addEventListener('error', (event) => {
    if (event.target instanceof HTMLScriptElement && event.target.type === 'module') void recover();
  }, true);
  addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    void recover();
  });
})();

(() => {
  const K = 'chess-studio-module-recovery-v1', RECOVERY_PARAM = '__cs_recover';
  const u = new URL(location.href);
  if (u.searchParams.delete(RECOVERY_PARAM)) history.replaceState(history.state, '', `${u.pathname}${u.search}${u.hash}`);

  async function recover() {
    if (!navigator.onLine) return;
    try {
      const n = Date.now(), p = Number(sessionStorage.getItem(K) || 0);
      if (n - p < 30000) return;
      sessionStorage.setItem(K, n);
    } catch {}
    try {
      if ('serviceWorker' in navigator)
        for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    } catch {}
    try {
      if ('caches' in window)
        for (const key of await caches.keys())
          if (key.startsWith('chess-studio-shell-')) await caches.delete(key);
    } catch {}

    const next = new URL(location.href);
    next.searchParams.set(RECOVERY_PARAM, Date.now().toString(36));
    location.replace(next);
  }

  addEventListener('error', e => {
    if (e.target instanceof HTMLScriptElement && e.target.type === 'module') void recover();
  }, true);
  addEventListener('vite:preloadError', e => { e.preventDefault(); void recover(); });
})();

(() => {
  const K = 'chess-studio-module-recovery-v1';
  const LEGACY_RECOVERY_PARAMS = ['__cs_recover', '_cs_recover'];
  const RECOVERY_ENDPOINT = '/__cs_recover';

  // Compatibility cleanup for links left behind by older recovery builds.
  const current = new URL(location.href);
  let cleanedLegacyRecoveryParam = false;
  for (const param of LEGACY_RECOVERY_PARAMS) {
    if (!current.searchParams.has(param)) continue;
    current.searchParams.delete(param);
    cleanedLegacyRecoveryParam = true;
  }
  if (cleanedLegacyRecoveryParam) {
    history.replaceState(history.state, '', `${current.pathname}${current.search}${current.hash}`);
  }

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

    try {
      await fetch(RECOVERY_ENDPOINT, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Chess-Studio-Recovery': '1',
        },
        body: JSON.stringify({ nonce: Date.now().toString(36) }),
      });
    } catch {}

    location.reload();
  }

  function isOwnedModuleScript(target) {
    if (!(target instanceof HTMLScriptElement) || target.type !== 'module' || !target.src) return false;
    try {
      return new URL(target.src, location.href).origin === location.origin;
    } catch {
      return false;
    }
  }

  addEventListener('error', e => {
    // Cloudflare puede inyectar módulos de terceros (p. ej. Insights). Si la
    // CSP los bloquea no significa que un chunk de Chess Studio esté stale.
    if (isOwnedModuleScript(e.target)) void recover();
  }, true);
  addEventListener('vite:preloadError', e => { e.preventDefault(); void recover(); });
})();

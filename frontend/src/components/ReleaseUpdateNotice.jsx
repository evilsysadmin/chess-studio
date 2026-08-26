import { useEffect, useState } from 'react';
import { APP_RELEASE } from '../release.js';
import { fetchLatestRelease, isReleaseUpdateAvailable, RELEASE_CHECK_INTERVAL_MS } from '../releaseUpdate.js';
import { STORAGE_SESSION, getStorageItem, setStorageItem } from '../safeStorage.js';

const DISMISS_PREFIX = 'chess-study-release-notice-dismissed:';

function dismissedKey(release) {
  return `${DISMISS_PREFIX}${release}`;
}

export default function ReleaseUpdateNotice({ deferReload = false }) {
  const [latestRelease, setLatestRelease] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [boardSnoozed, setBoardSnoozed] = useState(false);

  useEffect(() => {
    setBoardSnoozed(false);
  }, [latestRelease]);

  useEffect(() => {
    let active = true;

    async function check() {
      const latest = await fetchLatestRelease();
      if (!active || !latest) return;
      setLatestRelease(latest);
      setDismissed(getStorageItem(STORAGE_SESSION, dismissedKey(latest)) === '1');
    }

    void check();
    const timer = window.setInterval(() => { void check(); }, RELEASE_CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (!isReleaseUpdateAvailable(latestRelease, APP_RELEASE) || dismissed || (deferReload && boardSnoozed)) return null;

  function dismiss() {
    setStorageItem(STORAGE_SESSION, dismissedKey(latestRelease), '1');
    setDismissed(true);
  }

  return (
    <aside className="release-update-notice" role="status" aria-live="polite" title={`Esta pestaña usa ${APP_RELEASE}; publicada: ${latestRelease}`}>
      <div className="release-update-copy">
        <strong>Nueva versión disponible</strong>
        <span>{deferReload ? 'Tu partida sigue intacta; actualiza al terminar.' : 'Hay mejoras nuevas listas para cargar.'}</span>
      </div>
      <div className="release-update-actions">
        {deferReload ? (
          <button type="button" className="release-update-dismiss" onClick={() => setBoardSnoozed(true)}>Después</button>
        ) : (
          <>
            <button type="button" className="release-update-primary" onClick={() => window.location.reload()}>
              Actualizar
            </button>
            <button type="button" className="release-update-dismiss" onClick={dismiss}>Ahora no</button>
          </>
        )}
      </div>
    </aside>
  );
}

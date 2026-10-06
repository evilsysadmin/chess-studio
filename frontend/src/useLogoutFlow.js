import { useState } from 'react';
import { logout, reportLogoutPresence, touchActivity } from './auth.js';
import { runLogoutLifecycle } from './logoutLifecycle.js';
import { pushProfileToServer } from './profileBackup.js';
import { activityForView } from './usePresenceHeartbeat.js';

export function useLogoutFlow(view) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);

  async function logoutGlobal() {
    setLogoutError(null);
    setLoggingOut(true);
    try {
      await runLogoutLifecycle({
        saveProfile: () => pushProfileToServer({ throwOnError: true }),
        closePresence: () => reportLogoutPresence(),
        restorePresence: () => touchActivity(activityForView(view), document.visibilityState === 'visible'),
        clearSession: logout,
      });
      window.location.reload();
    } catch {
      setLogoutError('No se pudo guardar tu progreso. Reintenta cuando vuelva la conexión.');
      setLoggingOut(false);
    }
  }

  return {
    loggingOut,
    logoutError,
    logout: logoutGlobal,
  };
}

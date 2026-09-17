// Carga diferida desde App: logout no forma parte del coste de arranque.
import { reportLogoutPresence, touchActivity } from './auth.js';
import { activityForView } from './usePresenceHeartbeat.js';
import { pushProfileToServer } from './profileBackup.js';
import { runLogoutLifecycle } from './logoutLifecycle.js';

export async function runGlobalLogout({ view, setLogoutError, setLoggingOut, clearSession }) {
  setLogoutError(null);
  setLoggingOut(true);
  try {
    await runLogoutLifecycle({
      saveProfile: () => pushProfileToServer({ throwOnError: true }),
      closePresence: () => reportLogoutPresence(),
      restorePresence: () => touchActivity(activityForView(view), document.visibilityState === 'visible'),
      clearSession,
    });
    window.location.reload();
    return true;
  } catch {
    setLogoutError('No se pudo guardar tu progreso. Reintenta cuando vuelva la conexión.');
    setLoggingOut(false);
    return false;
  }
}

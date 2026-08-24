import { useEffect, useState } from 'react';
import { fetchMe, isLoggedIn, logout, watchSessionIdentity } from './auth.js';
import { pullProfileFromServer } from './profileBackup.js';

export function resolveAuthenticatedBootstrap(profile, me) {
  if (profile?.status === 'unauthorized') return { action: 'logout', ready: false, isAdminUser: false, syncError: null };
  if (profile?.status === 'offline') {
    return {
      action: 'wait',
      ready: false,
      isAdminUser: false,
      syncError: 'No se pudo leer tu perfil desde MongoDB. No se ha abierto la caché local para evitar mezclar o sobrescribir cuentas.',
    };
  }
  return { action: 'ready', ready: true, isAdminUser: !!me?.isAdmin, syncError: null };
}

export function useAuthenticatedApp() {
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [ready, setReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => watchSessionIdentity(() => window.location.reload()), [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return undefined;
    let cancelled = false;
    setReady(false);
    setSyncError(null);
    setIsAdminUser(false);

    Promise.all([pullProfileFromServer(), fetchMe()]).then(([profile, me]) => {
      if (cancelled) return;
      const resolved = resolveAuthenticatedBootstrap(profile, me);
      if (resolved.action === 'logout') {
        logout();
        setLoggedIn(false);
        return;
      }
      setSyncError(resolved.syncError);
      setIsAdminUser(resolved.isAdminUser);
      setReady(resolved.ready);
    }).catch(() => {
      if (!cancelled) {
        setReady(false);
        setIsAdminUser(false);
        setSyncError('No se pudo sincronizar tu sesión con el backend.');
      }
    });

    return () => { cancelled = true; };
  }, [loggedIn]);

  return { loggedIn, setLoggedIn, ready, isAdminUser, syncError };
}

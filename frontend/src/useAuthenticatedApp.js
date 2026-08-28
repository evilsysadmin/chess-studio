import { useEffect, useState } from 'react';
import { fetchMeStatus, isLoggedIn, logout, watchSessionIdentity } from './auth.js';
import { pullProfileFromServer } from './profileBackup.js';

export const PROFILE_BOOTSTRAP_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000];
export const ADMIN_IDENTITY_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

function profileSyncError(profile) {
  const detail = String(profile?.detail || '');
  if (profile?.httpStatus === 503 && /mongo/i.test(detail)) {
    return 'El backend está activo, pero MongoDB no está disponible. Tu caché local sigue cerrada para proteger tu perfil.';
  }
  return 'El backend no pudo entregar tu perfil. Puede estar desplegándose o temporalmente no disponible. Tu caché local sigue cerrada para proteger tu cuenta.';
}

export function resolveAuthenticatedBootstrap(profile, me) {
  if (profile?.status === 'unauthorized') return { action: 'logout', ready: false, isAdminUser: false, syncError: null };
  if (profile?.status === 'offline') {
    return {
      action: 'wait',
      ready: false,
      isAdminUser: false,
      syncError: profileSyncError(profile),
    };
  }
  return { action: 'ready', ready: true, isAdminUser: !!me?.isAdmin, syncError: null };
}

export function useAuthenticatedApp() {
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [ready, setReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [adminIdentityUnknown, setAdminIdentityUnknown] = useState(false);

  useEffect(() => watchSessionIdentity(() => window.location.reload()), [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return undefined;
    let cancelled = false;
    let retryTimer = null;
    let retryIndex = 0;

    setReady(false);
    setSyncError(null);
    setIsAdminUser(false);

    const runBootstrap = async () => {
      try {
        const [profile, meStatus] = await Promise.all([pullProfileFromServer(), fetchMeStatus()]);
        if (cancelled) return;

        if (profile?.status === 'unauthorized' || meStatus?.status === 'unauthorized') {
          logout();
          setLoggedIn(false);
          return;
        }

        if (profile?.status === 'offline' && retryIndex < PROFILE_BOOTSTRAP_RETRY_DELAYS_MS.length) {
          const delay = PROFILE_BOOTSTRAP_RETRY_DELAYS_MS[retryIndex];
          retryIndex += 1;
          setSyncError(null);
          retryTimer = window.setTimeout(runBootstrap, delay);
          return;
        }

        const resolved = resolveAuthenticatedBootstrap(profile, meStatus?.user);
        if (resolved.action === 'logout') {
          logout();
          setLoggedIn(false);
          return;
        }
        setSyncError(resolved.syncError);
        setIsAdminUser(resolved.isAdminUser);
        setAdminIdentityUnknown(resolved.ready && meStatus?.status === 'unavailable');
        setReady(resolved.ready);
      } catch {
        if (cancelled) return;
        if (retryIndex < PROFILE_BOOTSTRAP_RETRY_DELAYS_MS.length) {
          const delay = PROFILE_BOOTSTRAP_RETRY_DELAYS_MS[retryIndex];
          retryIndex += 1;
          retryTimer = window.setTimeout(runBootstrap, delay);
          return;
        }
        setReady(false);
        setIsAdminUser(false);
        setSyncError('El backend no respondió tras varios reintentos. Tu caché local sigue cerrada para proteger tu cuenta.');
      }
    };

    runBootstrap();

    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [loggedIn, bootstrapAttempt]);

  useEffect(() => {
    if (!loggedIn || !ready || !adminIdentityUnknown) return undefined;
    let cancelled = false;
    let timer = null;
    let attempt = 0;

    const retryIdentity = async () => {
      const result = await fetchMeStatus();
      if (cancelled) return;
      if (result?.status === 'unauthorized') {
        logout();
        setLoggedIn(false);
        return;
      }
      if (result?.status === 'ok') {
        setIsAdminUser(!!result.user?.isAdmin);
        setAdminIdentityUnknown(false);
        return;
      }
      if (attempt < ADMIN_IDENTITY_RETRY_DELAYS_MS.length) {
        const delay = ADMIN_IDENTITY_RETRY_DELAYS_MS[attempt];
        attempt += 1;
        timer = window.setTimeout(retryIdentity, delay);
      }
    };

    timer = window.setTimeout(retryIdentity, ADMIN_IDENTITY_RETRY_DELAYS_MS[0]);
    attempt = 1;
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [loggedIn, ready, adminIdentityUnknown]);

  function retryBootstrap() {
    setSyncError(null);
    setReady(false);
    setBootstrapAttempt((attempt) => attempt + 1);
  }

  return { loggedIn, setLoggedIn, ready, isAdminUser, syncError, retryBootstrap };
}

// profileBackup.js — Capa de sincronización del perfil.
//
// MongoDB es la fuente persistente de verdad. localStorage sigue siendo una
// caché de trabajo síncrona porque muchas pantallas ya leen/escriben desde
// ahí. Desde v16.6dm41 los guardados normales usan PATCH optimista por clave:
// dos pestañas que tocan cosas distintas se fusionan y un 409 sólo obliga a
// releer/reintentar las claves que este snapshot realmente cambió.

import { api } from './api.js';
import { STORAGE_LOCAL, getStorageItem, setStorageItem } from './safeStorage.js';
import { getToken, getUsername } from './auth.js';
import {
  PROFILE_STORAGE_KEYS,
  clearProfileCache,
  clearProfileDirty,
  dirtyProfileKeysForCurrentUser,
  hasDirtyProfileForCurrentUser,
  markProfileDirtyForCurrentUser,
} from './profileKeys.js';

const EXPORTABLE_KEYS = PROFILE_STORAGE_KEYS;
let saveQueue = Promise.resolve();
let scheduledTimer = null;
let syncedUsername = null;
let syncedData = null;
let syncedRevisions = {};

function cloneData(data) {
  return Object.fromEntries(Object.entries(data || {}));
}

function rememberRemote(remote, username = getUsername()) {
  syncedUsername = username || null;
  syncedData = cloneData(remote?.data || {});
  syncedRevisions = { ...(remote?.revisions || {}) };
}

function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => before?.[key] !== after?.[key] || (key in (before || {})) !== (key in (after || {})));
}

function patchForSnapshot(snapshot, baseline, explicitDirtyKeys = null) {
  const local = snapshot?.data || {};
  const remote = baseline || {};
  const keys = explicitDirtyKeys === '*'
    ? [...new Set([...Object.keys(remote), ...Object.keys(local)])]
    : Array.isArray(explicitDirtyKeys) && explicitDirtyKeys.length
      ? explicitDirtyKeys
      : changedKeys(remote, local);
  return Object.fromEntries(keys.map((key) => [key, Object.prototype.hasOwnProperty.call(local, key) ? local[key] : null]));
}

export function exportProfile() {
  const data = {};
  for (const key of EXPORTABLE_KEYS) {
    const value = getStorageItem(STORAGE_LOCAL, key);
    if (value !== null) data[key] = value;
  }
  return {
    app: 'estudio-de-ajedrez',
    version: 2,
    username: getUsername() || null,
    build: import.meta.env.VITE_BUILD_SHA || 'local',
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function downloadProfile() {
  const profile = exportProfile();
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estudio-ajedrez-perfil-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseProfile(rawTextOrObject) {
  let parsed;
  if (typeof rawTextOrObject === 'string') {
    try {
      parsed = JSON.parse(rawTextOrObject);
    } catch {
      throw new Error('El archivo no es un JSON válido.');
    }
  } else {
    parsed = rawTextOrObject;
  }

  if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    throw new Error('El archivo no tiene el formato esperado de un backup de esta app.');
  }
  return parsed;
}

export function importProfile(rawTextOrObject, { replace = false, markDirty = false } = {}) {
  const parsed = parseProfile(rawTextOrObject);
  if (replace) clearProfileCache();

  let restored = 0;
  for (const key of EXPORTABLE_KEYS) {
    if (typeof parsed.data[key] === 'string') {
      setStorageItem(STORAGE_LOCAL, key, parsed.data[key]);
      restored += 1;
    }
  }
  if (markDirty) markProfileDirtyForCurrentUser();
  return restored;
}

async function loadRemoteForSync({ token, username }) {
  const remote = await api.getProfile({ token });
  rememberRemote(remote, username);
  return remote;
}

async function patchSnapshot(snapshot, { token, username, keepalive = false, dirtyKeys = null } = {}) {
  if (syncedUsername !== username || syncedData === null) {
    await loadRemoteForSync({ token, username });
  }

  // Dos reintentos son suficientes: 409 -> foto remota -> merge -> PATCH. Si
  // otra pestaña gana también esa segunda carrera, preferimos dejar dirty y
  // reintentar en el próximo flush en vez de entrar en un bucle agresivo.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const patch = patchForSnapshot(snapshot, syncedData || {}, dirtyKeys);
    if (Object.keys(patch).length === 0) {
      return { ...snapshot, revisions: { ...syncedRevisions } };
    }
    const expected = Object.fromEntries(Object.keys(patch).map((key) => [key, Number(syncedRevisions[key] || 0)]));
    try {
      const result = await api.patchProfile(patch, expected, { keepalive, token });
      rememberRemote(result, username);
      return result;
    } catch (error) {
      if (error?.status !== 409 || attempt > 0) throw error;
      const detail = error?.body?.detail || {};
      if (detail.profile && typeof detail.profile === 'object') {
        rememberRemote({ ...detail.profile, revisions: detail.revisions || detail.profile.revisions || {} }, username);
      } else {
        await loadRemoteForSync({ token, username });
      }
    }
  }
  return null;
}

export async function pullProfileFromServer() {
  cancelScheduledProfileSync();
  const username = getUsername();
  const token = getToken();

  try {
    const wasDirty = hasDirtyProfileForCurrentUser();
    const dirtyKeys = wasDirty ? dirtyProfileKeysForCurrentUser() : [];
    const localSnapshot = wasDirty ? exportProfile() : null;
    const remote = await loadRemoteForSync({ token, username });

    if (wasDirty) {
      // El snapshot local nació antes que este GET. PATCH usa las revisiones
      // recién leídas y, si otra pestaña cambia algo entre medias, resolverá el
      // 409 sin pisar claves ajenas.
      const saved = await patchSnapshot(localSnapshot, { token, username, dirtyKeys });
      rememberRemote(saved || remote, username);
      clearProfileDirty();
      return { status: 'recovered-local', restored: 0 };
    }

    const data = remote?.data;
    if (!data || Object.keys(data).length === 0) {
      clearProfileCache();
      clearProfileDirty();
      return { status: 'empty', restored: 0 };
    }

    const restored = importProfile(remote, { replace: true });
    clearProfileDirty();
    return { status: 'loaded', restored };
  } catch (error) {
    if (error?.status === 401) return { status: 'unauthorized', restored: 0, error };
    return { status: 'offline', restored: 0, error };
  }
}

export function pushProfileToServer({ throwOnError = false, keepalive = false } = {}) {
  cancelScheduledProfileSync();
  const snapshot = exportProfile();
  const token = getToken();
  const username = getUsername();
  const dirtyKeys = dirtyProfileKeysForCurrentUser();
  const runSave = () => patchSnapshot(snapshot, { token, username, keepalive, dirtyKeys });
  const operation = saveQueue.then(runSave, runSave);

  const confirmed = operation.then((result) => {
    if (getUsername() === username && JSON.stringify(exportProfile().data) === JSON.stringify(snapshot.data)) {
      clearProfileDirty();
    }
    return result;
  });

  saveQueue = confirmed.catch(() => null);
  return throwOnError ? confirmed : confirmed.catch(() => null);
}

export function resetProfileSyncStateForTests() {
  saveQueue = Promise.resolve();
  scheduledTimer = null;
  syncedUsername = null;
  syncedData = null;
  syncedRevisions = {};
}

export function scheduleProfileSync(delayMs = 300) {
  cancelScheduledProfileSync();
  scheduledTimer = setTimeout(() => {
    scheduledTimer = null;
    pushProfileToServer();
  }, delayMs);
}

export function cancelScheduledProfileSync() {
  if (scheduledTimer !== null) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
}

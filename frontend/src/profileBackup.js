// profileBackup.js — Capa de sincronización del perfil.
//
// MongoDB es la fuente persistente de verdad. localStorage sigue siendo una
// caché de trabajo síncrona porque muchas pantallas ya leen/escriben desde
// ahí; esta capa se ocupa de bajar Mongo ANTES de montar la app y de subir
// cambios sin permitir que dos PUT concurrentes terminen fuera de orden.

import { api } from './api.js';
import { STORAGE_LOCAL, getStorageItem, setStorageItem } from './safeStorage.js';
import { getToken, getUsername } from './auth.js';
import {
  PROFILE_STORAGE_KEYS,
  clearProfileCache,
  clearProfileDirty,
  hasDirtyProfileForCurrentUser,
  markProfileDirtyForCurrentUser,
} from './profileKeys.js';

const EXPORTABLE_KEYS = PROFILE_STORAGE_KEYS;

// Serializa todos los PUT. Como /api/profile reemplaza el documento entero,
// dos requests concurrentes que terminen en orden inverso podrían restaurar
// una foto vieja del perfil. Esta cola garantiza el mismo orden en que el
// cliente pidió guardar.
let saveQueue = Promise.resolve();
let scheduledTimer = null;

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

// Restaura únicamente claves conocidas. Con replace=true, las claves que no
// estén en el backup desaparecen: "importar" significa reemplazar el perfil,
// no mezclarlo con restos del perfil anterior.
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
  // Las restauraciones traídas desde Mongo usan markDirty=false: son la
  // copia autoritativa. Una importación/rollback iniciado por el usuario sí
  // debe quedar marcado como pendiente hasta que el servidor lo confirme.
  if (markDirty) markProfileDirtyForCurrentUser();
  return restored;
}

// Baja el perfil del usuario autenticado. Nunca usamos como fallback una
// caché arbitraria si la API/Mongo falla: eso fue exactamente lo que permitía
// que un usuario nuevo heredara datos del anterior.
//
// loaded       -> perfil remoto cargado
// empty        -> cuenta válida todavía sin perfil
// offline      -> API/Mongo no disponible
// unauthorized -> token inválido/expirado
export async function pullProfileFromServer() {
  cancelScheduledProfileSync();

  // Si una sesión anterior dejó cambios sin confirmar (por ejemplo se cayó
  // la red justo después de ganar XP), esa caché local es deliberadamente
  // más nueva que Mongo. La salvamos primero para no perderla al hacer pull.
  if (hasDirtyProfileForCurrentUser()) {
    try {
      await pushProfileToServer({ throwOnError: true });
      return { status: 'recovered-local', restored: 0 };
    } catch (error) {
      if (error?.status === 401) return { status: 'unauthorized', restored: 0, error };
      return { status: 'offline', restored: 0, error };
    }
  }

  try {
    const remote = await api.getProfile();
    const data = remote?.data;

    if (!data || Object.keys(data).length === 0) {
      // Solo limpiamos el perfil persistente. Una partida activa pertenece a
      // esta sesión y puede seguir siendo válida tras un simple refresh.
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

// Guarda una foto concreta del perfil, en cola. Capturar el snapshot ANTES
// de entrar a la cola es intencionado: si se piden A y luego B, se envían A
// y B en ese mismo orden; B siempre gana al final.
export function pushProfileToServer({ throwOnError = false, keepalive = false } = {}) {
  // Un guardado explícito sustituye cualquier debounce pendiente.
  cancelScheduledProfileSync();
  const snapshot = exportProfile();
  const token = getToken();
  const username = getUsername();
  const runSave = () => api.saveProfile(snapshot, { keepalive, token });
  // Un solo .then con manejador de éxito y error mantiene la cola viva sin
  // añadir un salto de microtarea innecesario. Además hace que el primer PUT
  // empiece en cuanto la cola anterior queda resuelta.
  const operation = saveQueue.then(runSave, runSave);

  const confirmed = operation.then((result) => {
    // No limpies el dirty flag si mientras este PUT estaba en vuelo hubo un
    // cambio posterior. Ese cambio necesita su propio guardado.
    if (getUsername() === username && JSON.stringify(exportProfile().data) === JSON.stringify(snapshot.data)) {
      clearProfileDirty();
    }
    return result;
  });

  saveQueue = confirmed;
  return throwOnError ? confirmed : confirmed.catch(() => null);
}

// Cambios pequeños (XP, puzzle, rating, etc.) pueden ocurrir varias veces en
// pocos milisegundos. Agrupamos el ruido, pero no esperamos a que el usuario
// cambie de pantalla para persistirlo.
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

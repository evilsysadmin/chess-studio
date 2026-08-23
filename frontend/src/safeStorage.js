// safeStorage.js — una sola puerta de entrada a Web Storage.
//
// Los navegadores pueden lanzar SecurityError/QuotaExceededError incluso al
// LEER localStorage/sessionStorage (modo privado, políticas corporativas,
// sandbox, cuota, extensiones...). Una preferencia rota no debe impedir que
// Chess Studio arranque. Cuando el storage nativo falla mantenemos un override
// en memoria para que la pestaña actual siga siendo usable; los setters
// devuelven false para que el caller sepa que no quedó persistido en disco.

export const STORAGE_LOCAL = 'localStorage';
export const STORAGE_SESSION = 'sessionStorage';
const VALID_AREAS = new Set([STORAGE_LOCAL, STORAGE_SESSION]);
const REMOVED = Symbol('removed');

// cache refleja la última lectura/escritura conocida. overrides sólo contiene
// valores que NO pudieron confirmarse en Web Storage; mientras existan deben
// ganar incluso si getItem nativo funciona y devuelve un valor antiguo/null.
const cache = {
  [STORAGE_LOCAL]: new Map(),
  [STORAGE_SESSION]: new Map(),
};
const overrides = {
  [STORAGE_LOCAL]: new Map(),
  [STORAGE_SESSION]: new Map(),
};

function areaName(area) {
  return VALID_AREAS.has(area) ? area : STORAGE_LOCAL;
}

function nativeStorage(area) {
  const name = areaName(area);
  try {
    return globalThis?.[name] || null;
  } catch {
    return null;
  }
}

export function getStorageItem(area, key) {
  const name = areaName(area);
  const pending = overrides[name];
  if (pending.has(key)) {
    const value = pending.get(key);
    return value === REMOVED ? null : value;
  }

  const storage = nativeStorage(name);
  if (!storage) return cache[name].has(key) ? cache[name].get(key) : null;
  try {
    const value = storage.getItem(key);
    if (value === null) cache[name].delete(key);
    else cache[name].set(key, value);
    return value;
  } catch {
    return cache[name].has(key) ? cache[name].get(key) : null;
  }
}

// true = escrito también en Web Storage; false = sólo override de memoria.
export function setStorageItem(area, key, value) {
  const name = areaName(area);
  const normalized = String(value);
  cache[name].set(key, normalized);
  const storage = nativeStorage(name);
  if (!storage) {
    overrides[name].set(key, normalized);
    return false;
  }
  try {
    storage.setItem(key, normalized);
    overrides[name].delete(key);
    return true;
  } catch {
    overrides[name].set(key, normalized);
    return false;
  }
}

// true = el storage nativo confirmó la retirada; false = mantenemos una
// lápida en memoria para que una copia nativa antigua no reaparezca en la
// pestaña actual si removeItem falla.
export function removeStorageItem(area, key) {
  const name = areaName(area);
  cache[name].delete(key);
  const storage = nativeStorage(name);
  if (!storage) {
    overrides[name].set(key, REMOVED);
    return false;
  }
  try {
    storage.removeItem(key);
    overrides[name].delete(key);
    return true;
  } catch {
    overrides[name].set(key, REMOVED);
    return false;
  }
}

export function listStorageKeys(area, { prefix = '' } = {}) {
  const name = areaName(area);
  const keys = new Set();
  const storage = nativeStorage(name);
  if (storage) {
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (typeof key === 'string') keys.add(key);
      }
    } catch {
      // Si no podemos enumerar el storage nativo usamos la cache conocida.
      for (const key of cache[name].keys()) keys.add(key);
    }
  } else {
    for (const key of cache[name].keys()) keys.add(key);
  }

  // Los overrides representan la verdad de esta pestaña cuando la escritura
  // nativa falló: añaden valores o esconden eliminaciones pendientes.
  for (const [key, value] of overrides[name]) {
    if (value === REMOVED) keys.delete(key);
    else keys.add(key);
  }

  return [...keys].filter((key) => !prefix || key.startsWith(prefix));
}

export function readJsonStorage(area, key, { fallback = null, removeMalformed = false } = {}) {
  const raw = getStorageItem(area, key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    if (removeMalformed) removeStorageItem(area, key);
    return fallback;
  }
}

export function writeJsonStorage(area, key, value) {
  try {
    return setStorageItem(area, key, JSON.stringify(value));
  } catch {
    return false;
  }
}

// Test/support hook. No toca Web Storage real; sólo vacía cache y overrides
// creados para sobrevivir a fallos temporales dentro de la pestaña.
export function clearStorageMemoryFallback() {
  for (const area of [STORAGE_LOCAL, STORAGE_SESSION]) {
    cache[area].clear();
    overrides[area].clear();
  }
}

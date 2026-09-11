import { getToken, getUsername } from './auth.js';
import { fetchWithTimeout } from './asyncControl.js';
import { withRequestId } from './requestId.js';

const BASE_URL = String(import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
const DAILY_STATUS_CACHE_MS = 60_000;
let dailyStatusInFlight = null;
let dailyStatusCache = null;

async function request(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Sesión no disponible.');
  const response = await fetchWithTimeout(fetch, `${BASE_URL}${path}`, {
    ...options,
    headers: withRequestId({
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    }),
  }, 7000);
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const message = typeof body?.detail === 'string' ? body.detail : 'Matthias no está disponible ahora mismo.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body || {};
}

function currentIdentity() {
  return String(getUsername() || '').trim().toLowerCase() || null;
}

function invalidateDailyStatusCache() {
  dailyStatusCache = null;
}

export function fetchMatthiasDailyStatus({ force = false } = {}) {
  // Home e Insights pueden pedir el mismo expediente al volver de otra vista.
  // Deducimos por identidad y conservamos una foto efímera de 60 s para evitar
  // GET repetidos; nunca cruza usuarios ni persiste fuera de este proceso.
  // Un retorno explícito a la pestaña puede forzar una lectura nueva porque el
  // estado pending/used puede haber cambiado en otra pestaña mientras ésta dormía.
  const identity = currentIdentity();
  const now = Date.now();
  if (
    !force
    && dailyStatusCache?.identity === identity
    && now - dailyStatusCache.cachedAt < DAILY_STATUS_CACHE_MS
  ) {
    return Promise.resolve(dailyStatusCache.value);
  }
  if (dailyStatusInFlight?.identity === identity) return dailyStatusInFlight.promise;
  const promise = request('/matthias/daily')
    .then((value) => {
      dailyStatusCache = { identity, cachedAt: Date.now(), value };
      return value;
    })
    .finally(() => {
      if (dailyStatusInFlight?.promise === promise) dailyStatusInFlight = null;
    });
  dailyStatusInFlight = { identity, promise };
  return promise;
}

export function fetchMatthiasBriefing() {
  return request('/matthias/briefing');
}

export function createMatthiasConsultationId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* fallback below */ }
  return `matthias-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function askMatthiasDaily(questionKind, facts, { id = createMatthiasConsultationId() } = {}) {
  invalidateDailyStatusCache();
  return request('/matthias/daily', {
    method: 'POST',
    body: JSON.stringify({ questionKind, facts: facts || {}, consultationId: id }),
  }).finally(invalidateDailyStatusCache);
}

export function resetOwnMatthiasMemory() {
  invalidateDailyStatusCache();
  return request('/matthias/reset-memory', { method: 'POST' }).finally(invalidateDailyStatusCache);
}

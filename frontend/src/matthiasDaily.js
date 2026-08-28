import { getToken } from './auth.js';
import { fetchWithTimeout } from './asyncControl.js';
import { withRequestId } from './requestId.js';

const BASE_URL = String(import.meta.env?.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

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

export function fetchMatthiasDailyStatus() {
  return request('/matthias/daily');
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
  return request('/matthias/daily', {
    method: 'POST',
    body: JSON.stringify({ questionKind, facts: facts || {}, consultationId: id }),
  });
}

export function resetOwnMatthiasMemory() {
  return request('/matthias/reset-memory', { method: 'POST' });
}

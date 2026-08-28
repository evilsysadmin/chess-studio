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

export function askMatthiasDaily(questionKind, facts) {
  return request('/matthias/daily', {
    method: 'POST',
    body: JSON.stringify({ questionKind, facts: facts || {} }),
  });
}

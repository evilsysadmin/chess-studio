// admin.js — El backend revalida permisos; ocultar UI no es una barrera de seguridad.
import { authHeader } from './auth.js';
import { requestJson } from './http.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function adminPost(path, body) {
  return requestJson(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
  });
}

export async function fetchAdminUsers({ signal } = {}) {
  const body = await requestJson(`${BASE_URL}/admin/users`, { headers: { ...authHeader() }, signal });
  return body.users;
}

export function updateAdminUserRating(username, rating) {
  return adminPost('/admin/user-rating', { username, rating: Number(rating) });
}

export function fetchAdminMatthiasStatus() {
  return requestJson(`${BASE_URL}/admin/matthias-status`, { headers: { ...authHeader() } });
}

export function fetchAdminUserInsights(username) {
  return adminPost('/admin/user-insights', { username });
}

export function fetchAdminMatthiasMemory(username) {
  return adminPost('/admin/matthias/memory', { username });
}

export function resetAdminMatthiasMemory(username) {
  return adminPost('/admin/matthias/reset-memory', { username });
}

export function previewAdminMatthiasPersonality(preset) {
  return adminPost('/admin/matthias/personality-preview', { preset });
}

export function deleteAdminUser(username) {
  return adminPost('/admin/delete-user', { username });
}

export function reanalyzeAdminUser(username, facts) {
  return adminPost('/admin/player-portrait', { username, facts });
}

// admin.js — El backend revalida permisos; ocultar UI no es una barrera de seguridad.
import { authHeader } from './auth.js';
import { requestJson } from './http.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function fetchAdminUsers() {
  const body = await requestJson(`${BASE_URL}/admin/users`, { headers: { ...authHeader() } });
  return body.users;
}


export function fetchAdminMatthiasStatus() {
  return requestJson(`${BASE_URL}/admin/matthias-status`, { headers: { ...authHeader() } });
}

export function fetchAdminUserInsights(username) {
  return requestJson(`${BASE_URL}/admin/user-insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ username }),
  });
}


export function fetchAdminMatthiasMemory(username) {
  return requestJson(`${BASE_URL}/admin/matthias/memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ username }),
  });
}

export function resetAdminMatthiasMemory(username) {
  return requestJson(`${BASE_URL}/admin/matthias/reset-memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ username }),
  });
}

export function previewAdminMatthiasPersonality(preset) {
  return requestJson(`${BASE_URL}/admin/matthias/personality-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ preset }),
  });
}

export function deleteAdminUser(username) {
  return requestJson(`${BASE_URL}/admin/delete-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ username }),
  });
}

export function reanalyzeAdminUser(username, facts) {
  return requestJson(`${BASE_URL}/admin/player-portrait`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ username, facts }),
  });
}

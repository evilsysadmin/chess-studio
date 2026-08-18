// admin.js — Solo lo usa quien tenga isAdmin=true (ver auth.js/fetchMe).
// El backend igual revalida el permiso en cada request — esto del
// frontend es solo para no mostrar el link a quien no le sirve, no es
// la barrera de seguridad real.

import { authHeader } from './auth.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  return res.json();
}

export async function fetchAdminUsers() {
  const body = await fetch(`${BASE_URL}/admin/users`, { headers: { ...authHeader() } }).then(handle);
  return body.users;
}

export async function fetchAdminUserDetail(username) {
  return fetch(`${BASE_URL}/admin/users/${encodeURIComponent(username)}`, { headers: { ...authHeader() } }).then(handle);
}

export async function editAdminUser(username, changes) {
  return fetch(`${BASE_URL}/admin/users/${encodeURIComponent(username)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(changes),
  }).then(handle);
}

export async function deleteAdminUser(username) {
  return fetch(`${BASE_URL}/admin/users/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    headers: { ...authHeader() },
  }).then(handle);
}

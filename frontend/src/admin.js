// admin.js — Solo lo usa quien tenga isAdmin=true (ver auth.js/fetchMe).
// El backend igual revalida el permiso en cada request — esto del
// frontend es solo para no mostrar el link a quien no le sirve, no es
// la barrera de seguridad real.

import { authHeader } from './auth.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function fetchAdminUsers() {
  const res = await fetch(`${BASE_URL}/admin/users`, { headers: { ...authHeader() } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  const body = await res.json();
  return body.users;
}

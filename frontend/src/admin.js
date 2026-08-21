// admin.js — Solo lo usa quien tenga isAdmin=true (ver auth.js/fetchMe).
// El backend igual revalida el permiso en cada request — esto del
// frontend es solo para no mostrar el link a quien no le sirve, no es
// la barrera de seguridad real.

import { authHeader } from './auth.js';
import { withRequestId, requestErrorMessage } from './requestId.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function fetchAdminUsers() {
  const res = await fetch(`${BASE_URL}/admin/users`, { headers: withRequestId({ ...authHeader() }) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(requestErrorMessage(res, body).message);
  }
  const body = await res.json();
  return body.users;
}

export async function fetchAdminUserInsights(username) {
  // POST deliberado: los usernames antiguos no tenían una whitelist de
  // caracteres y meterlos en el path podía convertir caracteres reservados
  // (/, %, ?, #...) en un 404 antes incluso de llegar al handler. En el body
  // viajan sin ambigüedad y el endpoint sigue protegido por JWT + rol admin.
  const res = await fetch(`${BASE_URL}/admin/user-insights`, {
    method: 'POST',
    headers: withRequestId({ 'Content-Type': 'application/json', ...authHeader() }),
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(requestErrorMessage(res, body).message);
  }
  return res.json();
}


export async function deleteAdminUser(username) {
  // POST con JSON por la misma razón que user-insights: hay usernames legacy
  // con caracteres que no queremos reinterpretar dentro de una URL.
  const res = await fetch(`${BASE_URL}/admin/delete-user`, {
    method: 'POST',
    headers: withRequestId({ 'Content-Type': 'application/json', ...authHeader() }),
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(requestErrorMessage(res, body).message);
  }
  return res.json();
}

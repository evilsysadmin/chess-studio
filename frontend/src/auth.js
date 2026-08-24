// auth.js — Cuenta de usuario: registro, login, y el token de sesión
// (JWT) guardado en localStorage. Sin esto no hay perfil que sincronizar
// — cada usuario necesita loguearse para que `/api/profile` sepa de
// quién es el progreso que está subiendo o bajando.

import { clearLocalUserState } from './profileKeys.js';
import { withRequestId, requestErrorMessage } from './requestId.js';
import { markAmbientThemeSessionFresh, clearAmbientThemeSessionStorage } from './audioSession.js';
import { clearSessionView } from './viewState.js';
import { clearAllClockSnapshots } from './clockPersistence.js';
import { clearCombatSession } from './combatSession.js';
import { clearHomePlayNudgeSession } from './homePlayNudge.js';
import { APP_RELEASE } from './release.js';
import { STORAGE_LOCAL, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

export const TOKEN_KEY = 'chess-study-auth-token';
const USERNAME_KEY = 'chess-study-auth-username';

const AUTH_STORAGE_KEYS = Object.freeze([TOKEN_KEY, USERNAME_KEY]);

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function handle(response) {
  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      message = requestErrorMessage(response, body).message;
    } catch (e) {
      const requestId = response.headers.get('x-request-id');
      if (requestId) message += ` · Ref: ${requestId}`;
    }
    throw new Error(message);
  }
  return response.json();
}

export function getToken() {
  return getStorageItem(STORAGE_LOCAL, TOKEN_KEY);
}

export function getUsername() {
  return getStorageItem(STORAGE_LOCAL, USERNAME_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

// localStorage se comparte entre pestañas. Si una pestaña cambia de cuenta,
// otra que siga montada conserva estado React de la identidad anterior y
// podría volver a escribirlo usando la nueva sesión compartida. Escuchamos
// solo las claves de autenticación y obligamos a la pestaña obsoleta a
// reinicializarse antes de que pueda persistir nada.
function sessionFingerprint() {
  // Identidad, no valor exacto del JWT. Un re-login/rotación de token del
  // MISMO usuario en otra pestaña no debe desmontar una batalla activa.
  return `${getUsername() || ''}\n${getToken() ? 'authenticated' : 'anonymous'}`;
}


export function watchSessionIdentity(onChange) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }

  const expected = sessionFingerprint();
  const handleStorage = (event) => {
    // key === null corresponde a localStorage.clear() en otra pestaña.
    if (event?.key !== null && !AUTH_STORAGE_KEYS.includes(event?.key)) return;
    if (sessionFingerprint() !== expected) onChange();
  };

  window.addEventListener('storage', handleStorage);
  return () => window.removeEventListener('storage', handleStorage);
}

function saveSession(token, username) {
  // El login acaba de confirmar una identidad nueva. Borramos la caché del
  // usuario anterior ANTES de guardar la nueva sesión; Mongo la rellenará en
  // el arranque autenticado. Esto evita la herencia Alice -> Bob.
  clearLocalUserState();
  clearAllClockSnapshots();
  clearCombatSession();
  setStorageItem(STORAGE_LOCAL, TOKEN_KEY, token);
  setStorageItem(STORAGE_LOCAL, USERNAME_KEY, username);
  // Cada autenticación explícita abre una sesión musical nueva. El usuario
  // puede cambiar el tema después y se conservará hasta logout/nuevo login.
  markAmbientThemeSessionFresh();
  clearSessionView();
  clearHomePlayNudgeSession();
}

export function logout() {
  clearAmbientThemeSessionStorage();
  clearSessionView();
  clearLocalUserState();
  clearAllClockSnapshots();
  clearCombatSession();
  clearHomePlayNudgeSession();
  removeStorageItem(STORAGE_LOCAL, TOKEN_KEY);
  removeStorageItem(STORAGE_LOCAL, USERNAME_KEY);
}

export async function register(username, password, email, inviteCode = '') {
  const body = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: withRequestId({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username, password, email, inviteCode }),
  }).then(handle);
  saveSession(body.token, body.username);
  return body;
}

export async function login(username, password) {
  const body = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: withRequestId({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username, password }),
  }).then(handle);
  saveSession(body.token, body.username);
  return body;
}

export async function forgotPassword(email) {
  return fetch(`${BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: withRequestId({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email }),
  }).then(handle);
}

export async function resetPassword(token, newPassword) {
  const body = await fetch(`${BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: withRequestId({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ token, newPassword }),
  }).then(handle);
  saveSession(body.token, body.username);
  return body;
}

export async function updateRecoveryEmail(email, password) {
  return fetch(`${BASE_URL}/auth/email`, {
    method: 'PUT',
    headers: withRequestId({ 'Content-Type': 'application/json', ...authHeader() }),
    body: JSON.stringify({ email, password }),
  }).then(handle);
}

// Header listo para adjuntar a cualquier fetch que necesite autenticarse
// — objeto vacío si no hay sesión, así se puede hacer siempre
// `{ ...authHeader(), 'Content-Type': 'application/json' }` sin chequear
// null en cada lugar que lo usa.
export function authHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// "Despertar" el backend antes de que haga falta de verdad — el free tier
// de Render duerme el servicio tras 15 minutos sin tráfico, y el primer
// pedido real después tarda 30-60s en responder mientras arranca de
// nuevo. Disparando esto apenas carga la pantalla de login (no al
// mandar el formulario), el backend ya está despierto para cuando el
// usuario termina de escribir usuario/contraseña, en vez de que el
// cold-start le pegue justo en el login real. `/api/health` en vez de
// la raíz: está exento del rate limiting, y devuelve algo mínimo — no
// hace falta más que eso para despertar el contenedor. "Fire and
// forget" a propósito: si falla o tarda, no debe bloquear ni mostrar
// error — el login en sí sigue funcionando igual, solo que más lento.
export async function fetchMe() {
  try {
    const res = await fetch(`${BASE_URL}/auth/me`, { headers: withRequestId({ ...authHeader() }) });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    // sin backend disponible -> seguimos sin saber si es admin, no bloquea el arranque
    return null;
  }
}

export function wakeBackend() {
  fetch(`${BASE_URL}/health`, { headers: withRequestId() }).catch(() => {});
}

export async function fetchLiveStatus() {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const res = await fetch(`${BASE_URL}/status`, { headers: withRequestId({ ...authHeader() }) });
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Math.max(0, Math.round(ended - started));
    if (!res.ok) return { backend: 'down', onlineUsers: null, presenceAvailable: false, latencyMs: null };
    const body = await res.json();
    return {
      backend: 'up',
      onlineUsers: Number.isInteger(body?.onlineUsers) ? body.onlineUsers : null,
      presenceAvailable: body?.presenceAvailable !== false,
      latencyMs,
    };
  } catch {
    return { backend: 'down', onlineUsers: null, presenceAvailable: false, latencyMs: null };
  }
}

export function touchActivity(activity = null, foreground = null) {
  if (!getToken()) return;
  const hasForeground = typeof foreground === 'boolean';
  const hasBody = !!activity || hasForeground || !!APP_RELEASE;
  const headers = withRequestId({ ...authHeader() });
  if (hasBody) headers['Content-Type'] = 'application/json';
  const payload = {};
  if (activity) payload.activity = activity;
  if (hasForeground) payload.foreground = foreground;
  if (APP_RELEASE) payload.release = APP_RELEASE;
  fetch(`${BASE_URL}/auth/activity`, {
    method: 'POST',
    headers,
    body: hasBody ? JSON.stringify(payload) : undefined,
  }).catch(() => {});
}

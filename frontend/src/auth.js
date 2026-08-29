// auth.js — Cuenta de usuario: registro, login, y el token de sesión
// (JWT) guardado en localStorage. Sin esto no hay perfil que sincronizar
// — cada usuario necesita loguearse para que `/api/profile` sepa de
// quién es el progreso que está subiendo o bajando.

import { bindProfileStorageIdentity, clearLocalUserState } from './profileKeys.js';
import { request, requestJson } from './http.js';
import { markAmbientThemeSessionFresh, clearAmbientThemeSessionStorage } from './audioSession.js';
import { clearSessionView } from './viewState.js';
import { clearAllClockSnapshots } from './clockPersistence.js';
import { clearCombatSession } from './combatSession.js';
import { clearCombatDebriefSession } from './combatDebriefSession.js';
import { clearHomePlayNudgeSession } from './homePlayNudge.js';
import { APP_RELEASE } from './release.js';
import { STORAGE_LOCAL, STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';
import { setUiLanguage } from './userPreferences.js';
import { clearMatthiasSessionSignals, queueMatthiasLoginGreeting } from './matthiasSession.js';

export const TOKEN_KEY = 'chess-study-auth-token';
const USERNAME_KEY = 'chess-study-auth-username';
export const PRESENCE_SESSION_KEY = 'chess-study-presence-session-v1';
export const PRESENCE_DOCUMENT_OWNER_KEY = 'chess-study-presence-owner-v1';

const AUTH_STORAGE_KEYS = Object.freeze([TOKEN_KEY, USERNAME_KEY]);

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const AUTH_REQUEST_TIMEOUT_MS = 65000; // deja margen al cold-start de Render, pero nunca bloquea para siempre
const BACKGROUND_REQUEST_TIMEOUT_MS = 7000;
const PRESENCE_SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PRESENCE_DOCUMENT_OWNER = createPresenceSessionId();


export function getToken() {
  return getStorageItem(STORAGE_LOCAL, TOKEN_KEY);
}

export function getUsername() {
  return getStorageItem(STORAGE_LOCAL, USERNAME_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

function createPresenceSessionId() {
  try {
    const value = globalThis.crypto?.randomUUID?.();
    if (value) return value.replace(/-/g, '');
  } catch { /* fallback sin bloquear login */ }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9_-]/gi, '').slice(0, 48);
}

export function getPresenceSessionId() {
  if (!getToken()) return null;
  // zfc guardaba esta id en localStorage (compartida por pestañas). La
  // retiramos perezosamente para que un deploy nuevo no reutilice una
  // identidad compartida antigua y cada pestaña tenga la suya.
  removeStorageItem(STORAGE_LOCAL, PRESENCE_SESSION_KEY);
  // sessionStorage es por pestaña, pero los navegadores pueden COPIAR su
  // contenido al abrir una nueva pestaña desde otra con `window.open`/opener.
  // El owner vive sólo en memoria del documento: si el storage fue clonado o
  // venimos de un reload, la nueva instancia no adopta jamás la id ajena.
  const owner = getStorageItem(STORAGE_SESSION, PRESENCE_DOCUMENT_OWNER_KEY);
  if (owner !== PRESENCE_DOCUMENT_OWNER) {
    removeStorageItem(STORAGE_SESSION, PRESENCE_SESSION_KEY);
    setStorageItem(STORAGE_SESSION, PRESENCE_DOCUMENT_OWNER_KEY, PRESENCE_DOCUMENT_OWNER);
  }
  let value = getStorageItem(STORAGE_SESSION, PRESENCE_SESSION_KEY);
  if (value && PRESENCE_SESSION_ID_RE.test(value)) return value;
  value = createPresenceSessionId();
  setStorageItem(STORAGE_SESSION, PRESENCE_SESSION_KEY, value);
  return value;
}

export function rotatePresenceSessionId() {
  const value = createPresenceSessionId();
  setStorageItem(STORAGE_SESSION, PRESENCE_DOCUMENT_OWNER_KEY, PRESENCE_DOCUMENT_OWNER);
  setStorageItem(STORAGE_SESSION, PRESENCE_SESSION_KEY, value);
  return value;
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
  // Una autenticación explícita tiene autoridad para adoptar la identidad que
  // actualmente figura en localStorage antes de limpiarla. Las pestañas viejas
  // no pasan por aquí salvo que el usuario inicie sesión en ellas de verdad.
  bindProfileStorageIdentity(getUsername());
  clearLocalUserState();
  clearAllClockSnapshots();
  clearCombatSession();
  clearCombatDebriefSession();
  setStorageItem(STORAGE_LOCAL, TOKEN_KEY, token);
  setStorageItem(STORAGE_LOCAL, USERNAME_KEY, username);
  rotatePresenceSessionId();
  bindProfileStorageIdentity(username);
  // Cada autenticación explícita abre una sesión musical nueva. El usuario
  // puede cambiar el tema después y se conservará hasta logout/nuevo login.
  markAmbientThemeSessionFresh();
  clearSessionView();
  clearHomePlayNudgeSession();
  queueMatthiasLoginGreeting();
}

export async function reportLogoutPresence(sessionId = null) {
  const token = getToken();
  if (!token) return false;
  const closingSessionId = sessionId || getPresenceSessionId();
  try {
    const response = await request(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(closingSessionId ? { 'X-Presence-Session': closingSessionId } : {}) },
      keepalive: true,
      timeoutMs: 1500,
    });
    return !!response?.ok;
  } catch {
    // Presencia es auxiliar: nunca impedimos que el usuario cierre sesión si
    // el backend no responde. El TTL existente seguirá siendo el fallback.
    return false;
  }
}

// pagehide/F5 necesita una identidad nueva para el documento siguiente. Si
// reutilizásemos la misma id, una request de logout retrasada del documento
// viejo podría llegar DESPUÉS del heartbeat del documento nuevo y apagarlo.
export function reportPageLeavePresence() {
  const closingSessionId = getPresenceSessionId();
  if (!closingSessionId) return Promise.resolve(false);
  rotatePresenceSessionId();
  return reportLogoutPresence(closingSessionId);
}

export function logout() {
  clearAmbientThemeSessionStorage();
  clearSessionView();
  clearLocalUserState();
  clearAllClockSnapshots();
  clearCombatSession();
  clearCombatDebriefSession();
  clearHomePlayNudgeSession();
  clearMatthiasSessionSignals();
  removeStorageItem(STORAGE_LOCAL, TOKEN_KEY);
  removeStorageItem(STORAGE_LOCAL, USERNAME_KEY);
  removeStorageItem(STORAGE_SESSION, PRESENCE_SESSION_KEY);
  removeStorageItem(STORAGE_SESSION, PRESENCE_DOCUMENT_OWNER_KEY);
  bindProfileStorageIdentity(null);
}

export async function register(username, password, email, inviteCode = '', language = 'es', { signal } = {}) {
  const body = await requestJson(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, email, inviteCode }),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    signal,
  });
  saveSession(body.token, body.username);
  setUiLanguage(language);
  return body;
}

export async function login(username, password, { signal } = {}) {
  const body = await requestJson(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    signal,
  });
  saveSession(body.token, body.username);
  return body;
}

export async function forgotPassword(email, { signal } = {}) {
  return requestJson(`${BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    signal,
  });
}

export async function resetPassword(token, newPassword, { signal } = {}) {
  const body = await requestJson(`${BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
    signal,
  });
  saveSession(body.token, body.username);
  return body;
}

export async function updateRecoveryEmail(email, password) {
  return requestJson(`${BASE_URL}/auth/email`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ email, password }),
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });
}

// Header listo para adjuntar a cualquier fetch que necesite autenticarse
// — objeto vacío si no hay sesión, así se puede hacer siempre
// `{ ...authHeader(), 'Content-Type': 'application/json' }` sin chequear
// null en cada lugar que lo usa.
export function authHeader() {
  const token = getToken();
  if (!token) return {};
  const sessionId = getPresenceSessionId();
  return {
    Authorization: `Bearer ${token}`,
    ...(sessionId ? { 'X-Presence-Session': sessionId } : {}),
  };
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
export async function fetchMeStatus() {
  try {
    const user = await requestJson(`${BASE_URL}/auth/me`, { headers: { ...authHeader() }, timeoutMs: BACKGROUND_REQUEST_TIMEOUT_MS });
    return { status: 'ok', user };
  } catch (error) {
    if (error?.status === 401) return { status: 'unauthorized', user: null, error };
    return { status: 'unavailable', user: null, error };
  }
}

export async function fetchMe() {
  const result = await fetchMeStatus();
  return result.user;
}

export function wakeBackend() {
  request(`${BASE_URL}/health`, { timeoutMs: BACKGROUND_REQUEST_TIMEOUT_MS }).catch(() => {});
}

export async function fetchLiveStatus() {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const body = await requestJson(`${BASE_URL}/status`, { headers: { ...authHeader() }, timeoutMs: BACKGROUND_REQUEST_TIMEOUT_MS });
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Math.max(0, Math.round(ended - started));
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

export function touchActivity(activity = null, foreground = null, { keepalive = false } = {}) {
  if (!getToken()) return;
  const hasForeground = typeof foreground === 'boolean';
  const hasBody = !!activity || hasForeground || !!APP_RELEASE;
  const headers = { ...authHeader() };
  if (hasBody) headers['Content-Type'] = 'application/json';
  const payload = {};
  if (activity) payload.activity = activity;
  if (hasForeground) payload.foreground = foreground;
  if (APP_RELEASE) payload.release = APP_RELEASE;
  request(`${BASE_URL}/auth/activity`, {
    method: 'POST',
    headers,
    body: hasBody ? JSON.stringify(payload) : undefined,
    keepalive,
    timeoutMs: BACKGROUND_REQUEST_TIMEOUT_MS,
  }).catch(() => {});
}

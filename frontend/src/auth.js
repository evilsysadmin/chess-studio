// auth.js — Cuenta de usuario: registro, login, y el token de sesión
// (JWT) guardado en localStorage. Sin esto no hay perfil que sincronizar
// — cada usuario necesita loguearse para que `/api/profile` sepa de
// quién es el progreso que está subiendo o bajando.

const TOKEN_KEY = 'chess-study-auth-token';
const USERNAME_KEY = 'chess-study-auth-username';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function handle(response) {
  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (body?.detail) message = body.detail;
    } catch (e) {
      // respuesta sin cuerpo JSON — nos quedamos con el mensaje genérico
    }
    throw new Error(message);
  }
  return response.json();
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername() {
  return localStorage.getItem(USERNAME_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

function saveSession(token, username) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export async function register(username, password, inviteCode) {
  const body = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, inviteCode }),
  }).then(handle);
  saveSession(body.token, body.username);
  return body;
}

export async function login(username, password) {
  const body = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(handle);
  saveSession(body.token, body.username);
  return body;
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
    const res = await fetch(`${BASE_URL}/auth/me`, { headers: { ...authHeader() } });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    // sin backend disponible -> seguimos sin saber si es admin, no bloquea el arranque
    return null;
  }
}

export function wakeBackend() {
  fetch(`${BASE_URL}/health`).catch(() => {});
}

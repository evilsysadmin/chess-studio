import { STORAGE_SESSION, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';
import { clearMatthiasSessionContext } from './matthiasSessionContext.js';

export const MATTHIAS_HOME_SESSION_KEY = 'chess-study-matthias-home-seen-v1';
export const MATTHIAS_LOGIN_GREETING_PENDING_KEY = 'chess-study-matthias-login-greeting-pending-v1';
export const MATTHIAS_DISCOVERY_EXPOSURE_KEY = 'chess-study-matthias-discovery-exposure-v1';
const MAX_DISCOVERY_EXPOSURES = 8;

export function matthiasDiscoveryExposures() {
  try {
    const parsed = JSON.parse(getStorageItem(STORAGE_SESSION, MATTHIAS_DISCOVERY_EXPOSURE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry.surface === 'string').slice(-MAX_DISCOVERY_EXPOSURES)
      : [];
  } catch {
    return [];
  }
}

export function recordMatthiasDiscoveryExposure(surface = 'unknown', now = Date.now()) {
  const cleanSurface = typeof surface === 'string' && surface.trim() ? surface.trim() : 'unknown';
  const next = [...matthiasDiscoveryExposures(), { surface: cleanSurface, at: Number(now) || Date.now() }]
    .slice(-MAX_DISCOVERY_EXPOSURES);
  setStorageItem(STORAGE_SESSION, MATTHIAS_DISCOVERY_EXPOSURE_KEY, JSON.stringify(next));
  return next;
}

export function matthiasDiscoverySessionSeen() {
  return matthiasDiscoveryExposures().length > 0;
}

export function matthiasHomeSessionSeen() {
  // Compatibilidad con la señal Home histórica y, a la vez, presupuesto
  // compartido: si Matthias ya apareció proactivamente en otra superficie de
  // esta sesión, Home se calla en vez de iniciar otra aparición independiente.
  return getStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY) === '1'
    || matthiasDiscoverySessionSeen();
}

export function markMatthiasHomeSessionSeen(now = Date.now()) {
  setStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY, '1');
  recordMatthiasDiscoveryExposure('home', now);
}

export function queueMatthiasLoginGreeting() {
  // Una autenticación explícita abre una sesión narrativa nueva aunque ocurra
  // en la misma pestaña tras logout/login. El saludo no depende del cooldown.
  // También reinicia el contexto/exposición para que nunca cruce usuarios.
  clearMatthiasSessionContext();
  removeStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY);
  removeStorageItem(STORAGE_SESSION, MATTHIAS_DISCOVERY_EXPOSURE_KEY);
  setStorageItem(STORAGE_SESSION, MATTHIAS_LOGIN_GREETING_PENDING_KEY, '1');
}

export function matthiasLoginGreetingPending() {
  return getStorageItem(STORAGE_SESSION, MATTHIAS_LOGIN_GREETING_PENDING_KEY) === '1';
}

export function consumeMatthiasLoginGreeting(now = Date.now()) {
  removeStorageItem(STORAGE_SESSION, MATTHIAS_LOGIN_GREETING_PENDING_KEY);
  setStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY, '1');
  recordMatthiasDiscoveryExposure('login-greeting', now);
}

export function clearMatthiasSessionSignals() {
  removeStorageItem(STORAGE_SESSION, MATTHIAS_HOME_SESSION_KEY);
  removeStorageItem(STORAGE_SESSION, MATTHIAS_LOGIN_GREETING_PENDING_KEY);
  removeStorageItem(STORAGE_SESSION, MATTHIAS_DISCOVERY_EXPOSURE_KEY);
  clearMatthiasSessionContext();
}

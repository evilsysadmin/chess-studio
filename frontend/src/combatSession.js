// Snapshot efímero de una batalla de Combat Chess.
// sessionStorage sobrevive a reload/remount en la misma pestaña, pero no se
// sincroniza al perfil ni entre dispositivos: sirve como cinturón de seguridad
// frente a recargas accidentales sin convertir una pelea activa en un save
// portable/farmeable.
const KEY = 'chess-study-active-combat-session-v1';
const VERSION = 1;

export function combatSessionId(value = 'free') {
  const id = String(value || 'free').trim();
  return id || 'free';
}

export function saveCombatSession(sessionId, snapshot) {
  if (typeof sessionStorage === 'undefined') return;
  const id = combatSessionId(sessionId);
  const payload = {
    version: VERSION,
    sessionId: id,
    savedAt: new Date().toISOString(),
    ...snapshot,
  };
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

export function loadCombatSession(sessionId) {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== VERSION) return null;
    if (parsed.sessionId !== combatSessionId(sessionId)) return null;
    if (parsed.phase !== 'battle' || typeof parsed.fen !== 'string' || !parsed.registry) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasCombatSession(sessionId) {
  return !!loadCombatSession(sessionId);
}

export function clearCombatSession(sessionId = null) {
  if (typeof sessionStorage === 'undefined') return;
  if (sessionId == null) {
    sessionStorage.removeItem(KEY);
    return;
  }
  const current = loadCombatSession(sessionId);
  if (current) sessionStorage.removeItem(KEY);
}

export const COMBAT_SESSION_STORAGE_KEY = KEY;

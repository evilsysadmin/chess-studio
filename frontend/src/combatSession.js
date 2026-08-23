// Snapshot efímero de una batalla de Combat Chess.
// sessionStorage sobrevive a reload/remount en la misma pestaña, pero no se
// sincroniza al perfil ni entre dispositivos: sirve como cinturón de seguridad
// frente a recargas accidentales sin convertir una pelea activa en un save
// portable/farmeable.
const KEY = 'chess-study-active-combat-session-v1';
const VERSION = 1;

// Segunda línea de defensa contra remounts de React/HMR dentro de la misma
// carga de página. Si sessionStorage falla temporalmente o un render lee entre
// escrituras, no devolvemos una batalla viva a Setup. Un reload completo sigue
// dependiendo deliberadamente de sessionStorage.
const memorySnapshots = new Map();

export function combatSessionId(value = 'free') {
  const id = String(value || 'free').trim();
  return id || 'free';
}

function validSnapshot(parsed, id) {
  return !!(
    parsed &&
    parsed.version === VERSION &&
    parsed.sessionId === id &&
    parsed.phase === 'battle' &&
    typeof parsed.fen === 'string' &&
    parsed.registry
  );
}

export function saveCombatSession(sessionId, snapshot) {
  const id = combatSessionId(sessionId);
  const payload = {
    version: VERSION,
    sessionId: id,
    savedAt: new Date().toISOString(),
    ...snapshot,
  };

  // La copia en memoria se actualiza primero. Así incluso un setItem que falle
  // por el entorno del navegador no puede convertir un remount React en Setup.
  memorySnapshots.set(id, payload);

  if (typeof sessionStorage === 'undefined') return false;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    // Un fallo de persistencia no debe romper la partida en curso. El snapshot
    // de memoria sigue siendo recuperable hasta recargar la pestaña.
    // eslint-disable-next-line no-console
    console.error('[CombatSession] No se pudo persistir el snapshot; se mantiene respaldo en memoria.', error);
    return false;
  }
}

export function loadCombatSession(sessionId) {
  const id = combatSessionId(sessionId);
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (validSnapshot(parsed, id)) {
          memorySnapshots.set(id, parsed);
          return parsed;
        }
      }
    } catch (error) {
      // La copia en memoria es el fallback para remounts dentro de esta página.
      // eslint-disable-next-line no-console
      console.error('[CombatSession] Snapshot de sessionStorage ilegible; intentando respaldo en memoria.', error);
    }
  }

  const memory = memorySnapshots.get(id) || null;
  return validSnapshot(memory, id) ? memory : null;
}

export function hasCombatSession(sessionId) {
  return !!loadCombatSession(sessionId);
}

export function canReturnCombatToSetup({ phase, combatVariant } = {}) {
  // En campaña/roguelike, una batalla viva sólo puede terminar por una salida
  // explícita (retirada/resultado). Un remount, callback o gesto de navegación
  // nunca debe degradarla silenciosamente a Setup.
  return !(phase === 'battle' && combatVariant === 'roguelike');
}


export function clearCombatSession(sessionId = null) {
  if (sessionId == null) {
    memorySnapshots.clear();
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(KEY);
    return;
  }

  const id = combatSessionId(sessionId);
  memorySnapshots.delete(id);

  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.sessionId === id) sessionStorage.removeItem(KEY);
  } catch {
    // Si el payload quedó corrupto, lo retiramos: no puede pertenecer a una
    // sesión recuperable y no queremos bloquear futuras batallas.
    sessionStorage.removeItem(KEY);
  }
}


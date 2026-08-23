import { STORAGE_LOCAL, listStorageKeys, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';

const PREFIX = 'chess-study-clock:';
const VERSION = 1;

function key(gameId) { return `${PREFIX}${gameId}`; }

export function loadClockSnapshot(gameId) {
  if (!gameId) return null;
  try {
    const value = readJsonStorage(STORAGE_LOCAL, key(gameId), { fallback: null, removeMalformed: true });
    if (!value || value.version !== VERSION || value.gameId !== gameId) return null;
    if (!Number.isFinite(value.whiteTime) || !Number.isFinite(value.blackTime)) return null;
    if (!['w', 'b'].includes(value.activeColor)) return null;
    if (!Number.isFinite(value.savedAt)) return null;
    return value;
  } catch { return null; }
}

export function saveClockSnapshot({ gameId, timeControlId, whiteTime, blackTime, activeColor, now = Date.now() }) {
  if (!gameId) return null;
  if (!Number.isFinite(whiteTime) || !Number.isFinite(blackTime) || !['w', 'b'].includes(activeColor)) return null;
  const value = { version: VERSION, gameId, timeControlId: timeControlId || 'none', whiteTime, blackTime, activeColor, savedAt: now };
  return writeJsonStorage(STORAGE_LOCAL, key(gameId), value) ? value : null;
}

export function clearClockSnapshot(gameId) {
  if (gameId) removeStorageItem(STORAGE_LOCAL, key(gameId));
}

export function restoreClockState(gameId, timeControl, currentTurn, now = Date.now()) {
  if (!timeControl?.initial) return { whiteTime: null, blackTime: null, flagFallen: null, restored: false };
  const snapshot = loadClockSnapshot(gameId);
  if (!snapshot || snapshot.timeControlId !== timeControl.id) {
    return { whiteTime: timeControl.initial, blackTime: timeControl.initial, flagFallen: null, restored: false };
  }
  let whiteTime = Math.max(0, snapshot.whiteTime);
  let blackTime = Math.max(0, snapshot.blackTime);
  // Sólo cobramos el tiempo transcurrido durante el refresh si el servidor
  // sigue diciendo que mueve el mismo color. Si el turno cambió mientras la
  // pestaña estaba fuera, no inventamos cuánto tardó esa transición.
  if (snapshot.activeColor === currentTurn) {
    const elapsed = Math.max(0, (now - snapshot.savedAt) / 1000);
    if (currentTurn === 'w') whiteTime = Math.max(0, whiteTime - elapsed);
    else blackTime = Math.max(0, blackTime - elapsed);
  }
  const flagFallen = whiteTime <= 0 ? 'w' : blackTime <= 0 ? 'b' : null;
  return { whiteTime, blackTime, flagFallen, restored: true };
}


export function clearAllClockSnapshots() {
  const keys = listStorageKeys(STORAGE_LOCAL, { prefix: PREFIX });
  for (const candidate of keys) removeStorageItem(STORAGE_LOCAL, candidate);
  return keys.length;
}

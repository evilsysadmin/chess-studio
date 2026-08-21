const PREFIX = 'chess-study-clock:';
const VERSION = 1;

function key(gameId) { return `${PREFIX}${gameId}`; }

export function loadClockSnapshot(gameId) {
  if (!gameId || typeof localStorage === 'undefined') return null;
  try {
    const value = JSON.parse(localStorage.getItem(key(gameId)) || 'null');
    if (!value || value.version !== VERSION || value.gameId !== gameId) return null;
    if (!Number.isFinite(value.whiteTime) || !Number.isFinite(value.blackTime)) return null;
    if (!['w', 'b'].includes(value.activeColor)) return null;
    if (!Number.isFinite(value.savedAt)) return null;
    return value;
  } catch { return null; }
}

export function saveClockSnapshot({ gameId, timeControlId, whiteTime, blackTime, activeColor, now = Date.now() }) {
  if (!gameId || typeof localStorage === 'undefined') return null;
  if (!Number.isFinite(whiteTime) || !Number.isFinite(blackTime) || !['w', 'b'].includes(activeColor)) return null;
  const value = { version: VERSION, gameId, timeControlId: timeControlId || 'none', whiteTime, blackTime, activeColor, savedAt: now };
  localStorage.setItem(key(gameId), JSON.stringify(value));
  return value;
}

export function clearClockSnapshot(gameId) {
  if (gameId && typeof localStorage !== 'undefined') localStorage.removeItem(key(gameId));
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
  if (typeof localStorage === 'undefined') return 0;
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const candidate = localStorage.key(i);
    if (candidate?.startsWith(PREFIX)) keys.push(candidate);
  }
  for (const candidate of keys) localStorage.removeItem(candidate);
  return keys.length;
}

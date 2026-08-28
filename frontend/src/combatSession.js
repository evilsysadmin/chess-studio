import { Chess } from 'chess.js';
import { STORAGE_SESSION, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';
import { isCombatPositionCoherent } from './combat.js';

// Snapshots efímeros de batallas Combat Chess.
// sessionStorage sobrevive a reload/remount en la misma pestaña, pero no se
// sincroniza al perfil ni entre dispositivos: sirve como cinturón de seguridad
// frente a recargas accidentales sin convertir una pelea activa en un save
// portable/farmeable.
const KEY = 'chess-study-active-combat-session-v1';
const MARKER_KEY = 'chess-study-active-combat-markers-v1';
const SNAPSHOT_VERSION = 1;
const BUCKET_VERSION = 2;
const MARKER_VERSION = 1;

// Segunda línea de defensa contra remounts de React/HMR dentro de la misma
// carga de página. También permite conservar más de una batalla suspendida
// dentro de la pestaña (por ejemplo campaña + combate libre) sin que una pise
// a la otra antes de que sessionStorage llegue a intervenir.
const memorySnapshots = new Map();

function readMarkers() {
  const parsed = readJsonStorage(STORAGE_SESSION, MARKER_KEY, { fallback: null, removeMalformed: true });
  if (parsed?.version !== MARKER_VERSION || !Array.isArray(parsed.sessionIds)) return new Set();
  return new Set(parsed.sessionIds.filter((id) => typeof id === 'string' && id.trim()));
}

function setCombatSessionMarker(sessionId, active) {
  const id = combatSessionId(sessionId);
  const markers = readMarkers();
  if (active) markers.add(id);
  else markers.delete(id);
  if (markers.size === 0) return removeStorageItem(STORAGE_SESSION, MARKER_KEY);
  return writeJsonStorage(STORAGE_SESSION, MARKER_KEY, {
    version: MARKER_VERSION,
    sessionIds: [...markers],
  });
}

export function hasCombatSessionMarker(sessionId) {
  return readMarkers().has(combatSessionId(sessionId));
}

export function combatSessionId(value = 'free') {
  const id = String(value || 'free').trim();
  return id || 'free';
}

function validFen(fen) {
  if (typeof fen !== 'string' || !fen.trim()) return false;
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

function validSnapshot(parsed, id) {
  return !!(
    parsed &&
    parsed.version === SNAPSHOT_VERSION &&
    parsed.sessionId === id &&
    parsed.phase === 'battle' &&
    validFen(parsed.fen) &&
    parsed.registry &&
    typeof parsed.registry === 'object' &&
    !Array.isArray(parsed.registry) &&
    isCombatPositionCoherent(parsed.fen, parsed.registry) &&
    (parsed.humanColor === 'w' || parsed.humanColor === 'b') &&
    (parsed.combatLog == null || Array.isArray(parsed.combatLog)) &&
    (parsed.uiLog == null || Array.isArray(parsed.uiLog)) &&
    (parsed.positionCounts == null || Array.isArray(parsed.positionCounts)) &&
    (parsed.battleParticipants == null || Array.isArray(parsed.battleParticipants)) &&
    (parsed.unitBattleStats == null || (typeof parsed.unitBattleStats === 'object' && !Array.isArray(parsed.unitBattleStats)))
  );
}

function readSnapshotBucket() {
  const parsed = readJsonStorage(STORAGE_SESSION, KEY, { fallback: null, removeMalformed: true });
  if (!parsed) return {};

  // Compatibilidad con el formato original: un único snapshot directamente
  // bajo KEY. Se migra de forma perezosa al siguiente save, sin invalidarlo.
  if (parsed.version === SNAPSHOT_VERSION && parsed.sessionId) {
    return validSnapshot(parsed, parsed.sessionId) ? { [parsed.sessionId]: parsed } : {};
  }

  if (parsed.version !== BUCKET_VERSION || !parsed.sessions || typeof parsed.sessions !== 'object') return {};
  return Object.fromEntries(
    Object.entries(parsed.sessions).filter(([id, snapshot]) => validSnapshot(snapshot, id)),
  );
}

function writeSnapshotBucket(sessions) {
  const entries = Object.entries(sessions || {});
  if (entries.length === 0) return removeStorageItem(STORAGE_SESSION, KEY);
  return writeJsonStorage(STORAGE_SESSION, KEY, {
    version: BUCKET_VERSION,
    sessions: Object.fromEntries(entries),
  });
}

export function saveCombatSession(sessionId, snapshot) {
  const id = combatSessionId(sessionId);
  const payload = {
    version: SNAPSHOT_VERSION,
    sessionId: id,
    savedAt: new Date().toISOString(),
    ...snapshot,
  };

  if (!validSnapshot(payload, id)) {
    // Never overwrite a recoverable battle with an impossible FEN/registry.
    // A corrupted in-memory state is safer to reject than to resurrect later.
    // eslint-disable-next-line no-console
    console.error('[CombatSession] Snapshot inválido descartado antes de persistir.');
    return false;
  }

  // La copia en memoria se actualiza primero. Así incluso un setItem que falle
  // por el entorno del navegador no puede convertir un remount React en Setup.
  memorySnapshots.set(id, payload);
  setCombatSessionMarker(id, true);

  const sessions = readSnapshotBucket();
  sessions[id] = payload;
  const durable = writeSnapshotBucket(sessions);
  if (!durable) {
    // Un fallo de persistencia no debe romper la partida en curso. El snapshot
    // de memoria/safeStorage sigue siendo recuperable durante esta pestaña.
    // eslint-disable-next-line no-console
    console.error('[CombatSession] No se pudo persistir el snapshot; se mantiene respaldo en memoria.');
  }
  return durable;
}

export function loadCombatSession(sessionId) {
  const id = combatSessionId(sessionId);
  const snapshot = readSnapshotBucket()[id] || null;
  if (validSnapshot(snapshot, id)) {
    memorySnapshots.set(id, snapshot);
    return snapshot;
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
    removeStorageItem(STORAGE_SESSION, KEY);
    removeStorageItem(STORAGE_SESSION, MARKER_KEY);
    return;
  }

  const id = combatSessionId(sessionId);
  memorySnapshots.delete(id);
  setCombatSessionMarker(id, false);
  const sessions = readSnapshotBucket();
  delete sessions[id];
  writeSnapshotBucket(sessions);
}

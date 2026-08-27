import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

// gameHistory.js — Guarda un registro liviano de las últimas partidas de
// torneo (jugadas, resultado, fecha) para poder reproducirlas después. Como
// vive en la caché local y se sincroniza con MongoDB; por eso
// limitamos cuántas partidas guardamos.

const KEY = 'chess-study-game-history';
const MAX_RECORDS = 120;

// Partidas que forman parte de la rivalidad/rating normal. Los modos de
// entrenamiento se guardan en Historial, pero no deben inflar el marcador
// competitivo del Centro de Operaciones.
export function isStatisticalHistoryRecord(record) {
  const outcome = String(record?.outcome || '');
  const endReason = String(record?.endReason || '');
  if (!['win', 'draw', 'loss'].includes(outcome)) return false;
  if (record?.excludedFromStats === true || record?.noPenalty === true) return false;
  return !['cancelled', 'abandoned-no-penalty', 'cancel-no-move'].includes(endReason);
}

export function isCompetitiveHistoryRecord(record) {
  if (!isStatisticalHistoryRecord(record)) return false;
  const mode = String(record?.mode || 'casual');
  return !['practice', 'lab', 'rescue', 'sudden'].includes(mode);
}

export function statisticalHistoryRecords(records) {
  return (Array.isArray(records) ? records : []).filter(isStatisticalHistoryRecord);
}

export function loadGameHistory() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Agrega un registro (el más reciente primero) y devuelve la lista actualizada.
export function saveGameRecord(record) {
  const list = loadGameHistory();
  list.unshift(record);
  if (list.length > MAX_RECORDS) list.length = MAX_RECORDS;
  setProfileStorageItem(KEY, JSON.stringify(list));
  return list;
}

export function clearGameHistory() {
  removeProfileStorageItem(KEY);
  return [];
}

// Actualiza únicamente el transcript de una partida ya archivada. Se usa
// porque algunos comentarios de resultado aparecen ~1 s después de terminar
// la partida: el registro base ya existe, y este parche añade esas últimas
// pullas sin duplicar ni recrear la partida completa.
export function updateGameRecordChat(sourceGameId, gameChat) {
  if (!sourceGameId || !Array.isArray(gameChat)) return loadGameHistory();
  const list = loadGameHistory();
  const index = list.findIndex((record) => record?.sourceGameId === sourceGameId || record?.id === sourceGameId);
  if (index < 0) return list;
  const previous = list[index]?.gameChat || [];
  if (previous.length === gameChat.length && previous.at(-1)?.id === gameChat.at(-1)?.id) return list;
  list[index] = { ...list[index], gameChat };
  setProfileStorageItem(KEY, JSON.stringify(list));
  return list;
}

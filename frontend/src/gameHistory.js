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
export function isCompetitiveHistoryRecord(record) {
  const mode = String(record?.mode || 'casual');
  return !['practice', 'lab', 'rescue', 'sudden'].includes(mode);
}

export function loadGameHistory() {
  try {
    const raw = localStorage.getItem(KEY);
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

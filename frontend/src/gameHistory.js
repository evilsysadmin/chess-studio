// gameHistory.js — Guarda un registro liviano de las últimas partidas de
// torneo (jugadas, resultado, fecha) para poder reproducirlas después. Como
// todavía no hay base de datos (fase 2 del roadmap), vive en localStorage;
// por eso limitamos cuántas partidas guardamos.

const KEY = 'chess-study-game-history';
const MAX_RECORDS = 25;

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
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}

export function clearGameHistory() {
  localStorage.removeItem(KEY);
  return [];
}

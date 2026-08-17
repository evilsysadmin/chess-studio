// combatHistory.js — Historial de batallas del Modo Combate, para poder
// reproducirlas después con la "pista inversa".
//
// Va aparte de gameHistory.js (que guarda Torneo/Práctica/Partida rápida) a
// propósito: esos guardan una lista de jugadas SAN reproducible con
// chess.js normal. Combate no puede: los fallos/esquives NO mueven la
// pieza, solo pasan el turno — eso rompe el supuesto de "alternancia
// estricta blanco/negro" del que depende reproducir una partida jugada a
// jugada con chess.js. Acá se guarda el FEN resultante de cada paso
// directamente (ver `log` en cada batalla), así que reproducirla es indexar
// esa lista, no volver a jugar las jugadas.

const KEY = 'chess-study-combat-history';
const MAX_RECORDS = 25;

export function loadCombatHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCombatBattle(record) {
  const list = loadCombatHistory();
  list.unshift(record); // la más reciente primero
  const trimmed = list.slice(0, MAX_RECORDS);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function clearCombatHistory() {
  localStorage.removeItem(KEY);
  return [];
}

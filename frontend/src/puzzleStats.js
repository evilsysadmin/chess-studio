import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

// puzzleStats.js — Cuántos puzzles resolviste en total, de por vida (no solo
// en la sesión actual). PuzzleScreen ya lleva su propio contador en estado
// de React para mostrar "resueltos: N" mientras estás jugando, pero eso se
// pierde al salir de la pantalla — esto es lo que persiste, para los logros
// y para cualquier resumen de estadísticas.

const KEY = 'chess-study-puzzles-solved';

export function loadPuzzlesSolved() {
  const raw = localStorage.getItem(KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function incrementPuzzlesSolved() {
  const next = loadPuzzlesSolved() + 1;
  setProfileStorageItem(KEY, String(next));
  return next;
}

// Racha de puzzles resueltos a la primera, sin ningún intento fallido sin
// proteger — un intento fallido pagado con puntos (ver puzzleRetryCost en
// tournament.js) NO cuenta como fallo para la racha, es justo lo que
// compra ese gasto.
const STREAK_KEY = 'chess-study-puzzle-streak';
const BEST_STREAK_KEY = 'chess-study-puzzle-best-streak';

export function loadPuzzleStreak() {
  const raw = localStorage.getItem(STREAK_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function loadBestPuzzleStreak() {
  const raw = localStorage.getItem(BEST_STREAK_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function incrementPuzzleStreak() {
  const next = loadPuzzleStreak() + 1;
  setProfileStorageItem(STREAK_KEY, String(next));
  if (next > loadBestPuzzleStreak()) {
    setProfileStorageItem(BEST_STREAK_KEY, String(next));
  }
  return next;
}

export function resetPuzzleStreak() {
  setProfileStorageItem(STREAK_KEY, '0');
  return 0;
}

// A diferencia de resetPuzzleStreak (que deja la MEJOR marca intacta a
// propósito, romper una racha no debería borrar tu récord), esto borra
// todo — resueltos de por vida, racha actual, y mejor marca — para un
// reset completo de progreso ("empezar de cero").
export function resetAllPuzzleStats() {
  removeProfileStorageItem(KEY);
  removeProfileStorageItem(STREAK_KEY);
  removeProfileStorageItem(BEST_STREAK_KEY);
}

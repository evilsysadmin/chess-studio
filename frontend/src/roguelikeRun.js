// roguelikeRun.js — Estado de una corrida de Combate roguelike: en qué
// piso estás, si hay una corrida en curso, y tu mejor marca histórica
// (persiste incluso cuando pierdes una corrida — mismo criterio que la
// mejor racha de puzzles o de victorias de torneo).

const KEY = 'chess-study-roguelike-run';
const BEST_FLOOR_KEY = 'chess-study-roguelike-best-floor';

function defaultRun() {
  return { floor: 1, inRun: false };
}

export function loadRun() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultRun();
    const parsed = JSON.parse(raw);
    return { ...defaultRun(), ...parsed };
  } catch (e) {
    return defaultRun();
  }
}

function saveRun(run) {
  localStorage.setItem(KEY, JSON.stringify(run));
  return run;
}

export function startNewRun() {
  return saveRun({ floor: 1, inRun: true });
}

// Ganaste el piso actual: sube uno, sigue en corrida.
export function advanceFloor(run) {
  return saveRun({ floor: run.floor + 1, inRun: true });
}

// Perdiste (o te retiraste): termina la corrida, actualiza la mejor marca
// si corresponde. El piso alcanzado es el que tenías al perder/retirarte
// (no cuenta como "superado" el piso en el que caíste).
export function endRun(run) {
  const reached = run.floor;
  if (reached > loadBestFloor()) {
    localStorage.setItem(BEST_FLOOR_KEY, String(reached));
  }
  saveRun(defaultRun());
  return reached;
}

export function loadBestFloor() {
  const raw = localStorage.getItem(BEST_FLOOR_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function resetRoguelikeRun() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(BEST_FLOOR_KEY);
}

// La dificultad de la CPU escala con el piso — más allá del material
// extra que agrega roguelikeModifiers.js, el motor en sí también juega
// más fuerte piso a piso. Tope en 95 (no 100) para que siempre quede un
// margen mínimo de azar, ni en el piso más alto la partida se vuelve
// una sentencia matemática segura.
export function difficultyForFloor(floor) {
  return Math.min(95, 20 + floor * 6);
}

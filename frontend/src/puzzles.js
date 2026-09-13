import puzzleCatalog from './puzzles.catalog.json';

// Banco curado canónico en JSON para que frontend y validadores backend/CI
// consuman exactamente las mismas posiciones. `solution` contiene la línea
// completa en SAN, alternando jugador/rival: índices pares = jugador.
export const PUZZLE_DIFFICULTY_LABELS = Object.freeze({
  easy: 'Fácil',
  medium: 'Media',
  hard: 'Difícil',
  brutal: 'Brutal',
});

export const PUZZLES = puzzleCatalog;

function excludedIds(exclude) {
  if (Array.isArray(exclude)) return new Set(exclude.filter(Boolean));
  return new Set(exclude ? [exclude] : []);
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Evita posiciones recientes y, siempre que el banco lo permita, también
// repetir inmediatamente el mismo tipo y la misma dificultad. Elegimos antes
// una dificultad y después una posición para que los numerosos ejercicios
// fáciles no ahoguen a los de cálculo largo.
export function randomPuzzle(exclude = null, previousKind = null, previousDifficulty = null) {
  const excluded = excludedIds(exclude);
  const fresh = PUZZLES.filter((p) => !excluded.has(p.id));
  const base = fresh.length > 0 ? fresh : PUZZLES.filter((p) => p.id !== [...excluded][0]);
  const differentKind = previousKind ? base.filter((p) => p.kind !== previousKind) : base;
  const kindPool = differentKind.length > 0 ? differentKind : base;
  const differentDifficulty = previousDifficulty ? kindPool.filter((p) => p.difficulty !== previousDifficulty) : kindPool;
  const pool = differentDifficulty.length > 0 ? differentDifficulty : kindPool.length > 0 ? kindPool : PUZZLES;
  const difficulties = [...new Set(pool.map((p) => p.difficulty || 'easy'))];
  const difficulty = randomItem(difficulties);
  return randomItem(pool.filter((p) => (p.difficulty || 'easy') === difficulty));
}

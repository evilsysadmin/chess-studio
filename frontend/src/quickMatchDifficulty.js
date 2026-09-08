import { difficultyForRating } from './playerRating.js';

// Partida rápida usa la misma señal adaptativa que el resto de Chess Studio,
// pero calibra la dificultad efectiva para que los saltos internos del motor
// (profundidad 3→4→5→6) no se sientan como una pared repentina. La curva es
// deliberadamente monótona: mejorar nunca puede darte una CPU más fácil, sólo
// hace que el aumento de fuerza sea más progresivo.
export const QUICK_MATCH_ENGINE_CURVE = Object.freeze([
  [0, 0],
  [20, 19],
  [45, 43],
  [69, 66],
  [70, 67],
  [80, 76],
  [89, 84],
  [90, 85],
  [97, 92],
  [98, 93],
  [100, 98],
]);

export function calibrateQuickMatchDifficulty(rawDifficulty) {
  const raw = Math.max(0, Math.min(100, Number(rawDifficulty) || 0));
  for (let index = 1; index < QUICK_MATCH_ENGINE_CURVE.length; index += 1) {
    const [rightRaw, rightEngine] = QUICK_MATCH_ENGINE_CURVE[index];
    const [leftRaw, leftEngine] = QUICK_MATCH_ENGINE_CURVE[index - 1];
    if (raw <= rightRaw) {
      const span = rightRaw - leftRaw || 1;
      const t = (raw - leftRaw) / span;
      return Math.round(leftEngine + (rightEngine - leftEngine) * t);
    }
  }
  return QUICK_MATCH_ENGINE_CURVE[QUICK_MATCH_ENGINE_CURVE.length - 1][1];
}

export function difficultyForQuickMatchRating(rating, activity = null, games = null) {
  return calibrateQuickMatchDifficulty(difficultyForRating(rating, activity, games));
}

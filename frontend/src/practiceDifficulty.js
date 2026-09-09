import { difficultyForRating } from './playerRating.js';
import { calibrateQuickMatchDifficulty } from './quickMatchDifficulty.js';

// Práctica usa la misma señal adaptativa que Partida rápida, pero baja un
// pequeño escalón ANTES de calibrar contra los saltos internos del motor.
// Así sigue siendo deliberadamente más amable sin volver a caer justo en los
// precipicios de profundidad 70/90/98. Es un ajuste PRE-partida: nunca cambia
// la fuerza de Matthias a mitad del tablero y nunca participa en el rating.
export const PRACTICE_ADAPTIVE_RELIEF = 6;

export function difficultyForPracticeRating(rating, activity = null, games = null) {
  const raw = Math.max(0, difficultyForRating(rating, activity, games) - PRACTICE_ADAPTIVE_RELIEF);
  return calibrateQuickMatchDifficulty(raw);
}

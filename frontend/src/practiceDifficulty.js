import { difficultyForRating } from './playerRating.js';

// Práctica usa exactamente la misma señal adaptativa que una partida rápida,
// pero baja un escalón pequeño. Es un ajuste PRE-partida: nunca cambia la
// fuerza de Matthias a mitad del tablero y nunca participa en el rating.
export const PRACTICE_ADAPTIVE_RELIEF = 6;

export function difficultyForPracticeRating(rating, activity = null, games = null) {
  return Math.max(0, difficultyForRating(rating, activity, games) - PRACTICE_ADAPTIVE_RELIEF);
}

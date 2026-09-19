import { difficultyForQuickMatchRating } from './quickMatchDifficulty.js';

// Práctica comparte la misma señal Elo de War Room, pero juega un pequeño
// escalón por debajo. El ajuste ocurre antes de empezar y nunca cambia la CPU
// dentro de una partida.
export const PRACTICE_ADAPTIVE_RELIEF = 6;

export function difficultyForPracticeRating(rating, activity = null, games = null) {
  return Math.max(0, difficultyForQuickMatchRating(rating, activity, games) - PRACTICE_ADAPTIVE_RELIEF);
}

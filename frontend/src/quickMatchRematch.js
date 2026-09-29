import { difficultyForQuickMatchRating } from './quickMatchDifficulty.js';

/**
 * GP-6/GP-8 (#34): «Jugar otra partida» en UN toque desde la postpartida.
 * Sólo para partidas rápidas sueltas: series, runs, laboratorio, rescate y
 * aprendizaje tienen su propio siguiente paso. Revancha = colores cambiados,
 * mismo reloj y reglas; si la partida era adaptativa, Matthias recalibra con el
 * rating ya actualizado por el resultado.
 */
export function quickMatchRematchPlan({ game, gameContext = {}, learningMode = false, activeSeries = null, rating = null, timeControlId = null } = {}) {
  if (!game || learningMode || activeSeries) return null;
  if (gameContext.lab || gameContext.rescue || gameContext.runMode) return null;
  const adaptive = Boolean(gameContext.adaptiveDifficulty);
  const difficulty = adaptive
    ? difficultyForQuickMatchRating(rating?.rating ?? 400, null, rating?.games ?? 0)
    : game.difficulty;
  return {
    difficulty,
    color: game.humanColor === 'b' ? 'w' : 'b',
    options: {
      timeControlId: timeControlId || 'none',
      adaptiveDifficulty: adaptive,
      suddenDeath: Boolean(gameContext.suddenDeath),
      threatCheck: Boolean(gameContext.threatCheck),
      rematch: true,
    },
  };
}

export function quickMatchRematchHandler(plan, startGame) {
  if (!plan || typeof startGame !== 'function') return null;
  return () => startGame(plan.difficulty, plan.color, plan.options);
}

export const COMPLETED_GAME_OUTCOMES = Object.freeze(['win', 'draw', 'loss']);

export function isCompletedGameOutcome(outcome) {
  return COMPLETED_GAME_OUTCOMES.includes(outcome);
}

export function shouldApplyCompetitiveProgress(outcome, { learningMode = false, trainingPosition = false } = {}) {
  return isCompletedGameOutcome(outcome) && !learningMode && !trainingPosition;
}

export function shouldTreatExitAsForfeit({ moveCount = 0, isGameOver = false, learningMode = false, trainingPosition = false } = {}) {
  return Number(moveCount || 0) > 0 && !isGameOver && !learningMode && !trainingPosition;
}

export function gameExitDisposition({
  moveCount = 0,
  isGameOver = false,
  learningMode = false,
  trainingPosition = false,
  explicitAction = true,
  recoverableSession = false,
} = {}) {
  // Un cierre/recarga con snapshot recuperable no es una rendición. Sólo una
  // acción explícita del usuario puede convertir una partida viva en forfeit.
  if (!explicitAction && recoverableSession) return 'resume';
  if (explicitAction && shouldTreatExitAsForfeit({ moveCount, isGameOver, learningMode, trainingPosition })) return 'forfeit';
  return 'cancel';
}

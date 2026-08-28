export const COMPLETED_GAME_OUTCOMES = Object.freeze(['win', 'draw', 'loss']);

export function isCompletedGameOutcome(outcome) {
  return COMPLETED_GAME_OUTCOMES.includes(outcome);
}

export function shouldApplyCompetitiveProgress(outcome, { learningMode = false, trainingPosition = false } = {}) {
  return isCompletedGameOutcome(outcome) && !learningMode && !trainingPosition;
}

export function humanMoveCount(moveCount = 0, humanColor = 'w') {
  const plies = Math.max(0, Number(moveCount) || 0);
  return humanColor === 'b' ? Math.floor(plies / 2) : Math.ceil(plies / 2);
}

export function humanHasLostPiece(game = {}) {
  const history = Array.isArray(game?.history) ? game.history : [];
  const humanColor = game?.humanColor === 'b' ? 'b' : 'w';
  const initialTurn = String(game?.initialFen || '').split(/\s+/)[1] === 'b' ? 'b' : 'w';
  return history.some((move, index) => {
    if (!move?.captured) return false;
    const moverColor = index % 2 === 0 ? initialTurn : (initialTurn === 'w' ? 'b' : 'w');
    return moverColor !== humanColor;
  });
}

export function shouldTreatExitAsForfeit({ moveCount = 0, humanPieceLost = true, isGameOver = false, learningMode = false, trainingPosition = false } = {}) {
  return Number(moveCount || 0) > 0 && humanPieceLost && !isGameOver && !learningMode && !trainingPosition;
}

export function gameExitDisposition({
  moveCount = 0,
  humanPieceLost = true,
  isGameOver = false,
  learningMode = false,
  trainingPosition = false,
  explicitAction = true,
  recoverableSession = false,
} = {}) {
  // Un cierre/recarga con snapshot recuperable no es una rendición. Sólo una
  // acción explícita del usuario puede convertir una partida viva en forfeit.
  // Además damos salida limpia mientras el jugador todavía no haya perdido
  // material: salir pronto no ensucia rating ni estadísticas.
  if (!explicitAction && recoverableSession) return 'resume';
  if (explicitAction && shouldTreatExitAsForfeit({ moveCount, humanPieceLost, isGameOver, learningMode, trainingPosition })) return 'forfeit';
  return 'cancel';
}

export function chessGameExitDisposition(game, options = {}) {
  return gameExitDisposition({
    moveCount: humanMoveCount(game?.history?.length || 0, game?.humanColor),
    humanPieceLost: humanHasLostPiece(game),
    isGameOver: !!game?.isGameOver,
    ...options,
  });
}

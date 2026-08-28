import { describe, expect, it } from 'vitest';
import { chessGameExitDisposition, gameExitDisposition, humanHasLostPiece, humanMoveCount, isCompletedGameOutcome, shouldApplyCompetitiveProgress, shouldTreatExitAsForfeit } from './gameOutcome.js';

describe('completed game outcomes', () => {
  it('solo considera completadas victoria, tablas y derrota', () => {
    expect(isCompletedGameOutcome('win')).toBe(true);
    expect(isCompletedGameOutcome('draw')).toBe(true);
    expect(isCompletedGameOutcome('loss')).toBe(true);
    expect(isCompletedGameOutcome('cancelled')).toBe(false);
    expect(isCompletedGameOutcome('retired')).toBe(false);
    expect(isCompletedGameOutcome(null)).toBe(false);
  });

  it('el estado cancelled puro no habilita progreso competitivo', () => {
    expect(shouldApplyCompetitiveProgress('cancelled')).toBe(false);
    expect(shouldApplyCompetitiveProgress('win')).toBe(true);
    expect(shouldApplyCompetitiveProgress('win', { learningMode: true })).toBe(false);
    expect(shouldApplyCompetitiveProgress('win', { trainingPosition: true })).toBe(false);
  });

  it('abandono explícito penaliza, pero una sesión recuperable no se convierte en rendición', () => {
    expect(gameExitDisposition({ moveCount: 7, explicitAction: true })).toBe('forfeit');
    expect(gameExitDisposition({ moveCount: 7, explicitAction: false, recoverableSession: true })).toBe('resume');
    expect(gameExitDisposition({ moveCount: 0, explicitAction: true })).toBe('cancel');
  });

  it('abandonar una partida competitiva ya iniciada cuenta como forfeit', () => {
    expect(shouldTreatExitAsForfeit({ moveCount: 7 })).toBe(true);
    expect(shouldTreatExitAsForfeit({ moveCount: 0 })).toBe(false);
    expect(shouldTreatExitAsForfeit({ moveCount: 7, isGameOver: true })).toBe(false);
    expect(shouldTreatExitAsForfeit({ moveCount: 7, learningMode: true })).toBe(false);
    expect(shouldTreatExitAsForfeit({ moveCount: 7, trainingPosition: true })).toBe(false);
  });

  it('no penaliza al jugador negro si abandona después de la apertura automática de la CPU', () => {
    expect(humanMoveCount(1, 'b')).toBe(0);
    expect(gameExitDisposition({ moveCount: humanMoveCount(1, 'b'), explicitAction: true })).toBe('cancel');
    expect(humanMoveCount(2, 'b')).toBe(1);
    expect(gameExitDisposition({ moveCount: humanMoveCount(2, 'b'), explicitAction: true })).toBe('forfeit');
  });

  it('no penaliza hasta que el humano haya perdido realmente una pieza', () => {
    const whiteUntouched = { humanColor: 'w', history: [
      { san: 'e4', captured: false },
      { san: 'e5', captured: false },
      { san: 'Qh5', captured: false },
      { san: 'Nc6', captured: false },
    ] };
    expect(humanHasLostPiece(whiteUntouched)).toBe(false);
    expect(chessGameExitDisposition(whiteUntouched, { explicitAction: true })).toBe('cancel');

    const whiteLostPawn = { ...whiteUntouched, history: [...whiteUntouched.history,
      { san: 'Bc4', captured: false },
      { san: 'Qxh4', captured: true },
    ] };
    expect(humanHasLostPiece(whiteLostPawn)).toBe(true);
    expect(chessGameExitDisposition(whiteLostPawn, { explicitAction: true })).toBe('forfeit');
  });

  it('centraliza el criterio para blancas y negras sin penalizar la apertura automática', () => {
    expect(chessGameExitDisposition({ humanColor: 'b', history: [{ san: 'e4', captured: false }] }, { explicitAction: true })).toBe('cancel');
    expect(chessGameExitDisposition({ humanColor: 'b', history: [{ san: 'e4', captured: false }, { san: 'c5', captured: false }] }, { explicitAction: true })).toBe('cancel');
    expect(chessGameExitDisposition({ humanColor: 'b', history: [
      { san: 'e4', captured: false }, { san: 'c5', captured: false }, { san: 'Bxc5', captured: true },
    ] }, { explicitAction: true })).toBe('forfeit');
  });
});

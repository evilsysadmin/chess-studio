import { describe, expect, it } from 'vitest';
import { isCompletedGameOutcome, shouldApplyCompetitiveProgress, shouldTreatExitAsForfeit } from './gameOutcome.js';

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

  it('abandonar una partida competitiva ya iniciada cuenta como forfeit', () => {
    expect(shouldTreatExitAsForfeit({ moveCount: 7 })).toBe(true);
    expect(shouldTreatExitAsForfeit({ moveCount: 0 })).toBe(false);
    expect(shouldTreatExitAsForfeit({ moveCount: 7, isGameOver: true })).toBe(false);
    expect(shouldTreatExitAsForfeit({ moveCount: 7, learningMode: true })).toBe(false);
    expect(shouldTreatExitAsForfeit({ moveCount: 7, trainingPosition: true })).toBe(false);
  });
});

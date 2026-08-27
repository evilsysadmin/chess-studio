import { describe, expect, it } from 'vitest';
import { canInteractWithPuzzle, canProtectPuzzleStreak, wrongPuzzleAttemptState } from './puzzleAttemptFlow.js';

describe('puzzle attempt flow', () => {
  it('una oferta de proteger racha no forma parte del bloqueo del tablero', () => {
    expect(canInteractWithPuzzle({ status: 'playing', busy: false, rushEnded: false, retryOffer: true })).toBe(true);
    expect(canInteractWithPuzzle({ status: 'playing', busy: true, rushEnded: false })).toBe(false);
    expect(canInteractWithPuzzle({ status: 'revealed', busy: false, rushEnded: false })).toBe(false);
  });

  it('el primer fallo con racha ofrece protección sin negar que hubo fallo', () => {
    expect(wrongPuzzleAttemptState({ wrongThisPuzzle: false, streak: 4 })).toEqual({
      wrongThisPuzzle: true,
      offerProtection: true,
    });
    expect(wrongPuzzleAttemptState({ wrongThisPuzzle: true, streak: 4 }).offerProtection).toBe(false);
  });

  it('la protección sólo se cobra si existe oferta y saldo suficiente', () => {
    expect(canProtectPuzzleStreak({ retryOffer: true, points: 8, cost: 5 })).toBe(true);
    expect(canProtectPuzzleStreak({ retryOffer: true, points: 2, cost: 5 })).toBe(false);
    expect(canProtectPuzzleStreak({ retryOffer: false, points: 8, cost: 5 })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  CANCELLED_GAME_EXIT_NOTICE,
  gameExitTrainingPosition,
  resolveGameExit,
} from './useGameExitFlow.js';

describe('game exit flow decisions', () => {
  it('conserva un resultado ya finalizado en vez de volver a puntuar la partida', () => {
    const result = { gameId: 'g-1', outcome: 'win', title: 'Victoria' };
    expect(resolveGameExit({
      gameId: 'g-1',
      casualResult: result,
      exitDisposition: 'forfeit',
    })).toEqual({ kind: 'completed', notice: result });
  });

  it('distingue abandono competitivo de cancelación inocua', () => {
    expect(resolveGameExit({
      gameId: 'g-2',
      casualResult: null,
      exitDisposition: 'forfeit',
    })).toEqual({ kind: 'forfeit', notice: null });

    expect(resolveGameExit({
      gameId: 'g-3',
      casualResult: null,
      exitDisposition: 'cancel',
    })).toEqual({ kind: 'cancelled', notice: CANCELLED_GAME_EXIT_NOTICE });
  });

  it('marca como entrenamiento sólo los contextos que ya eran no competitivos', () => {
    expect(gameExitTrainingPosition({ lab: true })).toBe(true);
    expect(gameExitTrainingPosition({ rescue: true })).toBe(true);
    expect(gameExitTrainingPosition({ suddenDeath: true })).toBe(true);
    expect(gameExitTrainingPosition({ threatCheck: true })).toBe(false);
    expect(gameExitTrainingPosition({})).toBe(false);
  });
});

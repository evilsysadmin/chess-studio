import { describe, expect, it, vi } from 'vitest';
import { quickMatchRematchHandler, quickMatchRematchPlan } from './quickMatchRematch.js';

const game = { id: 'g1', difficulty: 37, humanColor: 'w' };

describe('quickMatchRematchPlan', () => {
  it('revancha de partida rápida: colores cambiados, mismo reloj y reglas', () => {
    const plan = quickMatchRematchPlan({ game, gameContext: { suddenDeath: true }, timeControlId: 'blitz-5' });
    expect(plan).toEqual({
      difficulty: 37,
      color: 'b',
      options: { timeControlId: 'blitz-5', adaptiveDifficulty: false, suddenDeath: true, threatCheck: false, rematch: true },
    });
  });

  it('si era adaptativa recalibra con el rating actualizado', () => {
    const low = quickMatchRematchPlan({ game, gameContext: { adaptiveDifficulty: true }, rating: { rating: 400, games: 10 } });
    const high = quickMatchRematchPlan({ game, gameContext: { adaptiveDifficulty: true }, rating: { rating: 1600, games: 10 } });
    expect(low.options.adaptiveDifficulty).toBe(true);
    expect(high.difficulty).toBeGreaterThan(low.difficulty);
  });

  it('no ofrece revancha en series, runs, laboratorio, rescate ni aprendizaje', () => {
    expect(quickMatchRematchPlan({ game, activeSeries: { id: 's' } })).toBeNull();
    expect(quickMatchRematchPlan({ game, gameContext: { runMode: 'gauntlet' } })).toBeNull();
    expect(quickMatchRematchPlan({ game, gameContext: { lab: true } })).toBeNull();
    expect(quickMatchRematchPlan({ game, gameContext: { rescue: true } })).toBeNull();
    expect(quickMatchRematchPlan({ game, learningMode: true })).toBeNull();
  });

  it('el handler arranca la partida con el plan en un solo toque', () => {
    const start = vi.fn();
    const plan = quickMatchRematchPlan({ game });
    quickMatchRematchHandler(plan, start)();
    expect(start).toHaveBeenCalledWith(37, 'b', plan.options);
    expect(quickMatchRematchHandler(null, start)).toBeNull();
  });
});

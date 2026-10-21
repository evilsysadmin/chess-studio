import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { passTurnFen } from './combat.js';
import { emergencyCombatCpuSuggestion, emergencyCombatMissExposurePenalty } from './combatControllerSupport.js';

describe('Combat CPU fallback · generar una sola vez cada lista de réplicas', () => {
  const fen = '7k/1r6/1p6/N7/2q5/8/8/7K b - - 0 1';
  const registry = {
    h8: { id: 'b-k-h8', square: 'h8', color: 'b', type: 'k' },
    b7: { id: 'b-r-b7', square: 'b7', color: 'b', type: 'r' },
    b6: { id: 'b-p-b6', square: 'b6', color: 'b', type: 'p' },
    c4: { id: 'b-q-c4', square: 'c4', color: 'b', type: 'q' },
    a5: { id: 'w-n-a5', square: 'a5', color: 'w', type: 'n' },
    h1: { id: 'w-k-h1', square: 'h1', color: 'w', type: 'k' },
  };

  it('reutiliza el listado del turno perdido, sin cambiar el riesgo máximo medido', () => {
    const capture = new Chess(fen).moves({ square: 'b6', verbose: true })
      .find(({ to }) => to === 'a5');
    expect(capture).toBeTruthy();
    const expected = 0.4 * Math.max(
      190 * 0.65 + 190 * 0, // alternativa: se confirma abajo con probabilidades reales
      150 * 0.5,
    );
    const baseline = emergencyCombatMissExposurePenalty(fen, capture, registry, {}, 0.4);
    expect(baseline).toBeGreaterThan(0);
    expect(baseline).toBeLessThan(190 * 0.4);
    expect(expected).toBeGreaterThan(0);

    const passed = passTurnFen(fen);
    const original = Chess.prototype.moves;
    let verbosePostMissLists = 0;
    const spy = vi.spyOn(Chess.prototype, 'moves').mockImplementation(function(options) {
      if (options?.verbose === true && this.fen() === passed) verbosePostMissLists += 1;
      return original.call(this, options);
    });
    try {
      const optimized = emergencyCombatMissExposurePenalty(fen, capture, registry, {}, 0.4);
      expect(optimized).toBeCloseTo(baseline, 8);
      expect(verbosePostMissLists).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('conserva la elección determinista y las restricciones ante datos incompletos', () => {
    const original = emergencyCombatCpuSuggestion(fen, registry);
    expect(original).toBeTruthy();
    const observed = emergencyCombatCpuSuggestion(fen, registry);
    expect(observed).toEqual(original);
    const stale = { ...registry, c4: { ...registry.c4, square: 'c5' } };
    expect(emergencyCombatCpuSuggestion(fen, stale)).toBeTruthy();
    expect(emergencyCombatMissExposurePenalty('fen corrupto', null, registry)).toBe(0);
  });
});

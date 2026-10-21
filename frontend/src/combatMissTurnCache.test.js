import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { createInitialRegistry, passTurnFen } from './combat.js';
import { emergencyCombatCpuSuggestion, emergencyCombatMissExposurePenalty, isLegalCombatCpuSuggestion } from './combatControllerSupport.js';

describe('Combat CPU fallback · turno perdido compartido dentro de la decisión', () => {
  const fen = '7k/8/8/8/3q4/2P1P3/8/7K b - - 0 1';

  it('dos capturas distintas comparten exactamente un tablero y un listado de respuestas tras fallo', () => {
    const chess = new Chess(fen);
    const legal = chess.moves({ square: 'd4', verbose: true });
    const captureLeft = legal.find(({ to, captured }) => to === 'c3' && captured === 'p');
    const captureRight = legal.find(({ to, captured }) => to === 'e3' && captured === 'p');
    expect(captureLeft).toBeTruthy();
    expect(captureRight).toBeTruthy();
    const registry = createInitialRegistry(chess);
    const missedFen = passTurnFen(fen);

    const leftRisk = emergencyCombatMissExposurePenalty(fen, captureLeft, registry, {}, 0.4);
    const rightRisk = emergencyCombatMissExposurePenalty(fen, captureRight, registry, {}, 0.4);
    expect(leftRisk).toBeGreaterThan(0);
    expect(rightRisk).toBeGreaterThan(0);

    const original = Chess.prototype.moves;
    let missedLists = 0;
    const spy = vi.spyOn(Chess.prototype, 'moves').mockImplementation(function(options) {
      if (options?.verbose === true && this.fen() === missedFen) missedLists += 1;
      return original.call(this, options);
    });
    try {
      const first = emergencyCombatCpuSuggestion(fen, registry);
      expect(isLegalCombatCpuSuggestion(fen, first)).toBe(true);
      expect(missedLists).toBe(1);
      const second = emergencyCombatCpuSuggestion(fen, registry);
      expect(second).toEqual(first);
      // El cálculo vuelve a ejecutarse en una decisión nueva, sin cache global.
      expect(missedLists).toBe(2);
    } finally {
      spy.mockRestore();
    }
    expect(chess.fen()).toBe(fen);
    expect(registry.d4.square).toBe('d4');
  });

  it('sin registro o sin posiciones capturables mantiene comportamiento seguro', () => {
    const board = new Chess();
    const initial = board.fen();
    const move = emergencyCombatCpuSuggestion(initial, createInitialRegistry(board));
    expect(isLegalCombatCpuSuggestion(initial, move)).toBe(true);
    expect(emergencyCombatCpuSuggestion(fen)).toBeTruthy();
    expect(emergencyCombatMissExposurePenalty(fen, null, {}, {}, 0.4)).toBe(0);
    expect(emergencyCombatCpuSuggestion('FEN corrupto')).toBeNull();
  });
});

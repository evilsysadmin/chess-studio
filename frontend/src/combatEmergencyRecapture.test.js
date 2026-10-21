import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { emergencyCombatCpuSuggestion, isLegalCombatCpuSuggestion, resolveCombatCpuTurnSuggestion } from './combatControllerSupport.js';

describe('Combat Chess · seguridad de réplica de la CPU de emergencia', () => {
  const fen = 'q5k1/1P6/8/8/8/8/1R6/7K b - - 0 1';
  const registry = {
    a8: { id: 'b-q-a8', color: 'b', type: 'q', square: 'a8' },
    g8: { id: 'b-k-g8', color: 'b', type: 'k', square: 'g8' },
    b7: { id: 'w-p-b7', identityId: 'white-veteran', color: 'w', type: 'p', square: 'b7', strengthPoints: 5 },
    b2: { id: 'w-r-b2', color: 'w', type: 'r', square: 'b2' },
    h1: { id: 'w-k-h1', color: 'w', type: 'k', square: 'h1' },
  };

  it('una dama no se sacrifica por capturar un veterano si una torre puede recapturarla', async () => {
    const board = new Chess(fen);
    expect(board.moves({ square: 'a8', verbose: true }).some((move) => move.to === 'b7' && move.captured === 'p')).toBe(true);
    board.move({ from: 'a8', to: 'b7' });
    expect(board.moves({ square: 'b2', verbose: true }).some((move) => move.to === 'b7' && move.captured === 'q')).toBe(true);

    // Sin datos medidos el fallback sigue siendo la heurística histórica.
    expect(emergencyCombatCpuSuggestion(fen)).toMatchObject({ from: 'a8', to: 'b7' });
    const safer = emergencyCombatCpuSuggestion(fen, registry);
    expect(safer).not.toMatchObject({ from: 'a8', to: 'b7' });
    expect(isLegalCombatCpuSuggestion(fen, safer)).toBe(true);

    const recovered = await resolveCombatCpuTurnSuggestion({
      fen, difficulty: 45, registry,
      analyzePosition: async () => { throw new Error('Workers desconectado'); },
    });
    expect(recovered.source).toBe('local');
    expect(recovered.suggestion).toEqual(safer);
  });

  it('no inventa riesgo con el registro enemigo incompleto', () => {
    const incomplete = { ...registry };
    delete incomplete.b2;
    const move = emergencyCombatCpuSuggestion(fen, incomplete);
    expect(move).toMatchObject({ from: 'a8', to: 'b7' });
    expect(isLegalCombatCpuSuggestion(fen, move)).toBe(true);
    const stale = { ...registry, b2: { ...registry.b2, square: 'b3' } };
    expect(emergencyCombatCpuSuggestion(fen, stale)).toMatchObject({ from: 'a8', to: 'b7' });
    expect(emergencyCombatCpuSuggestion('FEN roto', registry)).toBeNull();
  });

  it('mantiene mate como prioridad absoluta incluso en modo degradado', () => {
    const checkmateFen = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';
    const registryForMate = {
      g6: { id: 'w-q-g6', square: 'g6', color: 'w', type: 'q' },
      f6: { id: 'w-k-f6', square: 'f6', color: 'w', type: 'k' },
      h8: { id: 'b-k-h8', square: 'h8', color: 'b', type: 'k' },
    };
    expect(emergencyCombatCpuSuggestion(checkmateFen, registryForMate)).toMatchObject({
      from: 'g6', to: 'g7',
    });
  });
});

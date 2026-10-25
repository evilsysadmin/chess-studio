import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { createInitialRegistry } from './combat.js';
import { emergencyCombatCpuSuggestion, isLegalCombatCpuSuggestion } from './combatControllerSupport.js';

describe('Combat CPU fallback · reutilizar tablero con make/undo', () => {
  const scenarios = [
    { name: 'apertura poblada', fen: new Chess().fen() },
    { name: 'dos capturas Combat', fen: '7k/8/8/8/3q4/2P1P3/8/7K b - - 0 1' },
    { name: 'promociones', fen: '7k/P7/8/8/8/8/8/7K w - - 0 1' },
    { name: 'mate inmediato', fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1' },
    { name: 'captura al paso', fen: '7k/8/8/3pP3/8/8/8/7K w - d6 0 1' },
  ];

  it.each(scenarios)('$name: deshace cada candidata y mantiene resultado legal', ({ fen }) => {
    const starting = new Chess(fen);
    const legalCount = starting.moves({ verbose: true }).length;
    const registry = createInitialRegistry(starting);
    const undo = Chess.prototype.undo;
    let restored = 0;
    const spy = vi.spyOn(Chess.prototype, 'undo').mockImplementation(function() {
      const undone = undo.call(this);
      if (undone && this.fen() === fen) restored++;
      return undone;
    });
    let move;
    try {
      move = emergencyCombatCpuSuggestion(fen, registry);
      expect(restored).toBe(legalCount);
    } finally {
      spy.mockRestore();
    }
    expect(starting.fen()).toBe(fen);
    expect(isLegalCombatCpuSuggestion(fen, move)).toBe(true);
    expect(emergencyCombatCpuSuggestion(fen, registry)).toEqual(move);
  });

  it('conserva determinismo sin registro, mata cuando debe y degrada FEN inválido', () => {
    const fen = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';
    expect(emergencyCombatCpuSuggestion(fen)).toMatchObject({ from: 'g6', to: 'g7' });
    expect(emergencyCombatCpuSuggestion('FEN inválido')).toBeNull();
  });
});

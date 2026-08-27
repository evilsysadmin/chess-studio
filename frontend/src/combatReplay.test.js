import { describe, expect, it } from 'vitest';
import { buildCombatReplayPositions, DEFAULT_COMBAT_START_FEN } from './combatReplay.js';

describe('Combat replay resiliente', () => {
  it('parte del FEN real de la batalla y no inventa la posición estándar', () => {
    const start = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const after = '4k3/8/8/8/4P3/8/8/4K3 b - - 0 1';
    const replay = buildCombatReplayPositions([{ fenBefore: start, fenAfter: after }]);
    expect(replay.positions[0]).toContain('4P3/4K3 w');
    expect(replay.positions[1]).toContain('4P3/8/8/4K3 b');
    expect(replay.invalidIndices).toEqual([]);
  });

  it('un FEN histórico corrupto conserva el último tablero válido sin romper índices', () => {
    const after = '4k3/8/8/8/4P3/8/8/4K3 b - - 0 1';
    const replay = buildCombatReplayPositions([
      { fenBefore: DEFAULT_COMBAT_START_FEN, fenAfter: after },
      { fenBefore: after, fenAfter: 'cadaver-fen' },
    ]);
    expect(replay.positions).toHaveLength(3);
    expect(replay.positions[2]).toBe(replay.positions[1]);
    expect(replay.invalidIndices).toEqual([1]);
  });
});

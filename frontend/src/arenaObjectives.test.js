import { describe, expect, it } from 'vitest';
import { arenaObjectiveForPreset, arenaObjectiveState } from './arenaObjectives.js';

describe('Arena mission objectives', () => {
  it('Los Dos Puentes sólo completa Ruptura cuando una pieza blanca cruza la línea', () => {
    const before = '4k3/8/8/8/2N5/8/8/4K3 w - - 0 1';
    const after = '4k3/8/2N5/8/8/8/8/4K3 w - - 0 1';
    expect(arenaObjectiveState('twin-bridges', before)).toMatchObject({ id: 'breakthrough', achieved: false, failed: false });
    expect(arenaObjectiveState('twin-bridges', after)).toMatchObject({ id: 'breakthrough', achieved: true, failed: false });
  });

  it('Cabeza de Puente exige 12 plies reales de supervivencia', () => {
    const fen = '4k3/8/8/8/8/8/8/4K2R w K - 0 1';
    expect(arenaObjectiveState('bridgehead', fen, { elapsedPlies: 11 })).toMatchObject({ achieved: false, progress: 11, target: 12 });
    expect(arenaObjectiveState('bridgehead', fen, { elapsedPlies: 12 })).toMatchObject({ achieved: true, progress: 12, target: 12 });
  });

  it('un preset sin misión conserva el ajedrez experimental puro', () => {
    expect(arenaObjectiveForPreset('breach')).toBeNull();
    expect(arenaObjectiveState('breach', '4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBeNull();
  });

  it('un FEN roto no convierte una misión en éxito', () => {
    expect(arenaObjectiveState('bridgehead', 'basura', { elapsedPlies: 99 })).toBeNull();
  });
});

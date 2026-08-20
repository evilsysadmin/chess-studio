import { describe, expect, it } from 'vitest';
import { startMemoryComment, openingMemoryComment, resultMemoryComment } from './cpuMemory.js';

describe('memoria contextual CPU', () => {
  it('recuerda rachas reales', () => {
    const rivalry = { record: { currentStreak: -4, recentGames: [] } };
    expect(startMemoryComment(rivalry, { difficulty: 50 })).toContain('4 derrotas');
  });

  it('recuerda una apertura repetida', () => {
    const rivalry = { record: { recentGames: [
      { opening: 'Defensa Siciliana', outcome: 'loss' },
      { opening: 'Defensa Siciliana', outcome: 'loss' },
    ] } };
    const history = [{ san: 'e4' }, { san: 'c5' }];
    expect(openingMemoryComment(history, rivalry)).toContain('Defensa Siciliana');
  });

  it('comenta el cierre de una serie', () => {
    const text = resultMemoryComment('win', { record: {} }, { series: { winner: 'human', humanWins: 2, cpuWins: 0 } });
    expect(text).toContain('2-0');
  });
});

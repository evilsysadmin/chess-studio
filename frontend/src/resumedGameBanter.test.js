import { beforeEach, describe, expect, it } from 'vitest';
import { resolveRestoredGameContext } from './useActiveSessionRestore.js';
import { startMemoryComment } from './cpuMemory.js';
import { appendActiveGameChat, loadActiveGameChat } from './gameChat.js';
import { clearStorageMemoryFallback } from './safeStorage.js';

describe('Matthias banter after active-game restore', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
  });

  it('marks restored contexts with the restored game id without losing real mode flags', () => {
    expect(resolveRestoredGameContext(
      { gameContext: { lab: true, rematch: true } },
      { id: 'g-1' },
      null,
    )).toEqual({ lab: true, rematch: true, resumed: 'g-1' });

    expect(resolveRestoredGameContext(
      { gameContext: {} },
      { id: 'g-2' },
      { active: true, currentGameId: 'g-2', mode: 'boss' },
    )).toEqual({ runMode: 'boss', resumed: 'g-2' });

    expect(resolveRestoredGameContext(
      { gameContext: {} },
      { id: 'g-3' },
      null,
    )).toEqual({ resumed: 'g-3' });
  });

  it('does not generate start banter again for the resumed game', () => {
    const rivalry = { record: { currentStreak: -3, recentGames: [] } };
    expect(startMemoryComment(rivalry, { difficulty: 50 })).toContain('3 derrotas');
    expect(startMemoryComment(rivalry, { difficulty: 50, resumed: 'g-1' })).toBeNull();
    expect(startMemoryComment(rivalry, { rescue: true, resumed: 'g-1' })).toBeNull();
  });

  it('does not let a resumed marker silence the next newly-created series game', () => {
    const rivalry = { record: { currentStreak: -3, recentGames: [] } };
    const restoredSeries = { currentGameId: 'g-old', games: [] };
    const nextSeriesGame = { currentGameId: 'g-new', games: [] };

    expect(startMemoryComment(rivalry, {
      difficulty: 50,
      resumed: 'g-old',
      series: restoredSeries,
    })).toBeNull();

    expect(startMemoryComment(rivalry, {
      difficulty: 50,
      resumed: 'g-old',
      series: nextSeriesGame,
    })).toContain('3 derrotas');
  });

  it('keeps an active transcript idempotent across refresh-style duplicate inserts', () => {
    const text = 'Vienes de 3 derrotas consecutivas. Bonito volver a ver a un cliente recurrente.';
    const first = appendActiveGameChat('g-4', { text });
    expect(first).toHaveLength(1);

    const repeated = appendActiveGameChat('g-4', { text });
    expect(repeated).toHaveLength(1);
    expect(repeated[0].id).toBe(first[0].id);
    expect(loadActiveGameChat('g-4')).toHaveLength(1);

    const next = appendActiveGameChat('g-4', { text: 'Eso sí era una jugada nueva.' });
    expect(next).toHaveLength(2);
  });
});

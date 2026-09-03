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

  it('marks restored contexts as resumed without losing their real mode flags', () => {
    expect(resolveRestoredGameContext(
      { gameContext: { lab: true, rematch: true } },
      { id: 'g-1' },
      null,
    )).toEqual({ lab: true, rematch: true, resumed: true });

    expect(resolveRestoredGameContext(
      { gameContext: {} },
      { id: 'g-2' },
      { active: true, currentGameId: 'g-2', mode: 'boss' },
    )).toEqual({ runMode: 'boss', resumed: true });

    expect(resolveRestoredGameContext(
      { gameContext: {} },
      { id: 'g-3' },
      null,
    )).toEqual({ resumed: true });
  });

  it('does not generate start banter again for a resumed game', () => {
    const rivalry = { record: { currentStreak: -3, recentGames: [] } };
    expect(startMemoryComment(rivalry, { difficulty: 50 })).toContain('3 derrotas');
    expect(startMemoryComment(rivalry, { difficulty: 50, resumed: true })).toBeNull();
    expect(startMemoryComment(rivalry, { rescue: true, resumed: true })).toBeNull();
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

import { beforeEach, describe, expect, it } from 'vitest';
import { loadGameHistory, saveGameRecord, updateGameRecordChat } from './gameHistory.js';

describe('gameHistory transcript', () => {
  beforeEach(() => localStorage.clear());

  it('añade comentarios tardíos al registro ya archivado sin duplicarlo', () => {
    saveGameRecord({ id: 'rec-1', sourceGameId: 'game-7', moves: [], gameChat: [] });
    updateGameRecordChat('game-7', [{ id: 'm1', text: 'Jaque mate. La ceremonia ha terminado.' }]);
    const history = loadGameHistory();
    expect(history).toHaveLength(1);
    expect(history[0].gameChat).toHaveLength(1);
    expect(history[0].gameChat[0].text).toContain('ceremonia');
  });
});

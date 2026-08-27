import { beforeEach, describe, expect, it } from 'vitest';
import { isCompetitiveHistoryRecord, isStatisticalHistoryRecord, loadGameHistory, saveGameRecord, statisticalHistoryRecords, updateGameRecordChat } from './gameHistory.js';

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


describe('game history statistical contract', () => {
  it('excluye cancelaciones y abandonos sin penalización de estadísticas/AI', () => {
    expect(isStatisticalHistoryRecord({ outcome: 'cancelled' })).toBe(false);
    expect(isStatisticalHistoryRecord({ outcome: 'loss', endReason: 'abandoned-no-penalty' })).toBe(false);
    expect(isStatisticalHistoryRecord({ outcome: 'loss', noPenalty: true })).toBe(false);
    expect(isStatisticalHistoryRecord({ outcome: 'loss', endReason: 'resignation' })).toBe(true);
    expect(isCompetitiveHistoryRecord({ outcome: 'loss', endReason: 'abandoned-no-penalty', mode: 'casual' })).toBe(false);
  });
});

describe('filtrado de historial estadístico', () => {
  it('entrega a consumidores sólo partidas válidas para estadísticas y AI', () => {
    const filtered = statisticalHistoryRecords([
      { id: 'win', outcome: 'win' },
      { id: 'cancelled', outcome: 'cancelled' },
      { id: 'free-exit', outcome: 'loss', endReason: 'abandoned-no-penalty' },
      { id: 'resign', outcome: 'loss', endReason: 'resignation' },
    ]);
    expect(filtered.map((record) => record.id)).toEqual(['win', 'resign']);
  });
});

import { describe, expect, it } from 'vitest';
import { findHistoryRecordByGameId } from './useReplayLibrary.js';

const records = [
  { id: 'archive-row-1', sourceGameId: 'game-1', outcome: 'win' },
  { id: 'game-2', outcome: 'loss' },
  { id: 'combat-row', gameId: 'combat-7', log: [] },
];

describe('exact history source lookup', () => {
  it('prioriza sourceGameId sin depender del id archivado', () => {
    expect(findHistoryRecordByGameId(records, 'game-1')?.id).toBe('archive-row-1');
  });

  it('acepta ids directos y gameId de otros tipos de historial', () => {
    expect(findHistoryRecordByGameId(records, 'game-2')?.id).toBe('game-2');
    expect(findHistoryRecordByGameId(records, 'combat-7')?.id).toBe('combat-row');
  });

  it('no inventa destino si la partida fuente desapareció', () => {
    expect(findHistoryRecordByGameId(records, 'missing')).toBeNull();
  });
});

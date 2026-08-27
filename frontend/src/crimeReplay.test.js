import { describe, expect, it } from 'vitest';
import { buildGameCrimeReplayRecord } from './crimeReplay.js';

describe('crime replay record', () => {
  it('construye un replay autónomo sin depender de metadata fuera de scope', () => {
    const game = {
      id: 'g1', difficulty: 50, humanColor: 'b', fen: 'fen-final', initialFen: 'fen-inicial',
      history: [{ san: 'a1=N', from: 'a2', to: 'a1', promotion: 'n' }],
    };
    const record = buildGameCrimeReplayRecord(game, 'lab', 'draw');
    expect(record).toMatchObject({ id: 'crime-g1', mode: 'lab', outcome: 'draw', initialFen: 'fen-inicial', endReason: null });
    expect(record.moves[0].promotion).toBe('n');
  });

  it('rechaza entradas incompletas sin lanzar', () => {
    expect(buildGameCrimeReplayRecord(null, 'casual', 'loss')).toBeNull();
    expect(buildGameCrimeReplayRecord({ id: 'x' }, 'casual', 'loss')).toBeNull();
  });
});

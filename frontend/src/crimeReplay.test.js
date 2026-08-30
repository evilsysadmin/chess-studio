import { describe, expect, it } from 'vitest';
import { buildGameCrimeReplayRecord, crimeRetryLaunch } from './crimeReplay.js';

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

describe('crime retry launch', () => {
  const record = { id: 'crime-g1', humanColor: 'w', difficulty: 73, moves: [] };
  const fenBefore = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const pinnedReport = { index: 2, moveNumber: 2 };

  it('sólo aparece exactamente antes del crimen y arranca como rescate sin rating', () => {
    const launch = crimeRetryLaunch(fenBefore, record, { crimeMode: true, pinnedReport, step: 2 });
    expect(launch).toMatchObject({
      humanColor: 'w',
      difficulty: 73,
      meta: { rescue: true, crimeRetry: true, sourceRecord: record },
    });
    expect(launch.fen).toContain(' w ');
    expect(crimeRetryLaunch(fenBefore, record, { crimeMode: true, pinnedReport, step: 3 })).toBeNull();
  });

  it('no ofrece una revancha imposible o fuera de Cámara del crimen', () => {
    expect(crimeRetryLaunch(fenBefore, record, { crimeMode: false, pinnedReport, step: 2 })).toBeNull();
    expect(crimeRetryLaunch('basura', record, { crimeMode: true, pinnedReport, step: 2 })).toBeNull();
    expect(crimeRetryLaunch(fenBefore.replace(' w ', ' b '), record, { crimeMode: true, pinnedReport, step: 2 })).toBeNull();
  });
});

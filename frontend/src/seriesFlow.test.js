import { describe, expect, it } from 'vitest';
import { SERIES_FLOW, assertSeriesFlowInvariant, attachSeriesGame, seriesFlowPhase } from './seriesFlow.js';

describe('series flow', () => {
  const ready = { bestOf: 3, winner: null, currentGameId: null };
  it('sólo una serie ready puede adoptar una partida activa', () => {
    const playing = attachSeriesGame(ready, 'g-1');
    expect(seriesFlowPhase(playing)).toBe(SERIES_FLOW.PLAYING);
    expect(attachSeriesGame(playing, 'g-2')).toBe(playing);
    expect(() => assertSeriesFlowInvariant(playing)).not.toThrow();
  });
  it('una serie terminada no puede conservar partida activa', () => {
    expect(() => assertSeriesFlowInvariant({ ...ready, winner: 'human', currentGameId: 'g-zombie' })).toThrow(/finished series/i);
  });
});

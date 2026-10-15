import { describe, expect, it } from 'vitest';
import { buildInsightsPositionAutopsy } from './insightsPositionAutopsy.js';

const puzzle = {
  id: 'personal-real-1',
  source: 'autopsy',
  sourceGameId: 'game-27',
  fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1',
  played: 'Kd2',
  solution: ['Ra8+'],
  loss: 190,
};

describe('buildInsightsPositionAutopsy · reconstruction and provenance', () => {
  it('compares the stored played and preferred moves from exactly the same FEN', () => {
    const result = buildInsightsPositionAutopsy(puzzle);
    expect(result?.orientation).toBe('w');
    expect(result?.lossCp).toBe(190);
    expect(result?.views.map((view) => view.id)).toEqual(['before', 'played', 'preferred']);
    expect(result?.views[0].fen).toBe(puzzle.fen);
    expect(result?.views[1].move).toMatchObject({ san: 'Kd2', from: 'e1', to: 'd2' });
    expect(result?.views[2].move).toMatchObject({ san: 'Ra8+', from: 'a1', to: 'a8' });
    expect(result.views[1].fen).not.toBe(result.views[2].fen);
  });

  it('keeps the original board orientation even though each comparison changes turn', () => {
    const result = buildInsightsPositionAutopsy({
      ...puzzle,
      fen: 'r3k3/8/8/8/8/8/8/4K3 b q - 0 1',
      played: 'Kd7',
      solution: ['Ra1+'],
    });
    expect(result?.orientation).toBe('b');
    expect(result?.views[1].fen.split(' ')[1]).toBe('w');
    expect(result?.views[2].fen.split(' ')[1]).toBe('w');
  });

  it('fails closed without a real autopsy origin, measured loss or reconstructible two-way move', () => {
    expect(buildInsightsPositionAutopsy({ ...puzzle, source: 'workers-ai-validated' })).toBeNull();
    expect(buildInsightsPositionAutopsy({ ...puzzle, loss: null })).toBeNull();
    expect(buildInsightsPositionAutopsy({ ...puzzle, loss: 20 })).toBeNull();
    expect(buildInsightsPositionAutopsy({ ...puzzle, played: 'Qxe8#' })).toBeNull();
    expect(buildInsightsPositionAutopsy({ ...puzzle, solution: ['Kd2'] })).toBeNull();
    expect(buildInsightsPositionAutopsy({ ...puzzle, fen: 'not a fen' })).toBeNull();
    expect(buildInsightsPositionAutopsy({ ...puzzle, played: '' })).toBeNull();
  });
});

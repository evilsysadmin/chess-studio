import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadCleanGameRecords: vi.fn(),
  buildPlayerModel: vi.fn(),
}));

vi.mock('../cleanGames.js', () => ({
  CLEAN_GAME_MIN_ANALYZED_MOVES: 8,
  loadCleanGameRecords: mocks.loadCleanGameRecords,
}));

vi.mock('../playerModel.js', () => ({
  buildPlayerModel: mocks.buildPlayerModel,
}));

import InsightsCleanGames from './InsightsCleanGames.jsx';

function model(cleanPlay) {
  return { cleanPlay };
}

describe('InsightsCleanGames · Player Model wiring', () => {
  beforeEach(() => {
    mocks.loadCleanGameRecords.mockReset();
    mocks.buildPlayerModel.mockReset();
  });

  it('renders clean-play facts from Player Model instead of calculating a parallel summary', () => {
    const records = { g1: { version: 1, sufficientSample: true, clean: true } };
    mocks.loadCleanGameRecords.mockReturnValue(records);
    mocks.buildPlayerModel.mockReturnValue(model({
      eligibleGames: 3,
      cleanGames: 2,
      cleanRate: 67,
      currentStreak: 1,
      bestStreak: 2,
      latestEligibleClean: false,
      latestEligibleAt: '2026-09-13T10:00:00.000Z',
      latestCleanAt: '2026-09-12T10:00:00.000Z',
    }));

    const html = renderToStaticMarkup(<InsightsCleanGames />);

    expect(mocks.loadCleanGameRecords).toHaveBeenCalledTimes(1);
    expect(mocks.buildPlayerModel).toHaveBeenCalledWith({ cleanGameRecords: records });
    expect(html).toContain('2/3');
    expect(html).toContain('67%');
    expect(html).toContain('racha limpia actual');
    expect(html).toContain('mejor racha limpia');
    expect(html).toContain('Con incidencias');
    expect(html).toContain('data-clean-game-summary="true"');
  });

  it('keeps the existing no-sample empty state when Player Model has no eligible clean-play evidence', () => {
    mocks.loadCleanGameRecords.mockReturnValue({});
    mocks.buildPlayerModel.mockReturnValue(model({
      eligibleGames: 0,
      cleanGames: 0,
      cleanRate: null,
      currentStreak: 0,
      bestStreak: 0,
      latestEligibleClean: null,
      latestEligibleAt: null,
      latestCleanAt: null,
    }));

    const html = renderToStaticMarkup(<InsightsCleanGames />);

    expect(html).toContain('Aún no hay muestra suficiente.');
    expect(html).not.toContain('data-clean-game-summary="true"');
  });
});

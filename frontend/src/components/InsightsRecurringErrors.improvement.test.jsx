import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildPlayerModel: vi.fn(),
  loadCleanGameRecords: vi.fn(),
  loadPersonalPuzzles: vi.fn(),
}));

vi.mock('../cleanGames.js', () => ({
  loadCleanGameRecords: mocks.loadCleanGameRecords,
}));

vi.mock('../personalPuzzles.js', () => ({
  loadPersonalPuzzles: mocks.loadPersonalPuzzles,
}));

vi.mock('../playerModel.js', () => ({
  buildPlayerModel: mocks.buildPlayerModel,
  PATTERN_IMPROVEMENT_STATES: {
    NO_SAMPLE: 'no-sample',
    STILL_OCCURRING: 'still-occurring',
    PROBABLE_IMPROVEMENT: 'probable-improvement',
    CORRECTED_WITH_SUFFICIENT_SAMPLE: 'corrected-with-sufficient-sample',
  },
}));

import InsightsRecurringErrors from './InsightsRecurringErrors.jsx';

function pattern(overrides = {}) {
  return {
    incidentKey: 'human:MISSED_MATE',
    label: 'Mates que dejaste escapar',
    positions: 2,
    sourceGames: 2,
    maxLoss: 420,
    pending: 0,
    filter: { incidentKey: 'human:MISSED_MATE' },
    debt: { paid: true, target: 2, progress: 2 },
    improvementState: 'probable-improvement',
    ...overrides,
  };
}

describe('InsightsRecurringErrors improvement state', () => {
  beforeEach(() => {
    mocks.buildPlayerModel.mockReset();
    mocks.loadCleanGameRecords.mockReset();
    mocks.loadPersonalPuzzles.mockReset();
    mocks.loadPersonalPuzzles.mockReturnValue([{ id: 'p1' }]);
    mocks.loadCleanGameRecords.mockReturnValue({ g1: { gameId: 'g1' } });
  });

  it('feeds both training positions and covered autopsies into the Player Model', () => {
    mocks.buildPlayerModel.mockReturnValue({ recurringErrors: [pattern()] });

    renderToStaticMarkup(<InsightsRecurringErrors />);

    expect(mocks.buildPlayerModel).toHaveBeenCalledWith({
      personalPuzzles: [{ id: 'p1' }],
      cleanGameRecords: { g1: { gameId: 'g1' } },
    });
  });

  it('replaces paid-debt copy with measured improvement instead of adding another status line', () => {
    mocks.buildPlayerModel.mockReturnValue({ recurringErrors: [pattern()] });

    const html = renderToStaticMarkup(<InsightsRecurringErrors />);

    expect(html).toContain('Mejora probable');
    expect(html).not.toContain('Deuda pagada');
    expect(html).toContain('data-training-debt="paid"');
    expect(html).toContain('data-improvement-state="probable-improvement"');
  });

  it('keeps training completion scoped when there is not yet a post-training sample', () => {
    mocks.buildPlayerModel.mockReturnValue({
      recurringErrors: [pattern({ improvementState: 'no-sample' })],
    });

    const html = renderToStaticMarkup(<InsightsRecurringErrors />);

    expect(html).toContain('Entrenamiento completado');
    expect(html).toContain('falta observar nuevas partidas');
    expect(html).not.toContain('Mejora probable');
    expect(html).not.toContain('Corregido con muestra suficiente');
    expect(html).toContain('data-training-debt="paid"');
    expect(html).toContain('data-improvement-state="no-sample"');
  });
});

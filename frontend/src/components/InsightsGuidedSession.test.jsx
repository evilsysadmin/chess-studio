import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../guidedTrainingSession.js', () => ({
  advanceGuidedTrainingSession: vi.fn(),
  clearGuidedTrainingSession: vi.fn(),
  loadGuidedTrainingSession: () => null,
  startGuidedTrainingSession: vi.fn(),
  buildGuidedTrainingPlan: ({ minutes }) => ({
    minutes,
    available: true,
    reason: null,
    steps: [
      {
        id: `focus-${minutes}`,
        kind: 'debt',
        title: 'Foco real',
        detail: 'Basado en evidencia.',
        action: 'personal-filter',
        filter: { incidentKey: 'human:MISSED_MATE' },
        minutes,
      },
    ],
  }),
}));

import InsightsGuidedSession from './InsightsGuidedSession.jsx';

describe('InsightsGuidedSession time budgets', () => {
  it('ofrece 5, 15 y 30 minutos sin crear una superficie separada', () => {
    const html = renderToStaticMarkup(<InsightsGuidedSession gameHistory={[]} />);

    expect(html).toContain('Tengo 5 min');
    expect(html).toContain('Tengo 15 min');
    expect(html).toContain('Tengo 30 min');
    expect(html).toContain('En 5 minutos concentra todo en un único foco');
    expect(html).toContain('cada recorrido respeta ese presupuesto');
  });
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InsightsCareerArchiveSection from './InsightsCareerArchiveSection.jsx';

const base = {
  career: { byTimeControl: {}, milestones: [] },
  run: null, themes: [{ id: 'classic' }], theme: 'classic', cemetery: [],
  onStartRun: () => {}, onContinueRun: () => {},
  onOpenRecord: () => {}, onMovie: () => {}, onThemeChange: () => {},
};

describe('Career archive extraction', () => {
  it('keeps archived runs, locked board themes and truthful empty cemetery', () => {
    const html = renderToStaticMarkup(<InsightsCareerArchiveSection {...base} />);
    expect(html).toContain('Modos de presión y campeonatos');
    expect(html).not.toContain('Rivalidad por ritmo');
    expect(html).toContain('Tableros desbloqueables');
    expect(html).toContain('Cementerio de partidas');
    expect(html).toContain('Vacío. Sospechosamente saludable');
    expect(html).toContain('disabled');
  });

  it('keeps real saved runs, records, modes and milestones visible', () => {
    const html = renderToStaticMarkup(<InsightsCareerArchiveSection {...base}
      career={{
        byTimeControl: { '3+2': { wins: 2, draws: 1, losses: 0, games: 3 } },
        milestones: [{ id: 'm1', type: 'contract-win', text: 'Victoria registrada', date: '2026-10-01T00:00:00Z' }],
      }}
      run={{ active: true, mode: 'cup', difficulty: 55, completedStages: 3, points: 2.5 }}
      cemetery={[{
        id: 'loss1', date: '2026-10-02T00:00:00Z', difficulty: 70,
        opening: 'Italiana', moves: ['e4', 'e5', 'Nf3', 'Nc6'],
      }]}
    />);
    expect(html).toContain('3+2 Blitz');
    expect(html).toContain('2V · 1T · 0D');
    expect(html).toContain('Continuar Copa');
    expect(html).toContain('3/8');
    expect(html).toContain('Italiana');
    expect(html).toContain('Revisar');
    expect(html).toContain('Película');
    expect(html).toContain('Victoria registrada');
  });
});
